const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Referral = require('../models/Referral');
const { generateCode, progressOf, maskName } = require('../lib/referrals');

describe('referral helpers', () => {
  it('makes 8-character codes without look-alike characters', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);
    expect(new Set(Array.from({ length: 200 }, generateCode)).size).toBeGreaterThan(190);
  });

  it('works out how far a referred student has got', () => {
    expect(progressOf({ applications: [] })).toBe('signed_up');
    expect(progressOf({ applications: [{ status: 'draft' }] })).toBe('signed_up');
    expect(progressOf({ applications: [{ status: 'submitted' }] })).toBe('applied');
    expect(progressOf({ applications: [{ status: 'rejected' }, { status: 'offer_received' }] })).toBe('offer');
    expect(progressOf({ applications: [{ status: 'enrolled' }, { status: 'draft' }] })).toBe('enrolled');
    expect(progressOf(null)).toBe('signed_up');
  });

  it('shortens names', () => {
    expect(maskName('Asha Kumar')).toBe('Asha K.');
    expect(maskName('Asha')).toBe('Asha');
    expect(maskName('Asha Devi Kumar')).toBe('Asha K.');
    expect(maskName('')).toBe('A friend');
  });
});

let n = 0;
async function mk(role, extra = {}) {
  const email = `ref-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `R ${role} Person`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

async function signUpWith(ref) {
  const email = `ref-new-${Date.now()}-${n++}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ name: 'Newcomer Student', email, password: 'TestPass123!', ref });
  return { res, id: res.body.user?.id, email };
}

describe('a student shares a referral code', () => {
  it('gets a stable code and link', async () => {
    const student = await mk('student');
    const a = await request(app).get('/api/referrals/me').set(as(student));
    expect(a.status).toBe(200);
    expect(a.body.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(a.body.link).toBe(`http://localhost:5173/?ref=${a.body.code}`);
    expect(a.body.referrals).toEqual([]);
    const b = await request(app).get('/api/referrals/me').set(as(student));
    expect(b.body.code).toBe(a.body.code);
  });

  it('is for students only', async () => {
    expect((await request(app).get('/api/referrals/me').set(as(await mk('counselor')))).status).toBe(403);
    expect((await request(app).get('/api/referrals/me')).status).toBe(401);
  });

  it('links a new sign-up to the referrer, and shows only a shortened name', async () => {
    const referrer = await mk('student');
    const { body: mine } = await request(app).get('/api/referrals/me').set(as(referrer));
    const { res, id } = await signUpWith(mine.code.toLowerCase()); // codes are matched case-insensitively
    expect(res.status).toBe(201);
    expect(await Referral.countDocuments({ referrerId: referrer.id, referredId: id })).toBe(1);

    const after = await request(app).get('/api/referrals/me').set(as(referrer));
    expect(after.body.referrals).toHaveLength(1);
    expect(after.body.referrals[0]).toMatchObject({ name: 'Newcomer S.', status: 'signed_up', rewardEarned: false });
    expect(JSON.stringify(after.body)).not.toContain('@example.com');

    await User.findByIdAndUpdate(id, { $push: { applications: { universityName: 'U', courseName: 'C', status: 'enrolled' } } });
    const done = await request(app).get('/api/referrals/me').set(as(referrer));
    expect(done.body.referrals[0]).toMatchObject({ status: 'enrolled', rewardEarned: true, rewardPaid: false });
    expect(done.body.stats).toMatchObject({ total: 1, enrolled: 1, paid: 0 });
  });

  it('still signs people up when the code is wrong or malformed', async () => {
    for (const ref of ['NOSUCHCODE', '!!', 'a'.repeat(50), '']) {
      const { res } = await signUpWith(ref);
      expect(res.status).toBe(201);
    }
  });
});

describe('admin hands out rewards', () => {
  it('lists referrals and only marks paid once the referred student enrolled', async () => {
    const admin = await mk('admin');
    const referrer = await mk('student');
    const { body: mine } = await request(app).get('/api/referrals/me').set(as(referrer));
    const { id: referredId } = await signUpWith(mine.code);

    const list = await request(app).get('/api/referrals').set(as(admin));
    const row = list.body.referrals.find((r) => r.referrerEmail === referrer.email);
    expect(row).toMatchObject({ referredName: 'Newcomer Student', status: 'signed_up', rewardEarned: false, paid: false });

    expect((await request(app).put(`/api/referrals/${row.id}/paid`).set(as(admin)).send({ paid: true })).status).toBe(409);

    await User.findByIdAndUpdate(referredId, { $push: { applications: { universityName: 'U', courseName: 'C', status: 'enrolled' } } });
    const paid = await request(app).put(`/api/referrals/${row.id}/paid`).set(as(admin)).send({ paid: true, note: 'Voucher sent' });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ paid: true, paidNote: 'Voucher sent' });
    expect((await request(app).get('/api/referrals/me').set(as(referrer))).body.referrals[0].rewardPaid).toBe(true);

    const undone = await request(app).put(`/api/referrals/${row.id}/paid`).set(as(admin)).send({ paid: false });
    expect(undone.body.paid).toBe(false);
  });

  it('is admin only and validates input', async () => {
    const admin = await mk('admin');
    const counselor = await mk('counselor');
    expect((await request(app).get('/api/referrals').set(as(counselor))).status).toBe(403);
    expect((await request(app).put('/api/referrals/xyz/paid').set(as(admin)).send({ paid: true })).status).toBe(404);
    expect((await request(app).put('/api/referrals/507f1f77bcf86cd799439011/paid').set(as(admin)).send({ paid: 'yes' })).status).toBe(400);
    expect((await request(app).put('/api/referrals/507f1f77bcf86cd799439011/paid').set(as(admin)).send({ paid: true })).status).toBe(404);
  });
});
