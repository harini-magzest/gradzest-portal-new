const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { buildConversion } = require('../lib/conversionReport');

const st = (over) => ({ createdAt: new Date('2026-09-10'), applications: [], preferredCountries: [], ...over });

describe('buildConversion', () => {
  const students = [
    st({ counselorId: 'c1', source: 'self_signup', preferredCountries: ['UK'], applications: [{ status: 'enrolled' }] }),
    st({ counselorId: 'c1', source: 'self_signup', preferredCountries: ['UK', 'Canada'], applications: [{ status: 'offer_received' }, { status: 'rejected' }] }),
    st({ counselorId: 'c1', source: 'admin_created', preferredCountries: ['Canada'], applications: [{ status: 'submitted' }] }),
    st({ counselorId: 'c1', source: 'self_signup', applications: [{ status: 'draft' }] }),
    st({ counselorId: 'c2', source: 'counselor_created', preferredCountries: ['UK'] }),
    st({ source: 'self_signup' }),
  ];
  const names = new Map([['c1', 'Asha'], ['c2', 'Ravi']]);

  it('groups by counselor with funnel counts and rates', () => {
    const r = buildConversion(students, 'counselor', { counselorNames: names });
    const asha = r.rows.find((x) => x.group === 'Asha');
    expect(asha).toMatchObject({ leads: 4, applied: 3, offers: 2, enrolled: 1, leadToApplied: 75, appliedToOffer: 66.7, leadToEnrolled: 25 });
    expect(r.rows.map((x) => x.group)).toEqual(expect.arrayContaining(['Asha', 'Ravi', 'Unassigned']));
    expect(r.totals).toMatchObject({ leads: 6, applied: 3, offers: 2, enrolled: 1 });
  });

  it('does not count a draft as applied', () => {
    const r = buildConversion([st({ applications: [{ status: 'draft' }] })], 'source');
    expect(r.totals.applied).toBe(0);
  });

  it('counts a student under each of their countries, and under "Not specified" when none', () => {
    const r = buildConversion(students, 'country');
    expect(r.rows.find((x) => x.group === 'UK').leads).toBe(3);
    expect(r.rows.find((x) => x.group === 'Canada').leads).toBe(2);
    expect(r.rows.find((x) => x.group === 'Not specified').leads).toBe(2);
    expect(r.totals.leads).toBe(6); // totals count each student once
  });

  it('groups by lead source with readable labels', () => {
    const r = buildConversion(students, 'source');
    expect(r.rows.find((x) => x.group === 'Self sign-up').leads).toBe(4);
    expect(r.rows.find((x) => x.group === 'Added by admin').leads).toBe(1);
  });

  it('filters on the date the lead was created', () => {
    const mixed = [st({ createdAt: new Date('2026-08-01') }), st({ createdAt: new Date('2026-09-20') })];
    const r = buildConversion(mixed, 'source', { from: new Date('2026-09-01'), to: new Date('2026-09-30T23:59:59Z') });
    expect(r.totals.leads).toBe(1);
  });

  it('has zero rates, not NaN, for an empty group', () => {
    expect(buildConversion([], 'counselor').totals).toMatchObject({ leads: 0, leadToApplied: 0, appliedToOffer: 0, leadToEnrolled: 0 });
  });
});

let n = 0;
async function mk(role, extra = {}) {
  const email = `conv-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Conv ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('GET /api/dashboards/admin/conversion', () => {
  it('is admin only', async () => {
    const counselor = await mk('counselor');
    expect((await request(app).get('/api/dashboards/admin/conversion').set(as(counselor))).status).toBe(403);
  });

  it('returns the report as JSON and as a CSV download', async () => {
    const admin = await mk('admin');
    const counselor = await mk('counselor');
    await mk('student', { counselorId: counselor.id, applications: [{ universityName: 'U', courseName: 'C', status: 'enrolled' }] });

    const json = await request(app).get('/api/dashboards/admin/conversion?groupBy=counselor').set(as(admin));
    expect(json.status).toBe(200);
    expect(json.body.rows.find((r) => r.group === 'Conv counselor').enrolled).toBe(1);

    const csv = await request(app).get('/api/dashboards/admin/conversion?groupBy=counselor&format=csv').set(as(admin));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toBe('Counselor,Leads,Applied,Offers,Enrolled,Lead to applied %,Applied to offer %,Lead to enrolled %');
    expect(csv.text).toContain('Total,');
  });

  it('falls back to counselor grouping for an unknown groupBy', async () => {
    const admin = await mk('admin');
    const res = await request(app).get('/api/dashboards/admin/conversion?groupBy=bogus').set(as(admin));
    expect(res.body.groupBy).toBe('counselor');
  });
});
