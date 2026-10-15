// End to end for the streaming chat endpoint the widget uses (POST /api/zest/ask-stream): the answer arrives as
// server-sent events — `delta` pieces, then one `done` — and nothing leaks when the model is unavailable.

const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const ZestQueryLog = require('../models/ZestQueryLog');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const { setGeminiClientForTests } = require('../lib/geminiClient');

let n = 0;
async function mk(role) {
  const email = `zest-stream-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Stream ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const events = (text) => text.split('\n\n').filter(Boolean).map(b => JSON.parse(b.replace(/^data: /, '')));
const chunk = (text) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] });

const prevKey = process.env.GEMINI_API_KEY;
// The client is mocked, so a dummy key is enough to make Zest count as configured (same as geminiStream.test.js).
beforeEach(() => { process.env.GEMINI_API_KEY = 'fake-key-client-is-mocked'; });
// Retrieval runs a $text search, which needs the text index built first (as zest.test.js does).
beforeAll(async () => { await KnowledgeChunk.init(); });
afterEach(() => {
  setGeminiClientForTests(null);
  if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
});

describe('POST /api/zest/ask-stream', () => {
  it('requires a signed-in user and a question', async () => {
    expect((await request(app).post('/api/zest/ask-stream').send({ question: 'hi' })).status).toBe(401);
    const student = await mk('student');
    expect((await request(app).post('/api/zest/ask-stream').set(as(student)).send({ question: '   ' })).status).toBe(400);
  });

  it('says plainly that Zest is not configured, instead of opening a stream that never answers', async () => {
    process.env.GEMINI_API_KEY = '';
    const student = await mk('student');
    const res = await request(app).post('/api/zest/ask-stream').set(as(student)).send({ question: 'hi' });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not configured/i);
  });

  it('streams delta events and finishes with a done event carrying the full answer, and logs the turn', async () => {
    process.env.GEMINI_API_KEY = 'fake-key-client-is-mocked';
    setGeminiClientForTests({ models: { generateContentStream: async () => (async function* () { yield chunk('Processing takes '); yield chunk('three weeks.'); })() } });
    const student = await mk('student');
    const res = await request(app).post('/api/zest/ask-stream').set(as(student)).send({ question: 'How long does it take?' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const evs = events(res.text);
    expect(evs.filter(e => e.type === 'delta').map(e => e.text).join('')).toBe('Processing takes three weeks.');
    const done = evs[evs.length - 1];
    expect(done.type).toBe('done');
    expect(done.answer).toBe('Processing takes three weeks.');
    expect(await ZestQueryLog.countDocuments({ userId: student.id, answer: 'Processing takes three weeks.' })).toBe(1);
  });

  it('ends with a generic error event, never the provider error text, when the model fails', async () => {
    process.env.GEMINI_API_KEY = 'fake-key-client-is-mocked';
    setGeminiClientForTests({ models: { generateContentStream: async () => { throw Object.assign(new Error('API key not valid: secret-detail'), { status: 400 }); } } });
    const student = await mk('student');
    const res = await request(app).post('/api/zest/ask-stream').set(as(student)).send({ question: 'hi' });
    const last = events(res.text).pop();
    expect(last.type).toBe('error');
    expect(JSON.stringify(last)).not.toMatch(/secret-detail|API key/);
  });

  it('the plain /ask route answers the same question as JSON through the same code path', async () => {
    process.env.GEMINI_API_KEY = 'fake-key-client-is-mocked';
    setGeminiClientForTests({ models: { generateContent: async () => ({ text: 'Plain answer.', functionCalls: undefined, candidates: [{ content: { role: 'model', parts: [{ text: 'Plain answer.' }] } }] }) } });
    const student = await mk('student');
    const res = await request(app).post('/api/zest/ask').set(as(student)).send({ question: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('Plain answer.');
  });
});

describe('POST /api/zest/public/ask-stream (signed-out visitors)', () => {
  it('answers a guest with no account, catalogue search as the only tool, and logs it as a guest turn', async () => {
    process.env.GEMINI_API_KEY = 'fake-key-client-is-mocked';
    let seen;
    setGeminiClientForTests({ models: { generateContentStream: async (params) => { seen = params; return (async function* () { yield chunk('Guest answer.'); })(); } } });
    const res = await request(app).post('/api/zest/public/ask-stream').send({ question: 'Which UK universities offer an MBA?' });

    expect(res.status).toBe(200);
    const done = events(res.text).pop();
    expect(done.type).toBe('done');
    expect(done.answer).toBe('Guest answer.');
    expect(done.logId).toBeUndefined();
    const tools = JSON.stringify(seen.config.tools);
    expect(tools).toMatch(/search_universities/);
    expect(tools).not.toMatch(/lookup_student_status|list_my_students|pipeline_summary|list_open_lead_alerts/);
    expect(seen.config.systemInstruction).toMatch(/not signed in/);
    const log = await ZestQueryLog.findOne({ userRole: 'guest', answer: 'Guest answer.' }).lean();
    expect(log).toBeTruthy();
    expect(log.userId).toBeUndefined();
  });

  it('still validates the question', async () => {
    expect((await request(app).post('/api/zest/public/ask-stream').send({ question: ' ' })).status).toBe(400);
  });
});
