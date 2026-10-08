const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ZestQueryLog = require('../models/ZestQueryLog');
const Referral = require('../models/Referral');
const ParentLink = require('../models/ParentLink');
const Task = require('../models/Task');
const Event = require('../models/Event');
const Meeting = require('../models/Meeting');
const ChatRoom = require('../models/ChatRoom');
const DeletionRequest = require('../models/DeletionRequest');
const { eraseStudent } = require('../lib/studentData');

const PASSWORD = 'TestPass123!';
let n = 0;
async function mk(role, extra = {}) {
  const email = `priv-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Priya Sharma`, email, password: PASSWORD });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

// A student with data scattered across the system, to see all of it handled
async function richStudent() {
  const counselor = await mk('counselor');
  const s = await mk('student', {
    counselorId: counselor.id, phone: '9876543210', nationality: 'Indian', gpa: 3.4, preferredCountries: ['UK'], tags: ['vip'],
    passport: { number: 'Z1234567' }, address: { street: '12 Secret Lane' }, referralCode: require('crypto').randomBytes(4).toString('hex').toUpperCase(),
    documents: [{ name: 'passport.pdf', type: 'Passport', url: '/uploads/does-not-exist.pdf', status: 'verified' }],
    applications: [{ universityName: 'Test University', courseName: 'MSc', status: 'under_review', intake: 'September 2030', notes: 'STAFF NOTE', passportNumber: 'Z1234567', whyCourse: 'because personal reasons' }],
    counselorNotes: [{ text: 'private note about the student', authorId: counselor.id, visibility: 'private' }],
  });
  await Notification.create({ userId: s.id, title: 'Hello', message: 'Your docs' });
  await ZestQueryLog.create({ userId: s.id, userRole: 'student', question: 'my private question', answer: 'an answer' });
  await Referral.create({ referrerId: s.id, referredId: `${s.id.slice(0, -1)}0` });
  await ParentLink.create({ studentId: s.id, tokenHash: `h${Date.now()}${n}`, label: 'Mum', expiresAt: new Date(Date.now() + 1e9) });
  await Task.create({ title: 'Call', assignedBy: counselor.id, studentId: s.id, studentName: 'Priya Sharma' });
  const ev = await Event.create({ title: 'Webinar', startsAt: new Date(Date.now() + 1e9), createdBy: counselor.id, registrations: [{ userId: s.id, name: 'Priya Sharma', email: s.email }] });
  const meeting = await Meeting.create({ title: 'Call', scheduledDate: '2030-01-01', scheduledTime: '10:00', participants: [{ userId: s.id, name: 'Priya Sharma', role: 'student', email: s.email }] });
  const room = await ChatRoom.create({
    participants: [s.id, counselor.id], participantNames: ['Priya Sharma', 'Counselor'],
    messages: [{ senderId: s.id, senderName: 'Priya Sharma', content: 'my secret chat message' }, { senderId: counselor.id, senderName: 'Counselor', content: 'counselor reply' }],
  });
  return { s, counselor, ev, meeting, room };
}

describe('GET /api/privacy/export', () => {
  it('gives a student their own data as a download, without secrets or staff notes', async () => {
    const { s } = await richStudent();
    const res = await request(app).get('/api/privacy/export').set(as(s));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="my-gradzest-data-/);
    const data = JSON.parse(res.text);
    expect(data.profile.email).toBe(s.email);
    expect(data.profile.phone).toBe('9876543210');
    expect(data.zestConversations[0].question).toBe('my private question');
    expect(data.chatMessages.map((m) => m.content)).toEqual(['my secret chat message']); // only their own messages
    expect(data.events[0].title).toBe('Webinar');
    expect(res.text).not.toContain('private note about the student'); // staff notes stay out
    expect(res.text).not.toMatch(/"password"|tokenHash|"sessions"/);
  });

  it('is for students only, and each student only gets their own', async () => {
    const a = await mk('student');
    const b = await mk('student');
    expect((await request(app).get('/api/privacy/export').set(as(await mk('counselor')))).status).toBe(403);
    expect((await request(app).get('/api/privacy/export')).status).toBe(401);
    const data = JSON.parse((await request(app).get('/api/privacy/export').set(as(a))).text);
    expect(data.profile.email).toBe(a.email);
    expect(JSON.stringify(data)).not.toContain(b.email);
  });
});

describe('asking for deletion', () => {
  it('needs the right password, and asking twice is harmless', async () => {
    const s = await mk('student');
    const admin = await mk('admin');
    expect((await request(app).post('/api/privacy/deletion-request').set(as(s)).send({})).status).toBe(401);
    expect((await request(app).post('/api/privacy/deletion-request').set(as(s)).send({ password: 'wrong' })).status).toBe(401);

    const first = await request(app).post('/api/privacy/deletion-request').set(as(s)).send({ password: PASSWORD, reason: 'No longer studying abroad' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: 'pending', reason: 'No longer studying abroad' });
    const again = await request(app).post('/api/privacy/deletion-request').set(as(s)).send({ password: PASSWORD });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await DeletionRequest.countDocuments({ userId: s.id })).toBe(1);

    expect(await Notification.countDocuments({ userId: admin.id, type: 'privacy' })).toBe(1); // admins are told
    const status = (await request(app).get('/api/privacy/deletion-request').set(as(s))).body;
    expect(status.request.status).toBe('pending');
    expect(status.hasPassword).toBe(true);
  });

  it('accepts the typed email from an account with no password, and lets the student cancel', async () => {
    const s = await mk('student');
    await User.collection.updateOne({ email: s.email }, { $unset: { password: '' } });
    expect((await request(app).get('/api/privacy/deletion-request').set(as(s))).body).toEqual({ request: null, hasPassword: false });
    expect((await request(app).post('/api/privacy/deletion-request').set(as(s)).send({ confirmEmail: 'someone@else.com' })).status).toBe(401);
    expect((await request(app).post('/api/privacy/deletion-request').set(as(s)).send({ confirmEmail: s.email.toUpperCase() })).status).toBe(201);
    const cancelled = await request(app).delete('/api/privacy/deletion-request').set(as(s));
    expect(cancelled.body.status).toBe('cancelled');
    expect((await request(app).delete('/api/privacy/deletion-request').set(as(s))).status).toBe(404);
  });
});

