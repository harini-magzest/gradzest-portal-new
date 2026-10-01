const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { migrateEmailIndex } = require('../lib/migrateEmailIndex');

let n = 0;
async function login(role, extra = {}) {
  const email = `leads-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'Leads Test', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
let phoneSeq = 0;
const newPhone = () => `+91 90000 ${String(10000 + phoneSeq++).slice(-5)}`;

describe('phone-only student leads', () => {
  it('admin can add a lead with just a name and mobile, and several such leads can coexist', async () => {
    await User.init(); // make sure the partial email index exists before relying on it
    const { token } = await login('admin');
    const a = await request(app).post('/api/students').set(auth(token)).send({ lastName: 'Ramya', phone: newPhone() });
    const b = await request(app).post('/api/students').set(auth(token)).send({ firstName: 'Kiran', lastName: 'Rao', phone: newPhone() });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.email).toBeUndefined();
    expect(a.body.tempPassword).toBeUndefined(); // no email → no login yet
    expect(b.body.name).toBe('Kiran Rao');
    expect(b.body.source).toBe('admin_created');
  });

  it('requires a name and a mobile or email', async () => {
    const { token } = await login('admin');
    expect((await request(app).post('/api/students').set(auth(token)).send({ phone: newPhone() })).status).toBe(400);
    expect((await request(app).post('/api/students').set(auth(token)).send({ lastName: 'NoContact' })).status).toBe(400);
  });

  it('flags a duplicate mobile however it is formatted, unless told to save anyway', async () => {
    const { token } = await login('admin');
    const first = await request(app).post('/api/students').set(auth(token)).send({ lastName: 'Orig', phone: '+91 87921 00881' });
    expect(first.status).toBe(201);
    const dupe = await request(app).post('/api/students').set(auth(token)).send({ lastName: 'Again', phone: '8792100881' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.duplicatePhone).toBe(true);
    expect(dupe.body.existingId).toBe(String(first.body._id || first.body.id));
    const forced = await request(app).post('/api/students').set(auth(token)).send({ lastName: 'Again', phone: '8792100881', allowDuplicatePhone: true });
    expect(forced.status).toBe(201);
  });

  it('Application Team and counselors can add leads; a counselor owns what they add', async () => {
    const team = await login('admin', { isAppTeam: true });
    const r1 = await request(app).post('/api/students').set(auth(team.token)).send({ lastName: 'TeamLead', phone: newPhone() });
    expect(r1.status).toBe(201);

    const c = await login('counselor');
    const r2 = await request(app).post('/api/students').set(auth(c.token)).send({ lastName: 'CounselorLead', phone: newPhone() });
    expect(r2.status).toBe(201);
    expect(String(r2.body.counselorId)).toBe(String(c.id));
    expect(r2.body.source).toBe('counselor_created');
  });

  it('staff can fill in the Bigin fields one by one', async () => {
    const { token } = await login('admin');
    const created = await request(app).post('/api/students').set(auth(token)).send({ lastName: 'Fill', phone: newPhone() });
    const id = created.body._id || created.body.id;

    const r = await request(app).put(`/api/students/${id}`).set(auth(token)).send({
      firstName: 'Ramya', title: 'Ms', secondaryEmail: 'alt@example.com', universityName: 'JNTU',
      altPhone: '040-1234567', socialLeadId: 'FB-991', address: { city: 'Hyderabad', country: 'India' },
      preferredCountries: ['Canada'], englishScore: { type: 'IELTS', score: 7 }, interestedCourses: ['MBA'],
      preferredCourseLevel: "Master's", preferredIntake: 'September 2027', qualification: 'B.Tech (2024)',
      workSummary: '2 yrs at Infosys', branch: 'Hyderabad',
    });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Ramya Fill');
    expect(r.body.address.city).toBe('Hyderabad');
    expect(r.body.englishScore).toMatchObject({ type: 'IELTS', score: 7 });
    expect(r.body.preferredIntake).toBe('September 2027');
    expect(r.body.branch).toBe('Hyderabad');

    // A later partial edit leaves the other fields alone
    const r2 = await request(app).put(`/api/students/${id}`).set(auth(token)).send({ branch: 'Vizag' });
    expect(r2.body.branch).toBe('Vizag');
    expect(r2.body.universityName).toBe('JNTU');
  });

  it('an email can be added to a phone-only lead, but an existing login email cannot be changed', async () => {
    const { token } = await login('admin');
    const created = await request(app).post('/api/students').set(auth(token)).send({ lastName: 'Mail', phone: newPhone() });
    const id = created.body._id || created.body.id;
    const added = await request(app).put(`/api/students/${id}`).set(auth(token)).send({ email: `Lead-${Date.now()}@Example.com` });
    expect(added.status).toBe(200);
    expect(added.body.email).toMatch(/^lead-\d+@example\.com$/);
    const changed = await request(app).put(`/api/students/${id}`).set(auth(token)).send({ email: 'other@example.com' });
    expect(changed.status).toBe(400);
  });

  it('ignores fields outside the allowlist', async () => {
    const { token } = await login('admin');
    const created = await request(app).post('/api/students').set(auth(token)).send({
      lastName: 'Sneaky', phone: newPhone(), role: 'admin', isAppTeam: true, password: 'x', emailVerified: true,
    });
    expect(created.status).toBe(201);
    const doc = await User.findById(created.body._id || created.body.id).lean();
    expect(doc.role).toBe('student');
    expect(doc.isAppTeam).toBe(false);
    expect(doc.password).toBeUndefined();

    const r = await request(app).put(`/api/students/${doc._id}`).set(auth(token)).send({ role: 'admin', counselorId: 'x', lastName: 'Still' });
    const after = await User.findById(doc._id).lean();
    expect(r.status).toBe(200);
    expect(after.role).toBe('student');
    expect(after.counselorId).not.toBe('x');
  });

  it("a counselor can't edit another counselor's student", async () => {
    const owner = await login('counselor');
    const other = await login('counselor');
    const created = await request(app).post('/api/students').set(auth(owner.token)).send({ lastName: 'Mine', phone: newPhone() });
    const r = await request(app).put(`/api/students/${created.body._id || created.body.id}`).set(auth(other.token)).send({ branch: 'X' });
    expect(r.status).toBe(403);
  });
});

describe('student self-service preferences', () => {
  it('a student can save their own preferences and extra contact details', async () => {
    const { token, id } = await login('student');
    const r = await request(app).put('/api/students/me').set(auth(token)).send({
      altPhone: ' 040-1234567 ', secondaryEmail: 'me2@example.com', universityName: 'JNTU',
      preferredCourseLevel: "Master's", preferredIntake: 'September 2027',
      preferredUniversities: 'Toronto, Monash', preferredCities: 'Toronto',
      needsScholarship: 'yes', needsLoan: 'not_sure', needsAccommodation: 'no',
      preferenceNote: 'I want a co-op programme.',
    });
    expect(r.status).toBe(200);
    const doc = await User.findById(id).lean();
    expect(doc.altPhone).toBe('040-1234567');
    expect(doc.preferredIntake).toBe('September 2027');
    expect(doc.needsScholarship).toBe('yes');
    expect(doc.preferenceNote).toBe('I want a co-op programme.');
  });

  it('ignores bad yes/no values and staff-only fields', async () => {
    const { token, id } = await login('student');
    await request(app).put('/api/students/me').set(auth(token)).send({
      needsLoan: 'definitely', branch: 'HQ', socialLeadId: 'X', leadStage: 'enrolment', preferredCities: { $gt: '' },
    });
    const doc = await User.findById(id).lean();
    expect(doc.needsLoan).toBeUndefined();
    expect(doc.branch).toBeUndefined();
    expect(doc.socialLeadId).toBeUndefined();
    expect(doc.leadStage).toBeUndefined();
    expect(typeof doc.preferredCities).toBe('string'); // an object is coerced to text, never stored as-is
  });
});

describe('migrateEmailIndex', () => {
  it('replaces a legacy unique email index with the partial one, and is idempotent', async () => {
    await User.init();
    // The old index can't even be built while phone-only leads exist (they'd all collide on a
    // missing email) — which is the bug the migration fixes — so recreate it on a clean slate.
    await User.deleteMany({ email: { $exists: false } });
    await User.collection.dropIndex('email_1');
    await User.collection.createIndex({ email: 1 }, { name: 'email_1', unique: true });

    await migrateEmailIndex();
    await migrateEmailIndex();

    const idx = (await User.collection.indexes()).find(i => i.name === 'email_1');
    expect(idx.unique).toBe(true);
    expect(idx.partialFilterExpression).toEqual({ email: { $type: 'string' } });
  });
});
