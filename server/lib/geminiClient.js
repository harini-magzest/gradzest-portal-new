// Alternate backend for Zest, usable with a free Gemini API key when no Anthropic key is
// available (e.g. for local testing). See server/lib/zestModel.js for how the two backends are
// selected — production should still run on anthropicClient.js once a real key exists.
// Implements the exact same askZest(...)/isZestConfigured() contract as anthropicClient.js, and
// reuses its system-prompt content via buildSystemPrompt so the two backends never drift apart.

let GoogleGenAI, createPartFromFunctionResponse;
try {
  ({ GoogleGenAI, createPartFromFunctionResponse } = require('@google/genai'));
} catch {
  // Not installed in some environment — isZestConfigured() below gates every real call.
}

const { getToolsForRole, executeTool, statusFor } = require('./zestTools');
const { buildSystemPrompt, todayIST, MAX_TOOL_ROUNDS, MAX_OUTPUT_TOKENS, trimIncompleteAnswer } = require('./zestPrompt');
const { withRetry, isTransient } = require('./zestRetry');

// One model request is cut off after this long. Without a limit a stalled request holds the person's chat open for
// minutes (seen: 130s+ on an overloaded model) instead of failing over to the fallback model. Applies per attempt.
const REQUEST_TIMEOUT_MS = Number(process.env.ZEST_AI_TIMEOUT_MS) || 40000;

let client = null;
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
  return client;
}

// How much a model "thinks" before answering is what makes replies slow, and because thinking tokens count against
// maxOutputTokens it is also what cuts answers short. Zest answers short lookups, so ask for the least. The setting
// is named differently per model generation (2.x: a token budget, 0 = off; 3.x: a named level, and "minimal" is not
// accepted by every Flash), so it is chosen per model. ZEST_THINKING overrides: a number (budget),
// minimal|low|medium|high (level), or "default" to send nothing and let the model decide.
function thinkingConfigFor(model) {
  const setting = String(process.env.ZEST_THINKING || '').trim().toLowerCase();
  if (setting === 'default') return undefined;
  if (/^\d+$/.test(setting)) return { thinkingBudget: Number(setting) };
  if (['minimal', 'low', 'medium', 'high'].includes(setting)) return { thinkingLevel: setting };
  return /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
}

// Models that answered 400 to the thinking setting above (the API's message does not say which field it dislikes),
// so later requests skip it instead of paying for a failed call each time.
const rejectsThinkingConfig = new Set();

// Test-only seam, mirrors anthropicClient.js's setAnthropicClientForTests.
function setGeminiClientForTests(fakeClient) {
  client = fakeClient;
}

function isZestConfigured() {
  return !!(process.env.GEMINI_API_KEY && GoogleGenAI);
}

// Anthropic's `input_schema` and Gemini's `parametersJsonSchema` are both plain JSON Schema —
// only the field name differs, so this is a rename, not a format conversion.
function toGeminiTools(role) {
  const tools = getToolsForRole(role);
  if (!tools.length) return undefined;
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name, description: t.description, parametersJsonSchema: t.input_schema,
    })),
  }];
}

// Without onText this is a plain generateContent call. With it, the turn is streamed and its
// parts are reassembled into the same shape generateContent returns, so the tool loop below is
// identical either way.
//
// A failure after some text has already reached the caller must not be retried: the retry would
// stream the start of the answer a second time. Such errors are marked so withRetry gives up.
async function runTurn(params, onText) {
  if (!onText) return getClient().models.generateContent(params);
  let emitted = false;
  try {
    const stream = await getClient().models.generateContentStream(params);
    const parts = [];
    let finishReason;
    for await (const chunk of stream) {
      finishReason = chunk.candidates?.[0]?.finishReason || finishReason;
      for (const part of chunk.candidates?.[0]?.content?.parts || []) {
        parts.push(part);
        if (typeof part.text === 'string' && !part.thought && !part.functionCall) { emitted = true; onText(part.text); }
      }
    }
    const functionCalls = parts.filter(p => p.functionCall).map(p => p.functionCall);
    return {
      text: parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join(''),
      functionCalls: functionCalls.length ? functionCalls : undefined,
      candidates: [{ content: { role: 'model', parts }, finishReason }],
    };
  } catch (err) {
    if (emitted && err && typeof err === 'object') err.zestPartial = true;
    throw err;
  }
}