describe('an admin handles requests', () => {
  async function requested() {
    const stuff = await richStudent();
    await request(app).post('/api/privacy/deletion-request').set(as(stuff.s)).send({ password: PASSWORD });
    const admin = await mk('admin');
    const list = await request(app).get('/api/privacy/deletion-requests').set(as(admin));
    return { ...stuff, admin, reqId: list.body.find((r) => r.email === stuff.s.email).id };
  }

  it('erases the data on completion and keeps only anonymous business records', async () => {
    const { s, ev, meeting, room, admin, reqId } = await requested();
    expect((await request(app).post(`/api/privacy/deletion-requests/${reqId}/complete`).set(as(admin)).send({})).status).toBe(400); // must confirm

    const done = await request(app).post(`/api/privacy/deletion-requests/${reqId}/complete`).set(as(admin)).send({ confirm: true, note: 'Done' });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'completed', adminNote: 'Done' });

    const raw = await User.collection.findOne({ _id: new (require('mongoose').Types.ObjectId)(s.id) });
    expect(raw).toMatchObject({ name: 'Deleted student', email: `deleted-${s.id}@deleted.invalid`, active: false, role: 'student' });
    for (const gone of ['phone', 'nationality', 'gpa', 'passport', 'address', 'documents', 'counselorNotes', 'tags', 'preferredCountries', 'referralCode', 'sessions']) {
      expect(raw[gone], gone).toBeUndefined();
    }
    expect(raw.deletedAt).toBeTruthy();
    // The application survives for statistics, minus anything personal
    expect(raw.applications).toHaveLength(1);
    expect(raw.applications[0]).toMatchObject({ universityName: 'Test University', courseName: 'MSc', status: 'under_review' });
    expect(raw.applications[0].notes).toBeUndefined();
    expect(raw.applications[0].passportNumber).toBeUndefined();
    expect(raw.applications[0].whyCourse).toBeUndefined();

    expect(await Notification.countDocuments({ userId: s.id })).toBe(0);
    expect(await ZestQueryLog.countDocuments({ userId: s.id })).toBe(0);
    expect(await Referral.countDocuments({ referrerId: s.id })).toBe(0);
    expect(await ParentLink.countDocuments({ studentId: s.id })).toBe(0);
    expect((await Task.findOne({ studentId: s.id })).studentName).toBe('Deleted student');
    expect((await Event.findById(ev._id)).registrations).toHaveLength(0);
    expect((await Meeting.findById(meeting._id)).participants[0]).toMatchObject({ name: 'Deleted student', email: '' });
    const chat = await ChatRoom.findById(room._id);
    expect(chat.messages.map((m) => m.content)).toEqual(['[deleted]', 'counselor reply']);
    expect(JSON.stringify(chat)).not.toContain('Priya Sharma');

    // The account can no longer be used: the old token stops working and the credentials are gone
    expect((await request(app).get('/api/students/me').set(as(s))).status).toBeGreaterThanOrEqual(401);
    expect((await request(app).post('/api/auth/login').send({ email: s.email, password: PASSWORD })).status).toBeGreaterThanOrEqual(400);
  });

  it('declines with a reason the student is told, and a request can be handled only once', async () => {
    const { s, admin, reqId } = await requested();
    expect((await request(app).post(`/api/privacy/deletion-requests/${reqId}/decline`).set(as(admin)).send({})).status).toBe(400);
    const declined = await request(app).post(`/api/privacy/deletion-requests/${reqId}/decline`).set(as(admin)).send({ note: 'You still have a live application' });
    expect(declined.body.status).toBe('declined');
    expect(await Notification.countDocuments({ userId: s.id, message: /live application/ })).toBe(1);
    expect((await request(app).post(`/api/privacy/deletion-requests/${reqId}/complete`).set(as(admin)).send({ confirm: true })).status).toBe(409);
    expect((await User.findById(s.id)).email).toBe(s.email); // nothing was erased
  });

  it('is admin only', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student');
    expect((await request(app).get('/api/privacy/deletion-requests').set(as(counselor))).status).toBe(403);
    expect((await request(app).post('/api/privacy/deletion-requests/507f1f77bcf86cd799439011/complete').set(as(student)).send({ confirm: true })).status).toBe(403);
    expect((await request(app).post('/api/privacy/deletion-requests/xyz/decline').set(as(await mk('admin'))).send({ note: 'x' })).status).toBe(404);
  });

  it('refuses to erase an account that is not a student', async () => {
    const counselor = await mk('counselor');
    expect(await eraseStudent(counselor.id)).toEqual({ erased: false, reason: 'not_a_student' });
    expect((await User.findById(counselor.id)).email).toBe(counselor.email);
  });
});
