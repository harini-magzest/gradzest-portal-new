// Response compression: big JSON is gzipped for clients that accept it, small responses and clients that do not accept
// it are left alone, and the Server-Sent Events stream Zest answers with is never compressed (the encoder would buffer
// it and the answer would arrive in one lump).
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const University = require('../models/University');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const { setGeminiClientForTests } = require('../lib/geminiClient');

const tag = `cmp-${Date.now()}`;
const prevKey = process.env.GEMINI_API_KEY;

beforeAll(async () => {
  await KnowledgeChunk.init();
  const blurb = 'A research university with strong industry links, a large international community and many scholarships. '.repeat(6);
  await University.insertMany(
    Array.from({ length: 30 }, (_, i) => ({ id: `${tag}-${i}`, name: `${tag} University ${i}`, country: 'Canada', description: blurb })),
  );
});

afterEach(() => {
  setGeminiClientForTests(null);
  if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
});

describe('response compression', () => {
  it('gzips a large JSON response for a client that accepts it, and the body still parses', async () => {
    const res = await request(app).get('/api/universities').set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers.vary).toMatch(/accept-encoding/i);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.filter((u) => String(u.id).startsWith(tag))).toHaveLength(30);
  });

  it('sends it plain to a client that does not accept compression', async () => {
    const res = await request(app).get('/api/universities').set('Accept-Encoding', 'identity');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('leaves a small response alone', async () => {
    const res = await request(app).get('/api/health').set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('never compresses the Zest event stream, even for a client that accepts gzip', async () => {
    process.env.GEMINI_API_KEY = 'fake-key-client-is-mocked';
    const chunk = (text) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] });
    setGeminiClientForTests({ models: { generateContentStream: async () => (async function* () { yield chunk('Hello '); yield chunk('there.'); })() } });

    const email = `${tag}-stream@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'Stream Student', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true, role: 'student' });
    const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });

    const res = await request(app).post('/api/zest/ask-stream')
      .set('Authorization', `Bearer ${login.body.token}`).set('Accept-Encoding', 'gzip').send({ question: 'Hi there' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.text).toContain('"type":"delta"');
  });
});
