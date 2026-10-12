// Prompt caching for Zest: the system prompt is sent as a stable block (cache breakpoint) plus a small volatile block,
// and askZest reports token usage summed over its model calls. The last group runs the REAL @anthropic-ai/sdk against a
// local HTTP server, so the bytes it sends and the way it parses a stream are what is under test, not a mock of them.
const http = require('http');
const Anthropic = require('@anthropic-ai/sdk');
const {
  buildSystemPrompt, buildSystemBlocks, askZest, setAnthropicClientForTests,
} = require('../lib/anthropicClient');
const { getToolsForRole } = require('../lib/zestTools');

const CTX = { today: 'Monday, 12 October 2026', name: 'Asha Verma' };

describe('system prompt blocks', () => {
  it.each(['guest', 'student', 'counselor', 'admin'])('%s: the blocks are the same text as the string prompt', (role) => {
    const blocks = buildSystemBlocks(role, CTX);
    expect(blocks.map(b => b.text).join('\n\n')).toBe(buildSystemPrompt(role, CTX));
  });

  it('puts the cache breakpoint on the stable block only, and the date and name after it', () => {
    const [stable, volatile, ...rest] = buildSystemBlocks('counselor', CTX);
    expect(rest).toHaveLength(0);
    expect(stable.cache_control).toEqual({ type: 'ephemeral' });
    expect(stable.text).not.toMatch(/Today's date|Asha Verma/);
    expect(volatile.cache_control).toBeUndefined();
    expect(volatile.text).toMatch(/Today's date is Monday, 12 October 2026/);
    expect(volatile.text).toMatch(/Asha Verma \(counselor\)/);
  });

  it('keeps the cached block byte-identical across days and people, which is what makes it reusable', () => {
    const a = buildSystemBlocks('admin', { today: 'Monday, 12 October 2026', name: 'Asha' })[0];
    const b = buildSystemBlocks('admin', { today: 'Tuesday, 13 October 2026', name: 'Ravi' })[0];
    expect(a).toEqual(b);
  });

  it('sends one block with no volatile part when there is no date or name', () => {
    expect(buildSystemBlocks('student', {})).toHaveLength(1);
  });

  it('gives every role its own stable block (the audience guide differs), never a shared one', () => {
    const texts = ['guest', 'student', 'counselor'].map(r => buildSystemBlocks(r, {})[0].text);
    expect(new Set(texts).size).toBe(3);
  });
});

describe('askZest request shape and usage (fake client)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'fake-key-client-is-mocked'; });
  afterEach(() => {
    setAnthropicClientForTests(null);
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('sends the system prompt as blocks with the breakpoint, and the role\'s tools unchanged', async () => {
    const seen = [];
    setAnthropicClientForTests({ messages: { create: async (params) => {
      seen.push(params);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 5, output_tokens: 2 } };
    } } });

    await askZest('hello', [], [], 'student', '', { id: 'u1', role: 'student', name: 'Asha' });

    expect(seen).toHaveLength(1);
    expect(Array.isArray(seen[0].system)).toBe(true);
    expect(seen[0].system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(seen[0].tools).toEqual(getToolsForRole('student'));
  });

  it('adds up usage over the tool rounds, including cache reads and writes', async () => {
    const replies = [
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'search_universities', input: { query: 'zzz-no-such-university' } }],
        usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 4500, cache_read_input_tokens: 0 } },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Nothing found.' }],
        usage: { input_tokens: 40, output_tokens: 6, cache_creation_input_tokens: 0, cache_read_input_tokens: 4500 } },
    ];
    let i = 0;
    setAnthropicClientForTests({ messages: { create: async () => replies[i++] } });

    const out = await askZest('find zzz', [], [], 'student', '', { id: 'u1', role: 'student', name: 'Asha' });

    expect(out.text).toBe('Nothing found.');
    expect(out.toolsUsed).toEqual(['search_universities']);
    expect(out.usage).toEqual({ inputTokens: 140, outputTokens: 16, cacheReadTokens: 4500, cacheWriteTokens: 4500 });
  });

  it('reports zero usage, not an error, when the backend returns none', async () => {
    setAnthropicClientForTests({ messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }) } });
    const out = await askZest('hi', [], [], 'student', '', { id: 'u1', role: 'student' });
    expect(out.usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});

// ---- the real SDK against a local server -------------------------------------------------------------------------
function startFakeApi() {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      const usage = { input_tokens: 12, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 4500 };
      if (body && body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        send('message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage } });
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } });
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' there.' } });
        send('content_block_stop', { type: 'content_block_stop', index: 0 });
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 7 } });
        send('message_stop', { type: 'message_stop' });
        res.end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          id: 'msg_2', type: 'message', role: 'assistant', model: body && body.model, stop_reason: 'end_turn', stop_sequence: null,
          content: [{ type: 'text', text: 'Plain reply.' }], usage: { ...usage, output_tokens: 4 },
        }));
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise(r => server.close(r)) });
  }));
}

describe('the real SDK talking to a local server', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  let api;
  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key-points-at-a-local-server';
    api = await startFakeApi();
    setAnthropicClientForTests(new Anthropic({ apiKey: 'test-key', baseURL: api.url, maxRetries: 0 }));
  });
  afterEach(async () => {
    setAnthropicClientForTests(null);
    await api.close();
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  const counselor = { id: 'c1', role: 'counselor', name: 'Asha Verma' };

  it('streams: sends the cache breakpoint on the wire, relays the text, and reads cache usage from the stream', async () => {
    const deltas = [];
    const out = await askZest('what is next?', [], [], 'counselor', '', counselor, (d) => deltas.push(d));

    expect(deltas).toEqual(['Hello', ' there.']);
    expect(out.text).toBe('Hello there.');
    expect(out.usage.cacheReadTokens).toBe(4500);
    expect(out.usage.outputTokens).toBe(7);

    const sent = api.requests.find(r => r.url.startsWith('/v1/messages'));
    expect(sent.method).toBe('POST');
    expect(sent.headers['x-api-key']).toBe('test-key');
    expect(sent.headers['anthropic-version']).toBeTruthy();
    expect(sent.body.stream).toBe(true);
    expect(sent.body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sent.body.system[0].text).toBe(buildSystemBlocks('counselor', {})[0].text);
    expect(sent.body.system[1].text).toMatch(/Asha Verma \(counselor\)/);
    expect(sent.body.tools.map(t => t.name)).toEqual(getToolsForRole('counselor').map(t => t.name));
    expect(sent.body.messages[sent.body.messages.length - 1].role).toBe('user');
  });

  it('does not stream when no one is listening, and parses the plain JSON reply', async () => {
    const out = await askZest('what is next?', [], [], 'counselor', '', counselor, null);

    expect(out.text).toBe('Plain reply.');
    expect(out.usage).toEqual({ inputTokens: 12, outputTokens: 4, cacheReadTokens: 4500, cacheWriteTokens: 0 });
    const sent = api.requests.find(r => r.url.startsWith('/v1/messages'));
    expect(sent.body.stream).toBeUndefined();
    expect(sent.body.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});