/**
 * Same signature and return shape as anthropicClient.js's askZest — see that file for param docs.
 * @returns {Promise<{ text: string, toolsUsed: string[] }>}
 */
async function askZest(question, chunks, history = [], role = 'student', attachedDocText = '', user = null, onText = null, ctx = {}) {
  if (!isZestConfigured()) throw new Error('Zest is not configured (missing GEMINI_API_KEY)');

  const context = chunks.length
    ? chunks.map((c, i) => `[Source ${i + 1}: ${c.title}]\n${c.text}`).join('\n\n---\n\n')
    : '(No matching knowledge-base reference material was found for this question.)';
  const attachedBlock = attachedDocText
    ? `\n\nAttached document (provided by the user for this question only):\n${attachedDocText}`
    : '';

  const contents = [
    ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: `Knowledge-base reference material:\n\n${context}${attachedBlock}\n\nQuestion: ${question}` }] },
  ];

  const tools = toGeminiTools(role);
  const toolsUsed = [];
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  // When the main model stays overloaded after retries, a lighter model almost always still answers.
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
  let model = primaryModel;
  const config = {
    systemInstruction: buildSystemPrompt(role, { today: todayIST(), name: user?.name }),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // We run our own manual tool loop (scoping lives in executeTool) — never let the SDK
    // auto-invoke anything on our behalf.
    automaticFunctionCalling: { disable: true },
  };
  if (tools) config.tools = tools;

  // One turn on the current model, with the least thinking that model allows. If the API refuses that setting the turn
  // is repeated once without it: a model we guessed wrong about must still answer, just a little slower.
  const runOnModel = async () => {
    const thinkingConfig = rejectsThinkingConfig.has(model) ? undefined : thinkingConfigFor(model);
    const withThinking = thinkingConfig ? { ...config, thinkingConfig } : config;
    try {
      return await withRetry(() => runTurn({ model, contents, config: withThinking }, onText));
    } catch (err) {
      // A 400 about the key is a real configuration error, not a thinking-setting problem: report it at once.
      if (!thinkingConfig || Number(err?.status ?? err?.code) !== 400 || /api[ _-]?key/i.test(String(err?.message))) throw err;
      rejectsThinkingConfig.add(model);
      return withRetry(() => runTurn({ model, contents, config }, onText));
    }
  };

  const generate = async () => {
    try {
      return await runOnModel();
    } catch (err) {
      if (model === primaryModel && fallbackModel && fallbackModel !== primaryModel && isTransient(err)) {
        model = fallbackModel;
        return runOnModel();
      }
      throw err;
    }
  };
  let response = await generate();

  // Tool-use loop, mirroring anthropicClient.js's: Gemini asks for live data via functionCalls,
  // we fetch it (scoped to `user`) and hand it back as functionResponse parts, capped so a
  // confused model can't loop forever.
  for (let round = 0; round < MAX_TOOL_ROUNDS && response.functionCalls?.length; round++) {
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    const responseParts = [];
    for (const call of response.functionCalls) {
      toolsUsed.push(call.name);
      ctx.onStatus?.(statusFor(call.name));
      const result = await executeTool(call.name, call.args, user, ctx);
      responseParts.push(createPartFromFunctionResponse(call.id || call.name, call.name, result));
    }
    contents.push({ role: 'user', parts: responseParts });

    response = await generate();
  }

  let text = response.text || '';
  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') text = trimIncompleteAnswer(text);
  return { text, toolsUsed };
}

module.exports = { askZest, isZestConfigured, setGeminiClientForTests };
