const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const University = require('../models/University');
const PiiAccessLog = require('../models/PiiAccessLog');
const { passportWarning } = require('../lib/documentCheck');
const { buildChecklist } = require('../lib/documentChecklist');
const { nextStepFor } = require('../lib/nextStep');
const { describeEntry, highlights, addEntry, removeEntry, MAX_SHORTLIST } = require('../lib/shortlist');

const DAY = 86400000;

describe('passportWarning', () => {
  const now = Date.parse('2026-01-01');
  it('says nothing when the date is unknown or comfortably far off', () => {
    expect(passportWarning(undefined, now)).toBeNull();
    expect(passportWarning('not a date', now)).toBeNull();
    expect(passportWarning(new Date(now + 800 * DAY), now)).toBeNull();
  });
  it('flags an expired passport', () => {
    expect(passportWarning(new Date(now - DAY), now).level).toBe('expired');
  });
  it('flags a passport that will not outlast the intake by six months', () => {
    const intake = new Date(now + 200 * DAY);
    expect(passportWarning(new Date(now + 300 * DAY), now, intake).level).toBe('soon');
    expect(passportWarning(new Date(now + 400 * DAY), now, intake)).toBeNull();
  });
});

describe('checklist passport warning', () => {
  it('puts the warning on the passport item only', () => {
    const list = buildChecklist({ documents: [], passport: { expiryDate: '2020-01-01' } }, [], Date.parse('2026-01-01'));
    expect(list.items.find((i) => i.key === 'passport').warning.level).toBe('expired');
    expect(list.items.filter((i) => i.warning)).toHaveLength(1);
  });
});

describe('nextStepFor', () => {
  const item = (key, status, extra = {}) => ({ key, label: key.toUpperCase(), status, ...extra });
  const checklist = (items) => ({ items, summary: { missing: items.filter((i) => i.status === 'missing').length } });

  it('puts a rejected document first', () => {
    const s = nextStepFor(checklist([item('cv', 'missing'), item('sop', 'rejected')]), [{ status: 'offer_received' }]);
    expect(s.kind).toBe('document_rejected');
  });
  it('then an expired passport, then an offer, then missing documents', () => {
    expect(nextStepFor(checklist([item('passport', 'verified', { warning: { level: 'expired', message: 'm' } })]), []).kind).toBe('passport_expired');
    expect(nextStepFor(checklist([item('cv', 'missing')]), [{ status: 'offer_received', universityName: 'X' }]).kind).toBe('respond_to_offer');
    expect(nextStepFor(checklist([item('cv', 'missing')]), []).kind).toBe('upload_document');
  });
  it('then a draft application, an intake coming up, or documents awaiting verification', () => {
    const done = checklist([item('cv', 'verified')]);
    expect(nextStepFor(done, [{ status: 'draft', universityName: 'X' }]).kind).toBe('finish_application');
    expect(nextStepFor(done, [{ status: 'submitted', daysToIntake: 20, intake: 'Sep 2026' }]).kind).toBe('intake_soon');
    expect(nextStepFor(checklist([item('cv', 'uploaded')]), [{ status: 'submitted' }]).kind).toBe('waiting_verification');
  });
  it('suggests exploring with no applications, and otherwise says all is well', () => {
    expect(nextStepFor(checklist([item('cv', 'verified')]), []).kind).toBe('explore');
    expect(nextStepFor(checklist([item('cv', 'verified')]), [{ status: 'submitted', daysToIntake: 400 }]).kind).toBe('on_track');
  });
});

describe('shortlist helpers', () => {
  it('adds once, refuses past the cap, and removes', () => {
    let list = addEntry([], 'u1', 'c1');
    expect(addEntry(list, 'u1', 'c1')).toBe(list); // repeat is a no-op
    for (let i = 0; list && i < MAX_SHORTLIST; i++) list = addEntry(list, 'u', `c${i}`);
    expect(list).toBeNull();
    expect(removeEntry([{ universityId: 'u1', courseId: 'c1' }, { universityId: 'u1', courseId: 'c2' }], 'u1', 'c1')).toHaveLength(1);
  });
  it('flags the cheapest and best-ranked rows', () => {
    const a = describeEntry({ id: 'u1', name: 'A', ranking: 50 }, { id: 'c1', name: 'X', tuitionFee: 20000 });
    const b = describeEntry({ id: 'u2', name: 'B', ranking: 10 }, { id: 'c2', name: 'Y', tuitionFee: 30000 });
    expect(highlights([a, b])).toEqual({ cheapest: 'u1:c1', bestRanked: 'u2:c2' });
  });
});

