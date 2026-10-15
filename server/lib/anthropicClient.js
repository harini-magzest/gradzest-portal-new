// Thin wrapper around the Claude API for Zest. Retrieval (which KB chunks to show Claude)
// happens in routes/zest.js via Mongo $text search — this module turns those chunks + the
// portal guide + the question into an answer, tailored to who's asking, and runs the tool-use
// loop against server/lib/zestTools.js when Zest needs live data instead of just text.

let Anthropic;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch {
  // Not installed in some environment — isZestConfigured() below gates every real call.
}

const { getToolsForRole, executeTool, statusFor } = require('./zestTools');
const { withRetry } = require('./zestRetry');
const { buildSystemPrompt, buildSystemBlocks, todayIST, MAX_TOOL_ROUNDS, MAX_OUTPUT_TOKENS, trimIncompleteAnswer } = require('./zestPrompt');

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Test-only seam, same shape as initCriticalAlert's mailer injection (lib/criticalAlert.js) —
// lets tests substitute a fake { messages: { create, stream } } client instead of hitting the
// real Anthropic API. Never called in production: nothing in server/ invokes this outside tests.
function setAnthropicClientForTests(fakeClient) {
  client = fakeClient;
}

function isZestConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY && Anthropic);
}

// A failure after some text has already reached the caller is marked so withRetry does not replay it:
// a retry would stream the start of the answer a second time.
function callModel(params, onText) {
  if (!onText) return getClient().messages.create(params);
  let emitted = false;
  const stream = getClient().messages.stream(params);
  stream.on('text', (delta) => { emitted = true; onText(delta); });
  return stream.finalMessage().catch((err) => {
    if (emitted && err && typeof err === 'object') err.zestPartial = true;
    throw err;
  });
}

/**
 * @param {string} question
 * @param {{ title: string, text: string }[]} chunks  top-matching knowledge-base chunks for this turn
 * @param {{ role: 'user'|'assistant', text: string }[]} history  prior turns in this conversation, oldest first
 * @param {string} role  the asking user's portal role ('student'|'counselor'|'admin'), or 'guest' when signed out
 * @param {string} [attachedDocText]  text of a one-off document the user attached to this turn, if any
 * @param {{ id: string, role: string }} [user]  the authenticated caller, for tool scoping (required if role !== 'student')
 * @param {(delta: string) => void} [onText]  if given, receives answer text as it is generated
 * @param {{ ip?: string, io?: object, onStatus?: (text: string) => void }} [ctx]  request context: ip/io for the PII access
 *   audit, and an optional callback told in plain words which lookup is running
 * @returns {Promise<{ text: string, toolsUsed: string[], usage: { inputTokens: number, outputTokens: number,
 *   cacheReadTokens: number, cacheWriteTokens: number } }>}  usage is summed over every model call this answer took
 */
async function askZest(question, chunks, history = [], role = 'student', attachedDocText = '', user = null, onText = null, ctx = {}) {
  if (!isZestConfigured()) throw new Error('Zest is not configured (missing ANTHROPIC_API_KEY)');

  const context = chunks.length
    ? chunks.map((c, i) => `[Source ${i + 1}: ${c.title}]\n${c.text}`).join('\n\n---\n\n')
    : '(No matching knowledge-base reference material was found for this question.)';

  const attachedBlock = attachedDocText
    ? `\n\nAttached document (provided by the user for this question only):\n${attachedDocText}`
    : '';

  // Reference material is attached only to the current turn — it was retrieved for *this*
  // question, not the earlier ones, so repeating it on every turn would just be noise.
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.text })),
    { role: 'user', content: `Knowledge-base reference material:\n\n${context}${attachedBlock}\n\nQuestion: ${question}` },
  ];

  const tools = getToolsForRole(role);
  const toolsUsed = [];
  const createParams = {
    model: process.env.ZEST_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: MAX_OUTPUT_TOKENS,
    system: buildSystemBlocks(role, { today: todayIST(), name: user?.name }),
  };
  if (tools.length) createParams.tools = tools;

  // Summed over the tool rounds. cacheRead / cacheWrite show whether the prompt cache is working: reads stay at 0 for
  // the student and guest roles (prompt below the model's cache minimum) and should grow for counselors and admins.
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const create = async (params) => {
    const response = await withRetry(() => callModel(params, onText));
    const u = response?.usage;
    if (u) {
      usage.inputTokens += u.input_tokens || 0;
      usage.outputTokens += u.output_tokens || 0;
      usage.cacheReadTokens += u.cache_read_input_tokens || 0;
      usage.cacheWriteTokens += u.cache_creation_input_tokens || 0;
    }
    return response;
  };
  let message = await create({ ...createParams, messages });

  // Tool-use loop: Claude asks for live data, we fetch it (scoped to `user`), hand it back, and
  // let Claude continue — capped so a confused model can't loop forever on our dime.
  for (let round = 0; round < MAX_TOOL_ROUNDS && message.stop_reason === 'tool_use'; round++) {
    const toolUseBlocks = message.content.filter(b => b.type === 'tool_use');
    const toolResults = [];
    for (const block of toolUseBlocks) {
      toolsUsed.push(block.name);
      ctx.onStatus?.(statusFor(block.name));
      const result = await executeTool(block.name, block.input, user, ctx);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'assistant', content: message.content });
    messages.push({ role: 'user', content: toolResults });
    message = await create({ ...createParams, messages });
  }

  let text = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (message.stop_reason === 'max_tokens') text = trimIncompleteAnswer(text);
  return { text, toolsUsed, usage };
}

module.exports = {
  askZest, isZestConfigured, buildSystemPrompt, buildSystemBlocks, todayIST, MAX_OUTPUT_TOKENS,
  setAnthropicClientForTests, trimIncompleteAnswer,
};
