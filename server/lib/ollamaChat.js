// Runs a Zest turn against a self-hosted Ollama server (free, and nothing leaves the machine).
// Uses Ollama's native /api/chat rather than its OpenAI-compatible endpoint because only the
// native one accepts options.num_ctx: Ollama's default context window is small, and a prompt
// that overflows it is truncated silently from the start — which would drop Zest's system
// prompt, including the privacy and safety rules. Every failure throws a ZestProviderError so
// the route can stop, fall back, and alert instead of returning a half-baked answer.

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5:7b';

class ZestProviderError extends Error {
  /** @param {string} kind short, stable reason — used to group alert emails */
  constructor(kind, message) {
    super(message);
    this.name = 'ZestProviderError';
    this.kind = kind;
  }
}

const baseUrl = () => (process.env.ZEST_OLLAMA_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const modelName = () => process.env.ZEST_MODEL || DEFAULT_MODEL;
const numCtx = () => Number(process.env.ZEST_NUM_CTX) || 8192;
const timeoutMs = () => Number(process.env.ZEST_TIMEOUT_MS) || 90000;

// Claude-style tool definitions (zestTools.js) → the function format Ollama expects
const toOllamaTools = (tools) => tools.map(t => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new ZestProviderError('timeout', `Ollama did not answer within ${Math.round(timeoutMs() / 1000)}s`);
    }
    throw new ZestProviderError('unreachable', `Could not reach Ollama at ${baseUrl()} (${err.cause?.code || err.message})`);
  }
  const text = await res.text();
  if (!res.ok) {
    const detail = (() => { try { return JSON.parse(text).error; } catch { return text; } })() || res.statusText;
    const kind = res.status === 404 && /model/i.test(detail) ? 'model_missing' : `http_${res.status}`;
    throw new ZestProviderError(kind, `Ollama returned ${res.status}: ${String(detail).slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { throw new ZestProviderError('bad_response', 'Ollama sent a response that is not valid JSON'); }
}

/**
 * @param {{ system: string, messages: {role: string, content: string}[], tools: any[], maxTokens: number, maxToolRounds: number }} turn
 * @param {(name: string, input: any) => Promise<any>} runTool  executes a tool, already scoped to the caller
 * @returns {Promise<{ text: string, toolsUsed: string[] }>}
 */
async function askOllama({ system, messages, tools, maxTokens, maxToolRounds }, runTool) {
  const convo = [{ role: 'system', content: system }, ...messages];
  const body = {
    model: modelName(),
    stream: false,
    options: { num_ctx: numCtx(), num_predict: maxTokens, temperature: 0.3 },
  };
  if (tools.length) body.tools = toOllamaTools(tools);

  const toolsUsed = [];
  let reply = await post('/api/chat', { ...body, messages: convo });

  for (let round = 0; reply.message?.tool_calls?.length; round++) {
    // Stop rather than let a confused model loop on tools indefinitely
    if (round >= maxToolRounds) throw new ZestProviderError('tool_loop', `Model kept requesting tools after ${maxToolRounds} rounds`);
    convo.push(reply.message);
    for (const call of reply.message.tool_calls) {
      const name = call.function?.name;
      let input = call.function?.arguments ?? {};
      if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = {}; } }
      toolsUsed.push(name);
      const result = await runTool(name, input);
      convo.push({ role: 'tool', tool_name: name, content: JSON.stringify(result) });
    }
    reply = await post('/api/chat', { ...body, messages: convo });
  }

  const text = (reply.message?.content || '').trim();
  if (!text) throw new ZestProviderError('empty_answer', 'Model returned an empty answer');
  return { text, toolsUsed };
}

/** Startup check: is Ollama up, and has the configured model been pulled? Resolves to a problem string or null. */
async function checkOllama() {
  try {
    const res = await fetch(`${baseUrl()}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return `Ollama at ${baseUrl()} returned ${res.status}`;
    const { models = [] } = await res.json();
    const want = modelName();
    const have = models.map(m => m.name);
    const found = have.some(n => n === want || n === `${want}:latest`);
    return found ? null : `Model "${want}" is not downloaded in Ollama (have: ${have.join(', ') || 'none'}). Run: ollama pull ${want}`;
  } catch (err) {
    return `Could not reach Ollama at ${baseUrl()} (${err.cause?.code || err.message}). Is Ollama running?`;
  }
}

module.exports = { askOllama, checkOllama, ZestProviderError, toOllamaTools, DEFAULT_MODEL };
