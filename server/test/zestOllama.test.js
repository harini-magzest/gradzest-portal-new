const request = require('supertest');
const mongoose = require('mongoose');
const { app, mailer } = require('../app');
const User = require('../models/User');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const { askOllama, checkOllama } = require('../lib/ollamaChat');
const { initZestAlert, notifyZestFailure, _resetZestAlertCooldown } = require('../lib/zestAlert');

// Ollama's /api/chat replies, as fetch Responses
const ok = (body) => new Response(JSON.stringify(body), { status: 200 });
const chatReply = (message) => ok({ message: { role: 'assistant', ...message }, done: true });

let fetchSpy;
const ENV_KEYS = ['ZEST_PROVIDER', 'ZEST_MODEL', 'ZEST_ALERT_EMAILS', 'ZEST_ALERT_COOLDOWN_MIN'];
let savedEnv;
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  _resetZestAlertCooldown();
});
afterEach(() => {
  fetchSpy.mockRestore();
  ENV_KEYS.forEach(k => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
  initZestAlert(mailer);
});

const turn = (extra = {}) => ({ system: 'SYSTEM RULES', messages: [{ role: 'user', content: 'hi' }], tools: [], maxTokens: 800, maxToolRounds: 4, ...extra });

describe('Ollama connector', () => {
  it('sends the system prompt with a large context window and returns the answer', async () => {
    fetchSpy.mockResolvedValueOnce(chatReply({ content: 'Hello from Ollama' }));
    const out = await askOllama(turn(), async () => ({}));
    expect(out).toEqual({ text: 'Hello from Ollama', toolsUsed: [] });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(init.body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYSTEM RULES' });
    expect(body.options.num_ctx).toBeGreaterThanOrEqual(8192); // so the safety rules can't be truncated away
    expect(body.stream).toBe(false);
  });

  it('runs a requested tool, hands the result back, and reports which tools were used', async () => {
    fetchSpy
      .mockResolvedValueOnce(chatReply({ content: '', tool_calls: [{ function: { name: 'list_my_open_tasks', arguments: {} } }] }))
      .mockResolvedValueOnce(chatReply({ content: 'You have 2 open tasks.' }));
    const runTool = vi.fn().mockResolvedValue({ tasks: [1, 2] });
    const tools = [{ name: 'list_my_open_tasks', description: 'tasks', input_schema: { type: 'object', properties: {} } }];
    const out = await askOllama(turn({ tools }), runTool);
    expect(runTool).toHaveBeenCalledWith('list_my_open_tasks', {});
    expect(out).toEqual({ text: 'You have 2 open tasks.', toolsUsed: ['list_my_open_tasks'] });
    const second = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(second.tools[0]).toMatchObject({ type: 'function', function: { name: 'list_my_open_tasks' } });
    expect(second.messages.at(-1)).toMatchObject({ role: 'tool', content: JSON.stringify({ tasks: [1, 2] }) });
  });

  it.each([
    ['unreachable', () => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))],
    ['model_missing', () => Promise.resolve(new Response(JSON.stringify({ error: "model 'qwen2.5:7b' not found" }), { status: 404 }))],
    ['empty_answer', () => Promise.resolve(chatReply({ content: '   ' }))],
  ])('stops with a "%s" error instead of answering', async (kind, reply) => {
    fetchSpy.mockImplementation(reply);
    await expect(askOllama(turn(), async () => ({}))).rejects.toMatchObject({ name: 'ZestProviderError', kind });
  });

  it('stops a model that keeps asking for tools', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(chatReply({ content: '', tool_calls: [{ function: { name: 'x', arguments: '{}' } }] })));
    await expect(askOllama(turn({ maxToolRounds: 2 }), async () => ({}))).rejects.toMatchObject({ kind: 'tool_loop' });
    expect(fetchSpy).toHaveBeenCalledTimes(3); // first reply + 2 tool rounds, then it gives up
  });

  it('startup check reports a missing model with the command to fix it', async () => {
    process.env.ZEST_MODEL = 'qwen2.5:7b';
    fetchSpy.mockResolvedValueOnce(ok({ models: [{ name: 'llama3.1:8b' }] }));
    expect(await checkOllama()).toMatch(/ollama pull qwen2\.5:7b/);
    fetchSpy.mockResolvedValueOnce(ok({ models: [{ name: 'qwen2.5:7b' }] }));
    expect(await checkOllama()).toBeNull();
  });
});

describe('Zest failure alerts', () => {
  it('emails the configured address once per kind of error within the cooldown', async () => {
    process.env.ZEST_ALERT_EMAILS = 'alerts@example.com';
    const sendMail = vi.fn().mockResolvedValue({});
    initZestAlert({ sendMail });
    expect(await notifyZestFailure({ kind: 'unreachable', message: 'down' })).toBe(true);
    expect(await notifyZestFailure({ kind: 'unreachable', message: 'still down' })).toBe(false);
    expect(await notifyZestFailure({ kind: 'timeout', message: 'slow' })).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: 'alerts@example.com', subject: '[Zest] AI assistant error: unreachable' });
  });

  it('sends nothing when no recipients are configured', async () => {
    delete process.env.ZEST_ALERT_EMAILS;
    const sendMail = vi.fn();
    initZestAlert({ sendMail });
    expect(await notifyZestFailure({ kind: 'unreachable', message: 'down' })).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('/api/zest/ask with Ollama', () => {
  let n = 0;
  async function login(role) {
    const email = `zest-ollama-${role}-${Date.now()}-${n++}@example.com`;
    await request(app).post('/api/auth/register').send({ name: `Zest ${role}`, email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true, role });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
    return { Authorization: `Bearer ${res.body.token}` };
  }

  it('answers through Ollama when it is up', async () => {
    process.env.ZEST_PROVIDER = 'ollama';
    fetchSpy.mockResolvedValueOnce(chatReply({ content: 'Use the Applications page.' }));
    const res = await request(app).post('/api/zest/ask').set(await login('student')).send({ question: 'where do I track my applications' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('Use the Applications page.');
    expect(res.body.degraded).toBeUndefined();
  });

  it('when Ollama is down: stops, answers from the knowledge base, and emails the alert without the question', async () => {
    process.env.ZEST_PROVIDER = 'ollama';
    process.env.ZEST_ALERT_EMAILS = 'alerts@example.com';
    const sendMail = vi.fn().mockResolvedValue({});
    initZestAlert({ sendMail });
    fetchSpy.mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));

    await KnowledgeChunk.init();
    await KnowledgeChunk.create({
      documentId: new mongoose.Types.ObjectId(), documentTitle: 'Canada Visa Checklist',
      text: 'For a Canadian study permit you need a letter of acceptance, proof of funds and a passport.', order: 0,
    });
    const auth = await login('student');
    const res = await request(app).post('/api/zest/ask').set(auth).send({ question: 'Canadian study permit documents' });
    expect(res.status).toBe(200);
    expect(res.body.degraded).toBe(true);
    expect(res.body.answer).toMatch(/unavailable right now/);
    expect(res.body.answer).toMatch(/letter of acceptance/);
    expect(res.body.sources.map(s => s.title)).toContain('Canada Visa Checklist');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no retries

    await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('[Zest] AI assistant error: unreachable');
    expect(mail.html).not.toMatch(/Canadian study permit documents/);

    // Nothing in the knowledge base matches → a clear "unavailable" message instead
    const none = await request(app).post('/api/zest/ask').set(auth).send({ question: 'zzqx unmatched words' });
    expect(none.status).toBe(503);
    expect(none.body.message).toMatch(/team has been notified/);
  });
});
