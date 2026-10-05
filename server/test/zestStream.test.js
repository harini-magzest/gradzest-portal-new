const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const ZestQueryLog = require('../models/ZestQueryLog');
const { setAnthropicClientForTests } = require('../lib/anthropicClient');

let n = 0;
async function mk(role) {
  const email = `zeststream-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `ZS ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

// Emits the scripted message's text in small pieces through stream().on('text'), then resolves
// finalMessage() — the same surface the real SDK's MessageStream exposes.
function fakeStreamingClient(message) {
  return {
    messages: {
      create: async () => message,
      stream: () => {
        const listeners = {};
        return {
          on(event, fn) { (listeners[event] ||= []).push(fn); return this; },
          finalMessage: async () => {
            for (const block of message.content) {
              if (block.type !== 'text') continue;
              for (let i = 0; i < block.text.length; i += 6) {
                const piece = block.text.slice(i, i + 6);
                (listeners.text || []).forEach(fn => fn(piece, piece));
              }
            }
            return message;
          },
        };
      },
    },
  };
}

function parseEvents(body) {
  return body.split('\n\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5)));
}

const originalKey = process.env.ANTHROPIC_API_KEY;
beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'fake-key-never-sent-anywhere-client-is-mocked'; });
afterEach(() => {
  setAnthropicClientForTests(null);
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
});

describe('Zest streaming answers', () => {
  it('sends the answer as delta events, then a done event with the full answer', async () => {
    const KnowledgeChunk = require('../models/KnowledgeChunk');
    await KnowledgeChunk.init(); // the  index must exist before retrieval runs
    const admin = await mk('admin');
    setAnthropicClientForTests(fakeStreamingClient({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Processing takes three to four weeks.' }],
    }));

    const res = await request(app).post('/api/zest/ask-stream').set(as(admin)).send({ question: 'How long does a UK visa take?' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseEvents(res.text);
    const deltas = events.filter(e => e.type === 'delta').map(e => e.text);
    expect(deltas.length).toBeGreaterThan(1); // arrived in pieces, not as one block
    expect(deltas.join('')).toBe('Processing takes three to four weeks.');
    const done = events.find(e => e.type === 'done');
    expect(done.answer).toBe('Processing takes three to four weeks.');

    const log = await ZestQueryLog.findOne({ userId: admin.id }).sort({ createdAt: -1 });
    expect(log.answer).toBe('Processing takes three to four weeks.');
  });

  it('still rejects an empty question with a plain JSON 400 before any stream starts', async () => {
    const admin = await mk('admin');
    const res = await request(app).post('/api/zest/ask-stream').set(as(admin)).send({ question: '   ' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('reports a model failure as an error event instead of a broken stream', async () => {
    const admin = await mk('admin');
    setAnthropicClientForTests({
      messages: {
        create: async () => { throw new Error('upstream down'); },
        stream: () => ({ on() { return this; }, finalMessage: async () => { throw new Error('upstream down'); } }),
      },
    });

    const res = await request(app).post('/api/zest/ask-stream').set(as(admin)).send({ question: 'anything' });

    expect(res.status).toBe(200);
    const events = parseEvents(res.text);
    expect(events.find(e => e.type === 'error')).toBeTruthy();
    expect(events.find(e => e.type === 'done')).toBeUndefined();
  });
});
