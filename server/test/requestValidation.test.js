// Request validation (middleware/validate.js, Zod): unknown fields and malformed ids are refused with a plain 400 that
// names the fields, before any handler or database query runs.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const University = require('../models/University');

let n = 0;
async function signedIn(role, extra = {}) {
  const email = `valid-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Valid ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { id: String(res.body.user.id), token: res.body.token, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

// The 400 says which fields are wrong and nothing else: no stack, no echo of the values sent
function expectInvalid(res, ...fields) {
  expect(res.status).toBe(400);
  expect(Object.keys(res.body).sort()).toEqual(['errors', 'message']);
  expect(res.body.message).toBe('Invalid request');
  for (const field of fields) expect(res.body.errors.map((e) => e.field)).toContain(field);
  expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js|node_modules|TestPass123/);
}

describe('auth', () => {
  it('refuses unknown fields on login and register (no picking your own role at sign-up)', async () => {
    expectInvalid(await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'x', role: 'admin' }), 'role');
    const email = `valid-signup-${Date.now()}@example.com`;
    expectInvalid(await request(app).post('/api/auth/register').send({ name: 'X', email, password: 'TestPass123!', role: 'admin', isAppTeam: true }), 'role', 'isAppTeam');
    expect(await User.exists({ email })).toBeNull();
  });

  it('checks types and formats', async () => {
    expectInvalid(await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' }), 'email');
    expectInvalid(await request(app).post('/api/auth/reset-password').send({ token: 't', password: ['x'] }), 'password');
    expectInvalid(await request(app).post('/api/auth/forgot-password').send({ email: { $gt: '' } }), 'email');
  });

  it('still lets a normal sign-in through, browser device details included', async () => {
    const u = await signedIn('student');
    const res = await request(app).post('/api/auth/login')
      .send({ email: ` ${u.email} `, password: 'TestPass123!', device: { platform: 'Windows', platformVersion: '15.0.0', mobile: false, cores: 8 } });
    expect(res.status).toBe(200);
  });
});

describe('admin', () => {
  it('a counselor update can no longer set fields the form does not have (it used to copy the whole body)', async () => {
    const admin = await signedIn('admin');
    const counselor = await signedIn('counselor');
    expectInvalid(await request(app).put(`/api/admin/counselors/${counselor.id}`).set(as(admin)).send({ name: 'C', isAppTeam: true, sessions: [] }), 'isAppTeam', 'sessions');
    expect((await User.findById(counselor.id).lean()).isAppTeam).toBeFalsy();

    const ok = await request(app).put(`/api/admin/counselors/${counselor.id}`).set(as(admin))
      .send({ name: 'Counselor Renamed', email: counselor.email, specialization: ['UK'], experience: 3, title: 'Senior', bio: 'Hi', smartfloAgent: '' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Counselor Renamed');
  });

  it('a malformed id is a 400 before any lookup', async () => {
    const admin = await signedIn('admin');
    expectInvalid(await request(app).put('/api/admin/counselors/not-an-id').set(as(admin)).send({ name: 'C' }), 'id');
    expectInvalid(await request(app).put('/api/admin/students/123/assign').set(as(admin)).send({ counselorId: null }), 'id');
  });

  it('creating a student checks every field, and unknown ones are refused', async () => {
    const admin = await signedIn('admin');
    const base = { name: 'New Student', email: `valid-new-${Date.now()}@example.com`, password: 'TestPass123!' };
    expectInvalid(await request(app).post('/api/admin/students').set(as(admin)).send({ ...base, role: 'admin' }), 'role');
    expectInvalid(await request(app).post('/api/admin/students').set(as(admin)).send({ ...base, gpa: 'high' }), 'gpa');
    const ok = await request(app).post('/api/admin/students').set(as(admin))
      .send({ ...base, gpa: 3.4, englishScore: { type: 'IELTS', score: 7 }, preferredCountries: ['UK'], interestedCourses: [] });
    expect(ok.status).toBe(201);
  });

  it('a university can be edited with any field its model has, and nothing else', async () => {
    const admin = await signedIn('admin');
    const uni = await University.create({ id: `valid-uni-${Date.now()}`, name: 'Valid University', country: 'UK' });
    expectInvalid(await request(app).put(`/api/admin/universities/${uni._id}`).set(as(admin)).send({ name: 'X', notAField: 1 }), 'notAField');
    const ok = await request(app).put(`/api/admin/universities/${uni._id}`).set(as(admin))
      .send({ name: 'Valid University Renamed', city: 'Leeds', tags: ['russell'], averageFees: { undergraduate: 1, postgraduate: 2, currency: 'GBP' } });
    expect(ok.status).toBe(200);
    expect(ok.body.city).toBe('Leeds');
  });
});

describe('chat', () => {
  it('refuses a malformed room id and extra message fields', async () => {
    const u = await signedIn('student');
    expectInvalid(await request(app).get('/api/chat/rooms/xyz').set(as(u)), 'roomId');
    expectInvalid(await request(app).post('/api/chat/rooms').set(as(u)).send({ participantIds: ['nope'], participantNames: ['A'] }), 'participantIds.0');
    const roomId = '0'.repeat(24);
    expectInvalid(await request(app).post(`/api/chat/rooms/${roomId}/messages`).set(as(u)).send({ content: 'hi', senderId: 'someone-else' }), 'senderId');
  });
});

describe('uploads', () => {
  const uploads = path.join(__dirname, '..', 'uploads');
  const files = () => (fs.existsSync(uploads) ? fs.readdirSync(uploads) : []);

  it('a document can only point at a stored file or an https address', async () => {
    const s = await signedIn('student');
    for (const url of ['javascript:alert(1)', 'http://example.com/x.pdf', '/uploads/../../.env']) {
      expectInvalid(await request(app).post('/api/students/me/documents').set(as(s)).field('name', 'Doc').field('url', url), 'url');
    }
  });

  it('an upload refused for its form fields is not left on disk', async () => {
    const s = await signedIn('student');
    const before = files();
    const res = await request(app).post('/api/students/me/documents').set(as(s))
      .field('name', 'Doc').field('owner', 'someone-else')
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expectInvalid(res, 'owner');
    await vi.waitFor(() => expect(files().filter((f) => !before.includes(f))).toEqual([]));
  });
});

describe('ids in other routers', () => {
  it('notifications and tasks refuse malformed ids with a 400 instead of reaching the database', async () => {
    const u = await signedIn('counselor');
    expectInvalid(await request(app).put('/api/notifications/abc/read').set(as(u)), 'id');
    expectInvalid(await request(app).delete('/api/tasks/abc').set(as(u)), 'id');
  });
});

describe('second layer', () => {
  it('express-mongo-sanitize still runs before the routes', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const sanitizeAt = src.indexOf('app.use(mongoSanitize(');
    expect(sanitizeAt).toBeGreaterThan(-1);
    expect(sanitizeAt).toBeLessThan(src.indexOf("app.use('/api/auth', require('./routes/auth'))"));
  });
});
