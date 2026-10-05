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

const { getToolsForRole, executeTool } = require('./zestTools');
const { buildSystemPrompt, todayIST, MAX_OUTPUT_TOKENS } = require('./anthropicClient');
const { withRetry, isTransient } = require('./zestRetry');

let client = null;
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

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

const MAX_TOOL_ROUNDS = 4;

// Without onText this is a plain generateContent call. With it, the turn is streamed and its
// parts are reassembled into the same shape generateContent returns, so the tool loop below is
// identical either way.
async function runTurn(params, onText) {
  if (!onText) return getClient().models.generateContent(params);
  const stream = await getClient().models.generateContentStream(params);
  const parts = [];
  for await (const chunk of stream) {
    for (const part of chunk.candidates?.[0]?.content?.parts || []) {
      parts.push(part);
      if (typeof part.text === 'string' && !part.thought && !part.functionCall) onText(part.text);
    }
  }
  const functionCalls = parts.filter(p => p.functionCall).map(p => p.functionCall);
  return {
    text: parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join(''),
    functionCalls: functionCalls.length ? functionCalls : undefined,
    candidates: [{ content: { role: 'model', parts } }],
  };
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

  const generate = async () => {
    try {
      return await withRetry(() => runTurn({ model, contents, config }, onText));
    } catch (err) {
      if (model === primaryModel && fallbackModel && fallbackModel !== primaryModel && isTransient(err)) {
        model = fallbackModel;
        return withRetry(() => runTurn({ model, contents, config }, onText));
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
      const result = await executeTool(call.name, call.args, user, ctx);
      responseParts.push(createPartFromFunctionResponse(call.id || call.name, call.name, result));
    }
    contents.push({ role: 'user', parts: responseParts });

    response = await generate();
  }

  return { text: response.text || '', toolsUsed };
}

module.exports = { askZest, isZestConfigured, setGeminiClientForTests };
