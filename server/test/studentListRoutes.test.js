// The unpaged student routes read their data as plain objects (lib/studentList.js, lib/leanDoc.js). This calls the real
// routes over randomly shaped records and checks each answer against what loading whole documents and calling toJSON()
// gives, which is how these routes used to work: same JSON, same audit trail.
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const PiiAccessLog = require('../models/PiiAccessLog');
const { fieldsPresentOn } = require('../lib/logPiiAccess');
const { randomStudents, plain, firstDifference } = require('./helpers/randomStudents');

const COUNT = 120;
const tag = `slr-${Date.now()}`;
let ids = [];
let admin;
let counselor;

async function mk(role) {
  const email = `${tag}-${role}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `${tag} ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: login.body.token, id: login.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const byId = (rows, key = 'id') => new Map(rows.map((r) => [String(r[key]), r]));

beforeAll(async () => {
  const docs = randomStudents({ count: COUNT, seed: 7777, tag });
  await User.collection.insertMany(docs);
  ids = docs.map((d) => String(d._id));
  admin = await mk('admin');
  counselor = await mk('counselor');
});

/** Every result row for one of this file's records, compared with the expected one; returns up to 5 problems. */
function compare(expectedRows, gotRows, key = 'id') {
  const got = byId(gotRows.filter((r) => ids.includes(String(r[key]))), key);
  const problems = [];
  if (got.size !== expectedRows.length) problems.push(`row count: expected ${expectedRows.length} got ${got.size}`);
  for (const exp of expectedRows) {
    const g = got.get(String(exp[key]));
    if (!g) { problems.push(`${exp[key]}: missing from the response`); continue; }
    const d = firstDifference(exp, g);
    if (d) problems.push(`${exp[key]}: ${d}`);
    if (problems.length >= 5) break;
  }
  return problems;
}

describe('GET /api/admin/students (unpaged)', () => {
  it('returns the same JSON as loading whole documents', async () => {
    const docs = await User.find({ _id: { $in: ids } }).select('-password');
    const res = await request(app).get('/api/admin/students').set(as(admin));
    expect(res.status).toBe(200);
    expect(compare(docs.map((d) => plain(d.toJSON())), res.body)).toEqual([]);
  });

  it('matches for a narrowed ?fields= selection', async () => {
    const docs = await User.find({ _id: { $in: ids } }).select('name email status applications onboarding');
    const res = await request(app).get('/api/admin/students?fields=name,email,status,applications,onboarding').set(as(admin));
    expect(res.status).toBe(200);
    expect(compare(docs.map((d) => plain(d.toJSON())), res.body)).toEqual([]);
  });

  it('matches for a dotted selection, which is read as documents', async () => {
    const docs = await User.find({ _id: { $in: ids } }).select('name englishScore.score');
    const res = await request(app).get('/api/admin/students?fields=name,englishScore.score').set(as(admin));
    expect(res.status).toBe(200);
    expect(compare(docs.map((d) => plain(d.toJSON())), res.body)).toEqual([]);
  });

  it('never returns a secret', async () => {
    const res = await request(app).get('/api/admin/students').set(as(admin));
    for (const row of res.body) {
      for (const k of ['password', 'sessions', 'emailVerifyToken', 'resetPasswordToken', 'loginAttempts', 'counselorNotes']) {
        expect(row[k], k).toBeUndefined();
      }
    }
  });
});

describe('GET /api/admin/applications (unpaged)', () => {
  it('flattens applications exactly as the document-based version did', async () => {
    const docs = await User.find({ _id: { $in: ids } }).select('name email nationality applications');
    const expected = [];
    for (const s of docs) {
      for (const a of (s.applications || [])) {
        expected.push({
          ...plain(a.toJSON ? a.toJSON() : a),
          studentId: s._id.toString(), studentName: s.name, studentEmail: s.email, studentNationality: s.nationality,
        });
      }
    }
    const res = await request(app).get('/api/admin/applications').set(as(admin));
    expect(res.status).toBe(200);
    const got = res.body.filter((a) => ids.includes(String(a.studentId)));
    expect(got).toHaveLength(expected.length);
    expect(expected.length).toBeGreaterThan(20); // the sample really contains applications

    // Paired by position within the student: an application stored without an _id gets a new random one on every load,
    // so the id cannot be the key.
    const keyed = (rows) => {
      const seen = new Map();
      return new Map(rows.map((a) => {
        const n = seen.get(a.studentId) || 0;
        seen.set(a.studentId, n + 1);
        return [`${a.studentId}#${n}`, a];
      }));
    };
    const expectedByKey = keyed(expected);
    const gotByKey = keyed(got);
    const problems = [];
    for (const [key, exp] of expectedByKey) {
      const g = gotByKey.get(key);
      if (!g) { problems.push(`${key}: missing`); continue; }
      // an application with no stored _id has a different minted one on each load; its presence is what is compared
      const sameId = exp._id && g._id && /^[0-9a-f]{24}$/.test(exp._id) && /^[0-9a-f]{24}$/.test(g._id);
      const d = firstDifference(sameId ? { ...exp, _id: 'id' } : exp, sameId ? { ...g, _id: 'id' } : g);
      if (d) problems.push(`${key}: ${d}`);
      if (problems.length >= 5) break;
    }
    expect(problems).toEqual([]);
  });
});

describe('GET /api/students (counselor, unpaged)', () => {
  it('returns the same JSON, and the audit trail names the same fields per student as before', async () => {
    const docs = await User.find({ _id: { $in: ids } }).select('-password');
    await PiiAccessLog.deleteMany({ accessorId: counselor.id });

    const res = await request(app).get('/api/students').set(as(counselor));
    expect(res.status).toBe(200);
    expect(compare(docs.map((d) => plain(d.toJSON())), res.body)).toEqual([]);

    // what the audit used to record, worked out from the loaded documents
    const expectedAudit = new Map();
    for (const d of docs) {
      const present = fieldsPresentOn(d);
      if (present.length) expectedAudit.set(String(d._id), present.sort().join(','));
    }

    let entries = [];
    for (let i = 0; i < 100; i++) {
      entries = await PiiAccessLog.find({ accessorId: counselor.id, accessType: 'list' });
      const mine = entries.filter((e) => ids.includes(String(e.applicantId)));
      if (mine.length >= expectedAudit.size) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const actual = new Map();
    for (const e of entries) if (ids.includes(String(e.applicantId))) actual.set(String(e.applicantId), [...e.fieldsAccessed].sort().join(','));

    expect(actual.size).toBe(expectedAudit.size);
    const mismatches = [];
    for (const [id, fields] of expectedAudit) if (actual.get(id) !== fields) mismatches.push(`${id}: expected [${fields}] got [${actual.get(id)}]`);
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});
