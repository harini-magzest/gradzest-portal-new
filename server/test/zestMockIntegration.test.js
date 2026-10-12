// Full-stack Zest tests with a mocked Anthropic client (no real API key, no network call) —
// everything else is real: real HTTP routes, real Mongo retrieval, real tool execution against
// real documents, real ZestQueryLog writes. This is the closest thing to an end-to-end test we
// can run without paying for actual model calls; it proves the plumbing is correct, not that the
// real model's answers are good — only a live API key can tell you that.

const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Task = require('../models/Task');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const ZestQueryLog = require('../models/ZestQueryLog');
const { setAnthropicClientForTests } = require('../lib/anthropicClient');

let n = 0;
async function mk(role, extra = {}) {
  const email = `zestmock-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `ZM ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

// Replays `script` in order on successive messages.create() calls (repeats the last entry if
// called more times than scripted) and records every call's params for assertions.
function fakeClient(script) {
  const calls = [];
  let i = 0;
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        const response = script[Math.min(i, script.length - 1)];
        i++;
        return response;
      },
    },
  };
}

const textResponse = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });
const toolUseResponse = (name, input = {}) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2)}`, name, input }],
});

const originalApiKey = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'fake-key-never-sent-anywhere-client-is-mocked';
});
afterEach(() => {
  setAnthropicClientForTests(null);
  if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalApiKey;
});

describe('Zest /ask end-to-end with a mocked model (no real API call)', () => {
  it('answers from knowledge-base retrieval with no tool call, and logs the exchange', async () => {
    const admin = await mk('admin');
    await KnowledgeChunk.init();
    const mongoose = require('mongoose');
    await KnowledgeChunk.create({
      documentId: new mongoose.Types.ObjectId(), documentTitle: 'UK Visa Guide',
      text: 'UK student visa processing time is typically three to four weeks after biometrics.',
      order: 0,
    });

    setAnthropicClientForTests(fakeClient([
      textResponse('Per the UK Visa Guide, processing is typically three to four weeks after biometrics.'),
    ]));

    const res = await request(app).post('/api/zest/ask').set(as(admin)).send({ question: 'How long does a UK visa take?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('three to four weeks');
    expect(res.body.sources.map(s => s.title)).toContain('UK Visa Guide');

    const log = await ZestQueryLog.findOne({ userId: admin.id }).sort({ createdAt: -1 });
    expect(log.answer).toBe(res.body.answer);
    expect(log.toolsUsed).toEqual([]);
  });

  it('runs the real tool-use loop: model asks for live data, executeTool runs for real, model gets a second turn', async () => {
    const counselor = await mk('counselor');
    const otherCounselor = await mk('counselor');
    await Task.create({ title: 'Follow up with Aman', assignedTo: counselor.id, assignedBy: counselor.id, status: 'pending', dueDate: '2026-10-05' });
    await Task.create({ title: "Someone else's task", assignedTo: otherCounselor.id, assignedBy: otherCounselor.id, status: 'pending', dueDate: '2026-10-01' });

    const client = fakeClient([
      toolUseResponse('list_my_open_tasks'),
      textResponse('You have one open task: "Follow up with Aman", due 2026-10-05.'),
    ]);
    setAnthropicClientForTests(client);

    const res = await request(app).post('/api/zest/ask').set(as(counselor)).send({ question: 'What are my open tasks?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('Follow up with Aman');
    expect(res.body.answer).not.toContain("Someone else's task"); // real scoping — the tool never saw the other counselor's task

    // Two real round-trips to the (fake) model happened, as the tool-use loop promises.
    expect(client.calls).toHaveLength(2);
    // The second call carries the tool_result the first call's tool_use produced.
    const secondCallMessages = client.calls[1].messages;
    const toolResultMsg = secondCallMessages.find(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'));
    expect(toolResultMsg).toBeTruthy();
    const resultPayload = JSON.parse(toolResultMsg.content[0].content);
    expect(resultPayload.tasks.map(t => t.title)).toEqual(['Follow up with Aman']);

    const log = await ZestQueryLog.findOne({ userId: counselor.id }).sort({ createdAt: -1 });
    expect(log.toolsUsed).toEqual(['list_my_open_tasks']);
  });

  it('offers a student only the catalogue and their own record, never a staff tool', async () => {
    const student = await mk('student');
    const client = fakeClient([textResponse('I can only help with your own application here.')]);
    setAnthropicClientForTests(client);

    const res = await request(app).post('/api/zest/ask').set(as(student)).send({ question: 'What are my open tasks?' });

    expect(res.status).toBe(200);
    // These three take no input that could name someone else; everything else is staff-only (and executeTool refuses
    // a student for those regardless of what the model asks for)
    const offered = (client.calls[0].tools || []).map((tool) => tool.name).sort();
    expect(offered).toEqual(['my_status', 'my_upcoming', 'search_universities']);

    const log = await ZestQueryLog.findOne({ userId: student.id }).sort({ createdAt: -1 });
    expect(log.toolsUsed).toEqual([]);
  });

  it('caps the tool-use loop instead of looping forever on a confused model', async () => {
    const admin = await mk('admin');
    // Script always returns tool_use — if the loop weren't capped this would hang/loop forever.
    const client = fakeClient([toolUseResponse('list_open_lead_alerts')]);
    setAnthropicClientForTests(client);

    const res = await request(app).post('/api/zest/ask').set(as(admin)).send({ question: 'alerts?' });

    expect(res.status).toBe(200);
    expect(client.calls.length).toBeLessThanOrEqual(5); // MAX_TOOL_ROUNDS (4) + the initial call
    expect(res.body.answer).toBe(''); // no text block was ever produced by the (deliberately unhelpful) script
  });
});
