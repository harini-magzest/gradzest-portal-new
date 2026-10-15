// The student page's tab counts and country list are remembered while no user has been written (lib/userVersion.js).
// What matters: it is used when nothing changed, and never shows a number from before a change.
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const adminLists = require('../lib/adminLists');
const { eraseStudent } = require('../lib/studentData');

const tag = `sumcache-${Date.now()}`;
let n = 0;
async function mk(role, extra = {}) {
  const email = `${tag}-${role}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `${tag} ${role}`, email, password: 'TestPass123!' });
  const user = await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra }, { new: true });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: login.body.token, id: String(user._id), email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const page = (admin) => request(app).get('/api/admin/students?page=1&limit=5').set(as(admin));

let admin;
beforeAll(async () => {
  adminLists.setSummaryTtl(60_000);
  admin = await mk('admin');
});
afterAll(() => adminLists.setSummaryTtl(0));

describe('student page summary cache', () => {
  it('reads the counts and countries once while nothing is written', async () => {
    await mk('student', { status: 'active', preferredCountries: ['Canada'] });
    const first = await page(admin);
    expect(first.status).toBe(200);

    const distinct = vi.spyOn(User, 'distinct');
    const second = await page(admin);
    const third = await page(admin);
    expect(distinct).not.toHaveBeenCalled();
    expect(second.body.counts).toEqual(first.body.counts);
    expect(third.body.countries).toEqual(first.body.countries);
    distinct.mockRestore();
  });

  it('is dropped by a write made through the model, so a change shows at once', async () => {
    const s = await mk('student', { status: 'active' });
    const before = (await page(admin)).body.counts;

    // the route an admin uses to change a status
    const put = await request(app).put(`/api/admin/students/${s.id}/status`).set(as(admin)).send({ status: 'inactive' });
    expect(put.status).toBe(200);

    const after = (await page(admin)).body.counts;
    expect(after.inactive).toBe(before.inactive + 1);
    expect(after.total).toBe(before.total);
  });

  it('is dropped when a student is added or removed', async () => {
    const before = (await page(admin)).body.counts;
    const s = await mk('student', { status: 'active', preferredCountries: [`${tag}-Atlantis`] });
    const afterAdd = await page(admin);
    expect(afterAdd.body.counts.total).toBe(before.total + 1);
    expect(afterAdd.body.countries).toContain(`${tag}-Atlantis`);

    await User.deleteOne({ _id: s.id });
    const afterRemove = await page(admin);
    expect(afterRemove.body.counts.total).toBe(before.total);
    expect(afterRemove.body.countries).not.toContain(`${tag}-Atlantis`);
  });

  it('is dropped by the erasure of a student, which is a raw write', async () => {
    const s = await mk('student', { status: 'active', preferredCountries: [`${tag}-Lemuria`], leadStatus: 'new' });
    const withHim = await page(admin);
    expect(withHim.body.countries).toContain(`${tag}-Lemuria`);

    await eraseStudent(s.id);
    const without = await page(admin);
    expect(without.body.countries).not.toContain(`${tag}-Lemuria`);
    expect(without.body.counts.newLeads).toBe(withHim.body.counts.newLeads - 1);
  });
});
