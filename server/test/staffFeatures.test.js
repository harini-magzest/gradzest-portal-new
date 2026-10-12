const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const Notification = require('../models/Notification');
const Task = require('../models/Task');
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