let n = 0;
async function mk(role) {
  const email = `feat-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Feat ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('GET /api/students/me/next-step', () => {
  it('is for students only and returns a step', async () => {
    const student = await mk('student');
    const counselor = await mk('counselor');
    expect((await request(app).get('/api/students/me/next-step').set(as(counselor))).status).toBe(403);
    const res = await request(app).get('/api/students/me/next-step').set(as(student));
    expect(res.status).toBe(200);
    expect(res.body.kind).toBeTruthy();
    expect(res.body.action.to).toMatch(/^\/student\//);
  });
});

describe('GET /api/students/me/data-access', () => {
  it('shows a student who looked at their data, and nobody else’s', async () => {
    const student = await mk('student');
    const other = await mk('student');
    const counselor = await mk('counselor');
    await PiiAccessLog.create({ accessorId: counselor.id, accessorEmail: 'c@example.com', accessorRole: 'counselor', applicantId: student.id, applicantEmail: 's@example.com', fieldsAccessed: ['passport'], ip: '1.2.3.4' });
    await PiiAccessLog.create({ accessorId: counselor.id, accessorRole: 'counselor', applicantId: other.id, applicantEmail: 'o@example.com' });

    const res = await request(app).get('/api/students/me/data-access').set(as(student));
    expect(res.status).toBe(200);
    expect(res.body.accesses).toHaveLength(1);
    expect(res.body.accesses[0]).toMatchObject({ role: 'counselor', name: 'Feat counselor' });
    expect(JSON.stringify(res.body)).not.toMatch(/1\.2\.3\.4|passport|c@example\.com/); // no IP, field list or staff email
    expect((await request(app).get('/api/students/me/data-access').set(as(counselor))).status).toBe(403);
  });
});

describe('shortlist routes', () => {
  async function seedUni() {
    const id = `uni-${Date.now()}-${n++}`;
    await University.create({ id, name: 'Shortlist Uni', country: 'Canada', courses: [{ id: 'c-a', name: 'MSc A', tuitionFee: 20000, currency: 'CAD' }, { id: 'c-b', name: 'MSc B', tuitionFee: 30000 }] });
    return id;
  }

  it('adds, lists with the cheapest flagged, ignores repeats, and removes', async () => {
    const student = await mk('student');
    const uniId = await seedUni();
    expect((await request(app).post('/api/students/me/shortlist').set(as(student)).send({ universityId: uniId })).status).toBe(400);
    expect((await request(app).post('/api/students/me/shortlist').set(as(student)).send({ universityId: uniId, courseId: 'nope' })).status).toBe(404);

    await request(app).post('/api/students/me/shortlist').set(as(student)).send({ universityId: uniId, courseId: 'c-a' });
    await request(app).post('/api/students/me/shortlist').set(as(student)).send({ universityId: uniId, courseId: 'c-a' });
    const added = await request(app).post('/api/students/me/shortlist').set(as(student)).send({ universityId: uniId, courseId: 'c-b' });
    expect(added.status).toBe(201);
    expect(added.body.courses.map((c) => c.courseName).sort()).toEqual(['MSc A', 'MSc B']);

    const list = await request(app).get('/api/students/me/shortlist').set(as(student));
    expect(list.body.cheapest).toBe(`${uniId}:c-a`);

    const removed = await request(app).delete(`/api/students/me/shortlist/${uniId}/c-a`).set(as(student));
    expect(removed.body.courses.map((c) => c.courseName)).toEqual(['MSc B']);
  });

  it('is private to each student and closed to staff', async () => {
    const a = await mk('student');
    const b = await mk('student');
    const counselor = await mk('counselor');
    const uniId = await seedUni();
    await request(app).post('/api/students/me/shortlist').set(as(a)).send({ universityId: uniId, courseId: 'c-a' });
    expect((await request(app).get('/api/students/me/shortlist').set(as(b))).body.courses).toHaveLength(0);
    expect((await request(app).get('/api/students/me/shortlist').set(as(counselor))).status).toBe(403);
  });
});
