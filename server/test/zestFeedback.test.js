const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const ZestQueryLog = require('../models/ZestQueryLog');

let n = 0;
async function mk(role) {
  const email = `zestfb-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `FB ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const log = (user, extra = {}) => ZestQueryLog.create({ userId: user.id, userRole: 'student', question: 'q', answer: 'a', ...extra });

describe('Zest answer feedback', () => {
  it('lets the person who was answered rate it, and replace the rating', async () => {
    const student = await mk('student');
    const row = await log(student);
    let res = await request(app).post('/api/zest/feedback').set(as(student)).send({ logId: String(row._id), rating: 'down', comment: 'wrong visa fee' });
    expect(res.status).toBe(200);
    res = await request(app).post('/api/zest/feedback').set(as(student)).send({ logId: String(row._id), rating: 'up' });
    expect(res.status).toBe(200);
    const saved = await ZestQueryLog.findById(row._id).lean();
    expect(saved.feedback.rating).toBe('up');
    expect(saved.feedback.comment).toBe('');
  });

  it("does not let someone rate another person's answer", async () => {
    const owner = await mk('student');
    const other = await mk('student');
    const row = await log(owner);
    const res = await request(app).post('/api/zest/feedback').set(as(other)).send({ logId: String(row._id), rating: 'down' });
    expect(res.status).toBe(404);
    expect((await ZestQueryLog.findById(row._id).lean()).feedback?.rating).toBeUndefined();
  });

  it('rejects a bad rating or id', async () => {
    const student = await mk('student');
    const row = await log(student);
    expect((await request(app).post('/api/zest/feedback').set(as(student)).send({ logId: String(row._id), rating: 'meh' })).status).toBe(400);
    expect((await request(app).post('/api/zest/feedback').set(as(student)).send({ logId: 'nope', rating: 'up' })).status).toBe(400);
  });
});

describe('Zest analytics', () => {
  it('is admin only', async () => {
    const student = await mk('student');
    expect((await request(app).get('/api/zest/analytics').set(as(student))).status).toBe(403);
  });

  it('counts ratings and groups ungrounded questions, ignoring grounded ones', async () => {
    const admin = await mk('admin');
    const student = await mk('student');
    const marker = `zzq${Date.now()}`;
    await ZestQueryLog.deleteMany({});
    await log(student, { question: `What is the ${marker} policy?` });
    await log(student, { question: `what is the ${marker} policy` });
    await log(student, { question: 'Grounded one', toolsUsed: ['search_universities'] });
    await log(student, { question: 'Bad answer', feedback: { rating: 'down', comment: 'too vague', at: new Date() } });
    await log(student, { question: 'Good answer', feedback: { rating: 'up', at: new Date() } });

    const res = await request(app).get('/api/zest/analytics').set(as(admin));
    expect(res.status).toBe(200);
    expect(res.body.up).toBe(1);
    expect(res.body.down).toBe(1);
    const top = res.body.unanswered.find((u) => u.question.toLowerCase().includes(marker));
    expect(top.count).toBe(2);
    expect(res.body.unanswered.some((u) => u.question === 'Grounded one')).toBe(false);
    expect(res.body.downvoted[0].comment).toBe('too vague');
  });
});
