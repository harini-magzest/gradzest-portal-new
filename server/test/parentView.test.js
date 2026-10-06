const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const ParentLink = require('../models/ParentLink');
const Meeting = require('../models/Meeting');

let n = 0;
async function mk(role, extra = {}) {
  const email = `par-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Priya Sharma`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const tokenOf = (url) => url.split('/parent/')[1];

describe('a student manages parent links', () => {
  it('creates a link once, stores only a hash, and lists it without the secret', async () => {
    const student = await mk('student');
    const res = await request(app).post('/api/parent-links').set(as(student)).send({ label: 'Mum', days: 30 });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/\/parent\/[A-Za-z0-9_-]{40,}$/);
    expect(res.body).toMatchObject({ label: 'Mum', active: true });

    const token = tokenOf(res.body.url);
    const stored = await ParentLink.findById(res.body.id).lean();
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.tokenHash).toHaveLength(64);

    const list = await request(app).get('/api/parent-links').set(as(student));
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(token);
  });

  it('caps active links, and a revoked link frees a slot', async () => {
    const student = await mk('student');
    const made = [];
    for (let i = 0; i < 5; i++) made.push((await request(app).post('/api/parent-links').set(as(student)).send({})).body);
    expect((await request(app).post('/api/parent-links').set(as(student)).send({})).status).toBe(409);
    expect((await request(app).delete(`/api/parent-links/${made[0].id}`).set(as(student))).status).toBe(200);
    expect((await request(app).post('/api/parent-links').set(as(student)).send({})).status).toBe(201);
  });

  it('is for students only, and nobody can revoke someone elses link', async () => {
    const student = await mk('student');
    const other = await mk('student');
    const link = (await request(app).post('/api/parent-links').set(as(student)).send({})).body;
    expect((await request(app).post('/api/parent-links').set(as(await mk('counselor'))).send({})).status).toBe(403);
    expect((await request(app).get('/api/parent-links')).status).toBe(401);
    expect((await request(app).delete(`/api/parent-links/${link.id}`).set(as(other))).status).toBe(404);
    expect((await request(app).delete('/api/parent-links/not-an-id').set(as(student))).status).toBe(404);
  });
});

describe('a parent opens the link', () => {
  async function setup() {
    const counselor = await mk('counselor');
    const student = await mk('student', {
      counselorId: counselor.id, phone: '9876543210', passport: { number: 'Z1234567' },
      applications: [{ universityName: 'Test University', courseName: 'MSc Data', status: 'under_review', intake: 'September 2030', notes: 'PRIVATE counselor note' }],
      documents: [{ name: 'passport-scan.pdf', type: 'Passport', url: '/uploads/secret-file.pdf', status: 'verified' }],
    });
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await Meeting.create({
      title: 'Call with Priya', scheduledDate: date, scheduledTime: '10:00', status: 'scheduled', meetingLink: 'https://meet.jit.si/SECRETROOM', notes: 'private agenda',
      participants: [{ userId: student.id, name: 'Priya', role: 'student' }],
    });
    const link = (await request(app).post('/api/parent-links').set(as(student)).send({ label: 'Dad' })).body;
    return { student, counselor, link, token: tokenOf(link.url) };
  }

  it('shows progress without any sign-in, and counts the view', async () => {
    const { token, link } = await setup();
    const res = await request(app).get(`/api/parent/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toMatch(/noindex/);
    expect(res.body.studentName).toBe('Priya');
    expect(res.body.counselorName).toBe('Priya Sharma'); // the helper gives everyone the same name
    expect(res.body.applications[0]).toMatchObject({ universityName: 'Test University', status: 'under_review' });
    expect(res.body.applications[0].steps.map((s) => s.state)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(res.body.documents.stillNeeded).toEqual(expect.arrayContaining(['Statement of purpose']));
    expect(res.body.upcomingMeetings).toHaveLength(1);

    const stored = await ParentLink.findById(link.id).lean();
    expect(stored.viewCount).toBe(1);
    expect(stored.lastViewedAt).toBeTruthy();
  });

  it('never exposes personal records, files, notes or meeting links', async () => {
    const { token, student } = await setup();
    const body = JSON.stringify((await request(app).get(`/api/parent/${token}`)).body);
    for (const secret of [student.email, '9876543210', 'Z1234567', '/uploads/secret-file.pdf', 'passport-scan.pdf', 'PRIVATE counselor note', 'SECRETROOM', 'private agenda', student.id]) {
      expect(body).not.toContain(secret);
    }
  });

  it('gives the same plain not-found for an unknown, malformed, expired or revoked link', async () => {
    const { token, link, student } = await setup();
    const unknown = await request(app).get(`/api/parent/${'a'.repeat(43)}`);
    const malformed = await request(app).get('/api/parent/short');
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);

    await ParentLink.updateOne({ _id: link.id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).get(`/api/parent/${token}`)).status).toBe(404);

    const fresh = (await request(app).post('/api/parent-links').set(as(student)).send({})).body;
    expect((await request(app).get(`/api/parent/${tokenOf(fresh.url)}`)).status).toBe(200);
    await request(app).delete(`/api/parent-links/${fresh.id}`).set(as(student));
    const revoked = await request(app).get(`/api/parent/${tokenOf(fresh.url)}`);
    expect(revoked.status).toBe(404);
    expect(revoked.body.message).toMatch(/not valid/);
  });
});
