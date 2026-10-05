const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const Notification = require('../models/Notification');
const Task = require('../models/Task');
const { setAnthropicClientForTests } = require('../lib/anthropicClient');
const { recentTranscript, transcriptText, needsReply } = require('../lib/zestDraft');
const { buildBrief } = require('../lib/counselorBrief');
const { runCounselorBrief } = require('../jobs/counselorDailyBrief');

describe('zestDraft helpers', () => {
  const msg = (role, content, extra = {}) => ({ senderRole: role, senderName: role, content, ...extra });

  it('keeps recent text messages only, oldest first, and caps their length', () => {
    const lines = recentTranscript([
      msg('student', 'hi'), msg('counselor', 'hello', { type: 'call' }), msg('counselor', '   '),
      msg('counselor', 'x'.repeat(2000)),
    ]);
    expect(lines.map((l) => l.who)).toEqual(['student', 'staff']);
    expect(lines[1].text).toHaveLength(600);
    expect(recentTranscript(Array.from({ length: 40 }, (_, i) => msg('student', `m${i}`)))).toHaveLength(12);
  });

  it('labels who spoke, and replies only to a student message', () => {
    const lines = recentTranscript([msg('counselor', 'Welcome'), msg('student', 'What about fees?')]);
    expect(transcriptText(lines)).toBe('Counselor (counselor): Welcome\nStudent (student): What about fees?');
    expect(needsReply(lines)).toBe(true);
    expect(needsReply(lines.slice(0, 1))).toBe(false);
    expect(needsReply([])).toBe(false);
  });
});

describe('buildBrief', () => {
  it('says nothing when nothing needs chasing', () => {
    expect(buildBrief({ stale: [], stuck: [], overdueTasks: [], staleDays: 5 })).toBeNull();
    expect(buildBrief(undefined)).toBeNull();
  });

  it('summarises each kind, names a few people, and is urgent only with overdue tasks', () => {
    const b = buildBrief({
      stale: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }],
      stuck: [{ name: 'F' }], overdueTasks: [{ title: 't' }], staleDays: 5,
    });
    expect(b.title).toBe('Your day: 7 things need attention');
    expect(b.message).toContain('1 overdue task');
    expect(b.message).toContain('1 application stuck: F');
    expect(b.message).toContain('5 leads with no movement for 5+ days: A, B, C and 2 more');
    expect(b.urgent).toBe(true);
    expect(buildBrief({ stale: [{ name: 'A' }], staleDays: 5 }).urgent).toBe(false);
  });
});

let n = 0;
async function mk(role, extra = {}) {
  const email = `staff-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Staff ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('POST /api/zest/documents/from-answer', () => {
  it('is admin only and needs both fields', async () => {
    const counselor = await mk('counselor');
    const admin = await mk('admin');
    expect((await request(app).post('/api/zest/documents/from-answer').set(as(counselor)).send({ question: 'q', answer: 'a' })).status).toBe(403);
    expect((await request(app).post('/api/zest/documents/from-answer').set(as(admin)).send({ question: 'q' })).status).toBe(400);
  });

  it('turns a question and corrected answer into a ready knowledge-base entry with searchable chunks', async () => {
    const admin = await mk('admin');
    const marker = `zzcorrection${Date.now()}`;
    const res = await request(app).post('/api/zest/documents/from-answer').set(as(admin))
      .send({ question: `What is the ${marker} fee?`, answer: 'It is 500 rupees, paid at the counter.' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ready');
    const doc = await KnowledgeDocument.findById(res.body._id).lean();
    expect(doc.title).toContain(marker);
    const chunks = await KnowledgeChunk.find({ documentId: doc._id }).lean();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].text).toContain('500 rupees');
    await KnowledgeChunk.init();
    expect(await KnowledgeChunk.countDocuments({ $text: { $search: marker } })).toBeGreaterThan(0);
  });
});

describe('POST /api/zest/draft-reply', () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'fake-key-client-is-mocked'; });
  afterEach(() => {
    setAnthropicClientForTests(null);
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevKey;
  });

  const fakeClient = (text, seen = {}) => ({
    messages: { create: async (params) => { seen.params = params; return { stop_reason: 'end_turn', content: [{ type: 'text', text }] }; } },
  });

  async function room(counselor, student, messages) {
    return ChatRoom.create({ participants: [counselor.id, student.id], participantNames: ['C', 'S'], type: 'student-counselor', messages });
  }

  it('drafts a reply to the latest student message for a staff member in that chat', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student');
    const r = await room(counselor, student, [{ senderId: student.id, senderRole: 'student', senderName: 'Asha', content: 'When is the IELTS deadline?' }]);
    const seen = {};
    setAnthropicClientForTests(fakeClient('  Hi Asha, I will confirm the date and get back to you today.  ', seen));

    const res = await request(app).post('/api/zest/draft-reply').set(as(counselor)).send({ roomId: String(r._id) });
    expect(res.status).toBe(200);
    expect(res.body.draft).toBe('Hi Asha, I will confirm the date and get back to you today.');
    expect(JSON.stringify(seen.params)).toContain('When is the IELTS deadline?');
  });

  it('refuses students, strangers to the chat, a chat with nothing to answer, and a missing id', async () => {
    const counselor = await mk('counselor');
    const stranger = await mk('counselor');
    const student = await mk('student');
    const waiting = await room(counselor, student, [{ senderId: student.id, senderRole: 'student', senderName: 'S', content: 'hello?' }]);
    const answered = await room(counselor, student, [
      { senderId: student.id, senderRole: 'student', senderName: 'S', content: 'hello?' },
      { senderId: counselor.id, senderRole: 'counselor', senderName: 'C', content: 'Hi!' },
    ]);
    setAnthropicClientForTests(fakeClient('x'));

    expect((await request(app).post('/api/zest/draft-reply').set(as(student)).send({ roomId: String(waiting._id) })).status).toBe(403);
    expect((await request(app).post('/api/zest/draft-reply').set(as(stranger)).send({ roomId: String(waiting._id) })).status).toBe(404);
    expect((await request(app).post('/api/zest/draft-reply').set(as(counselor)).send({ roomId: String(answered._id) })).status).toBe(400);
    expect((await request(app).post('/api/zest/draft-reply').set(as(counselor)).send({})).status).toBe(400);
  });

  it('503s when Zest is not configured', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student');
    const r = await room(counselor, student, [{ senderId: student.id, senderRole: 'student', senderName: 'S', content: 'hi' }]);
    process.env.ANTHROPIC_API_KEY = '';
    const gemini = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = '';
    const res = await request(app).post('/api/zest/draft-reply').set(as(counselor)).send({ roomId: String(r._id) });
    process.env.GEMINI_API_KEY = gemini ?? '';
    expect(res.status).toBe(503);
  });
});

describe('runCounselorBrief', () => {
  it('notifies a counselor with work to chase once a day, and skips one with nothing', async () => {
    const busy = await mk('counselor');
    const idle = await mk('counselor');
    const student = await mk('student', { counselorId: busy.id });
    await Task.create({ title: 'Call back', assignedTo: busy.id, assignedBy: busy.id, status: 'pending', dueDate: '2020-01-01', studentId: student.id });

    await runCounselorBrief(null, null);
    await runCounselorBrief(null, null); // a second run the same day must not repeat it

    const mine = await Notification.find({ userId: busy.id, type: 'daily_brief' }).lean();
    expect(mine).toHaveLength(1);
    expect(mine[0].priority).toBe('urgent');
    expect(mine[0].message).toContain('overdue task');
    expect(await Notification.countDocuments({ userId: idle.id, type: 'daily_brief' })).toBe(0);
  });
});
