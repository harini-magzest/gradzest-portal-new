// The unpaged student and application lists: opt-in field selection (lib/fieldSelect.js), the applications list
// reading only the fields it builds its result from, and the PII audit written in one batch (lib/logPiiAccess.js).
// What must not change is asserted too: the default response, and one audit entry per listed student.
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const PiiAccessLog = require('../models/PiiAccessLog');
const { parseFields, selectFor, MAX_FIELDS } = require('../lib/fieldSelect');

describe('parseFields', () => {
  it('returns null when nothing usable was asked for', () => {
    expect(parseFields(undefined)).toBeNull();
    expect(parseFields('')).toBeNull();
    expect(parseFields('   ')).toBeNull();
    expect(parseFields(['name'])).toBeNull();
    expect(parseFields(',,,')).toBeNull();
  });

  it('trims, de-duplicates and keeps nested paths', () => {
    expect(parseFields(' name , email,name,englishScore.score ')).toEqual(['name', 'email', 'englishScore.score']);
  });

  it('can never select a secret, however it is spelled', () => {
    const asked = 'password,sessions,sessions.tokenHash,twoFactor.secret,twoFactor,emailVerifyToken,resetPasswordToken,loginAttempts,lockedUntil,counselorNotes,__v,name';
    expect(parseFields(asked)).toEqual(['name']);
  });

  it('drops anything that is not a plain field name', () => {
    expect(parseFields('$where,name;drop,a..b,-password,+password,{x},a.b.c.d.e,ok')).toEqual(['ok']);
  });

  it('caps how many fields one request can name', () => {
    const many = Array.from({ length: 80 }, (_, i) => `f${i}`).join(',');
    expect(parseFields(many)).toHaveLength(MAX_FIELDS);
  });

  it('selectFor falls back to the caller default', () => {
    expect(selectFor(undefined)).toBe('-password');
    expect(selectFor('password')).toBe('-password');
    expect(selectFor('name,email')).toBe('name email');
    expect(selectFor(undefined, '-password -sessions')).toBe('-password -sessions');
  });
});

