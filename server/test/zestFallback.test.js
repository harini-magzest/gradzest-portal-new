const request = require('supertest');
const mongoose = require('mongoose');
const { app, mailer } = require('../app');
const User = require('../models/User');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const { setAnthropicClientForTests } = require('../lib/anthropicClient');
const { initZestAlert, notifyZestFailure, _resetZestAlertCooldown } = require('../lib/zestAlert');

// An Anthropic client whose every call fails, the way a revoked key or an outage would
const failingClient = () => {
  const fail = async () => { throw new Error('upstream down'); };
  return { messages: { create: fail, stream: () => ({ on() { return this; }, finalMessage: fail }) } };
};

let n = 0;
async function login(role) {
  const email = `zest-fallback-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Zest ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { Authorization: `Bearer ${res.body.token}` };
}

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'ZEST_ALERT_EMAILS', 'ZEST_ALERT_COOLDOWN_MIN'];
let savedEnv;
beforeAll(() => KnowledgeChunk.init()); // /ask runs a $text search, which needs the text index
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  _resetZestAlertCooldown();
});
afterEach(() => {
  setAnthropicClientForTests(null);
  ENV_KEYS.forEach(k => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
  initZestAlert(mailer);
});

describe('Zest failure alerts', () => {
  it('emails the configured address once per kind of error within the cooldown', async () => {
    process.env.ZEST_ALERT_EMAILS = 'alerts@example.com';
    const sendMail = vi.fn().mockResolvedValue({});
    initZestAlert({ sendMail });
    expect(await notifyZestFailure({ kind: 'error', message: 'down' })).toBe(true);
    expect(await notifyZestFailure({ kind: 'error', message: 'still down' })).toBe(false);
    expect(await notifyZestFailure({ kind: 'auth', message: 'bad key' })).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: 'alerts@example.com', subject: '[Zest] AI assistant error: error' });
  });

  it('sends nothing when no recipients are configured', async () => {
    delete process.env.ZEST_ALERT_EMAILS;
    const sendMail = vi.fn();
    initZestAlert({ sendMail });
    expect(await notifyZestFailure({ kind: 'error', message: 'down' })).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('/api/zest/ask when the AI fails', () => {
  it('stops, answers from the knowledge base, and emails the alert without the question', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key-never-sent-anywhere-client-is-mocked';
    process.env.ZEST_ALERT_EMAILS = 'alerts@example.com';
    setAnthropicClientForTests(failingClient());
    const sendMail = vi.fn().mockResolvedValue({});
    initZestAlert({ sendMail });

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

    await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
    expect(sendMail.mock.calls[0][0].html).not.toMatch(/Canadian study permit documents/);

    // Nothing in the knowledge base matches → a clear "unavailable" message instead
    const none = await request(app).post('/api/zest/ask').set(auth).send({ question: 'zzqx unmatched words' });
    expect(none.status).toBe(503);
    expect(none.body.message).toMatch(/team has been notified/);
  });

  it('says how to configure Zest when no provider is set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await request(app).post('/api/zest/ask').set(await login('student')).send({ question: 'hello' });
    if (process.env.GEMINI_API_KEY) return; // a developer's local Gemini key makes Zest configured
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Zest is not configured yet. Ask an admin to set ANTHROPIC_API_KEY or GEMINI_API_KEY.');
  });
});
