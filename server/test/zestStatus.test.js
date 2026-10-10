// The chat panel shows what Zest is doing while a live lookup runs ("Checking your calendar…"). The status goes out as
// its own event before the answer, in plain words only, for both model backends and over the streaming route.

const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { askZest: askAnthropic, setAnthropicClientForTests } = require('../lib/anthropicClient');
const { setGeminiClientForTests } = require('../lib/geminiClient');

let n = 0;
async function mk(role) {
  const email = `zest-status-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Status ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const events = (text) => text.split('\n\n').filter(Boolean).map(b => JSON.parse(b.replace(/^data: /, '')));

const prevAnthropic = process.env.ANTHROPIC_API_KEY;
const prevGemini = process.env.GEMINI_API_KEY;
afterEach(() => {
  setAnthropicClientForTests(null);
  setGeminiClientForTests(null);
  if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevAnthropic;
  if (prevGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevGemini;
});

describe('tool status while Zest looks something up', () => {
  it('tells the caller which lookup is running before the next model turn, with the Anthropic backend', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key-client-is-mocked';
    const student = await mk('student');
    const replies = [
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'my_upcoming', input: {} }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Nothing is scheduled yet.' }] },
    ];
    setAnthropicClientForTests({ messages: { create: async () => replies.shift() } });

    const seen = [];
    const { text, toolsUsed } = await askAnthropic('When is my next call?', [], [], 'student', '', { id: student.id, role: 'student' }, null, { onStatus: (t) => seen.push(t) });
    expect(seen).toEqual(['Checking your calendar…']);
    expect(toolsUsed).toEqual(['my_upcoming']);
    expect(text).toBe('Nothing is scheduled yet.');
  });

  it('still answers when nobody is listening for status', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key-client-is-mocked';
    const student = await mk('student');
    const replies = [
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'my_upcoming', input: {} }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
    ];
    setAnthropicClientForTests({ messages: { create: async () => replies.shift() } });
    const { text } = await askAnthropic('When is my next call?', [], [], 'student', '', { id: student.id, role: 'student' });
    expect(text).toBe('Done.');
  });

  it('sends a status event, then the answer, over the streaming route (Gemini backend)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = 'fake-key-client-is-mocked';
    const student = await mk('student');
    const turns = [
      [{ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'my_upcoming', args: {} } }] } }] }],
      [{ candidates: [{ content: { role: 'model', parts: [{ text: 'You have no calls booked.' }] } }] }],
    ];
    setGeminiClientForTests({ models: { generateContentStream: async () => (async function* () { for (const c of turns.shift()) yield c; })() } });

    const res = await request(app).post('/api/zest/ask-stream').set(as(student)).send({ question: 'When is my next call?' });
    expect(res.status).toBe(200);
    const evs = events(res.text);
    const statusAt = evs.findIndex(e => e.type === 'status');
    const firstDeltaAt = evs.findIndex(e => e.type === 'delta');
    expect(evs[statusAt]).toEqual({ type: 'status', text: 'Checking your calendar…' });
    expect(statusAt).toBeLessThan(firstDeltaAt);
    expect(evs[evs.length - 1]).toMatchObject({ type: 'done', answer: 'You have no calls booked.' });
  });
});