let n = 0;
const tag = `listperf-${Date.now()}`;
async function mk(role, extra = {}) {
  const email = `${tag}-${role}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `${tag} ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: login.body.token, id: login.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('unpaged student list (admin)', () => {
  it('returns whole records by default and only the asked-for fields with ?fields=', async () => {
    const admin = await mk('admin');
    const s = await mk('student', { phone: '+919876543210', nationality: 'Indian', applications: [{ universityId: 'u1', universityName: 'Uni One', course: 'MSc', status: 'draft' }] });

    const full = await request(app).get('/api/admin/students').set(as(admin));
    expect(full.status).toBe(200);
    const mineFull = full.body.find((x) => x.id === s.id);
    expect(mineFull.phone).toBe('+919876543210');
    expect(mineFull.applications).toHaveLength(1);
    expect(mineFull.password).toBeUndefined();

    const slim = await request(app).get('/api/admin/students?fields=name,email,phone').set(as(admin));
    expect(slim.status).toBe(200);
    const mineSlim = slim.body.find((x) => x.id === s.id);
    expect(mineSlim.name).toBe(`${tag} student`);
    expect(mineSlim.email).toBe(s.email);
    expect(mineSlim.phone).toBe('+919876543210');
    expect(mineSlim.applications).toBeUndefined();
    expect(mineSlim.nationality).toBeUndefined();
  });

  it('never returns a secret, even when it is named', async () => {
    const admin = await mk('admin');
    const res = await request(app).get('/api/admin/students?fields=password,sessions,emailVerifyToken,twoFactor,name').set(as(admin));
    expect(res.status).toBe(200);
    for (const row of res.body) {
      for (const k of ['password', 'sessions', 'emailVerifyToken', 'resetPasswordToken', 'loginAttempts', 'twoFactor']) {
        expect(row[k], k).toBeUndefined();
      }
    }
  });

  it('ignores ?fields= when a page is asked for (the page keeps its own shape)', async () => {
    const admin = await mk('admin');
    const res = await request(app).get('/api/admin/students?page=1&limit=5&fields=name').set(as(admin));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe('unpaged applications list (admin)', () => {
  it('flattens every application with the student fields, and skips students with none', async () => {
    const admin = await mk('admin');
    const withApps = await mk('student', {
      nationality: 'Nepalese',
      phone: '+977123456789',
      applications: [
        { universityId: 'u1', universityName: 'Uni One', course: 'MSc A', status: 'submitted' },
        { universityId: 'u2', universityName: 'Uni Two', course: 'MSc B', status: 'draft' },
      ],
    });
    const without = await mk('student');

    const res = await request(app).get('/api/admin/applications').set(as(admin));
    expect(res.status).toBe(200);
    const mine = res.body.filter((a) => a.studentId === withApps.id);
    expect(mine).toHaveLength(2);
    expect(mine.map((a) => a.universityName).sort()).toEqual(['Uni One', 'Uni Two']);
    for (const a of mine) {
      expect(a.studentName).toBe(`${tag} student`);
      expect(a.studentEmail).toBe(withApps.email);
      expect(a.studentNationality).toBe('Nepalese');
      expect(a.phone).toBeUndefined(); // student fields beyond the four are not copied in
    }
    expect(res.body.some((a) => a.studentId === without.id)).toBe(false);
  });
});

describe('counselor student list and its audit trail', () => {
  // The audit has always treated an empty `documents` array (a schema default) as present, so every listed student is
  // logged, with the phone named only where there is one. These tests pin that, so batching cannot change it.
  it('writes one audit entry per listed student, naming the phone where the student has one', async () => {
    const counselor = await mk('counselor');
    const a = await mk('student', { phone: '+911111111111' });
    const b = await mk('student', { phone: '+912222222222' });
    const c = await mk('student');
    await PiiAccessLog.deleteMany({ accessorId: counselor.id });

    const res = await request(app).get('/api/students').set(as(counselor));
    expect(res.status).toBe(200);
    expect(res.body.map((x) => x.id)).toEqual(expect.arrayContaining([a.id, b.id, c.id]));

    const entries = await waitFor(async () => {
      const found = await PiiAccessLog.find({ accessorId: counselor.id, accessType: 'list' });
      return found.length >= res.body.length ? found : null;
    });
    expect(entries).toBeTruthy();
    expect(entries).toHaveLength(res.body.length);               // one per student, no more, no fewer
    const byApplicant = new Map(entries.map((e) => [String(e.applicantId), e]));
    expect(byApplicant.get(a.id).fieldsAccessed).toContain('phone');
    expect(byApplicant.get(b.id).fieldsAccessed).toContain('phone');
    expect(byApplicant.get(c.id).fieldsAccessed).not.toContain('phone');
    for (const e of entries) expect(e.accessorRole).toBe('counselor');
  });

  it('a name-only list sends no phone and writes no audit entry: nothing sensitive was selected', async () => {
    const counselor = await mk('counselor');
    const s = await mk('student', { phone: '+913333333333' });
    await PiiAccessLog.deleteMany({ accessorId: counselor.id });

    const res = await request(app).get('/api/students?fields=name,email').set(as(counselor));
    expect(res.status).toBe(200);
    const row = res.body.find((x) => x.id === s.id);
    expect(row.name).toBeTruthy();
    expect(row.phone).toBeUndefined();

    await new Promise((r) => setTimeout(r, 500));
    expect(await PiiAccessLog.countDocuments({ accessorId: counselor.id })).toBe(0);
  });

  it('a list that selects the phone is audited for the phone, and only for what it selected', async () => {
    const counselor = await mk('counselor');
    const s = await mk('student', { phone: '+914444444444' });
    await PiiAccessLog.deleteMany({ accessorId: counselor.id });

    const res = await request(app).get('/api/students?fields=name,phone').set(as(counselor));
    expect(res.status).toBe(200);
    expect(res.body.find((x) => x.id === s.id).phone).toBe('+914444444444');

    const entries = await waitFor(async () => {
      const found = await PiiAccessLog.find({ accessorId: counselor.id, applicantId: s.id });
      return found.length ? found : null;
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].fieldsAccessed).toEqual(['phone']);        // not `documents`: that was never selected
  });
});
