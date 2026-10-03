const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');

let n = 0;
async function mk(role, extra = {}) {
  const email = `dash-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Dash ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('dashboard summary endpoints are role-gated', () => {
  it('counselor follow-ups are for counselors only', async () => {
    const counselor = await mk('counselor');
    const admin = await mk('admin');
    const student = await mk('student');
    expect((await request(app).get('/api/dashboards/counselor/followups').set(as(counselor))).status).toBe(200);
    expect((await request(app).get('/api/dashboards/counselor/followups').set(as(admin))).status).toBe(403);
    expect((await request(app).get('/api/dashboards/counselor/followups').set(as(student))).status).toBe(403);
  });

  it('team workload, funnel and trends are admin-only (App Team and Board are admin accounts)', async () => {
    const counselor = await mk('counselor');
    const admin = await mk('admin');
    for (const path of ['team-workload', 'funnel']) {
      expect((await request(app).get(`/api/dashboards/admin/${path}`).set(as(counselor))).status).toBe(403);
      expect((await request(app).get(`/api/dashboards/admin/${path}`).set(as(admin))).status).toBe(200);
    }
    expect((await request(app).get('/api/dashboards/trends').set(as(counselor))).status).toBe(403);
  });

  it('search is limited to staff and to their own students for counselors', async () => {
    const student = await mk('student');
    expect((await request(app).get('/api/dashboards/search?q=ab').set(as(student))).status).toBe(403);
    const counselor = await mk('counselor');
    const admin = await mk('admin');
    const tag = `Zed${Date.now()}`;
    await User.create({ name: `${tag} Mine`, role: 'student', email: `${tag}-mine@example.com`, counselorId: counselor.id });
    await User.create({ name: `${tag} Theirs`, role: 'student', email: `${tag}-theirs@example.com`, counselorId: String(new (require('mongoose').Types.ObjectId)()) });
    const forCounselor = await request(app).get(`/api/dashboards/search?q=${tag}`).set(as(counselor));
    expect(forCounselor.body.students.map(s => s.name)).toEqual([`${tag} Mine`]);
    const forAdmin = await request(app).get(`/api/dashboards/search?q=${tag}`).set(as(admin));
    expect(forAdmin.body.students.length).toBe(2);
  });
});

describe('dashboard summary response shapes', () => {
  it('funnel lists every lead stage in order, with counts', async () => {
    const admin = await mk('admin');
    const res = await request(app).get('/api/dashboards/admin/funnel').set(as(admin));
    expect(res.body.stages[0].key).toBe('new_enquiry');
    expect(res.body.stages.every(s => typeof s.count === 'number')).toBe(true);
  });

  it('trends returns exactly eight ISO weeks, oldest first', async () => {
    const admin = await mk('admin');
    const res = await request(app).get('/api/dashboards/trends').set(as(admin));
    expect(res.body.weeks).toHaveLength(8);
    expect(res.body.weeks[7].week).toMatch(/^\d{4}-W\d{2}$/);
  });
});
