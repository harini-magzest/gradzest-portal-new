// "Needs attention" must stay true when the backlog is large. It used to read only the newest 500 open incidents, so with
// more than that the oldest (the most overdue, the ones that most need a human) vanished from it and every count was capped.
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const SecurityIncident = require('../models/SecurityIncident');

const PASSWORD = 'TestPass123!';
let n = 0;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function signedInAdmin() {
  const email = `attention-scale-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'Attention Admin', email, password: PASSWORD });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role: 'admin' });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe('GET /api/soc/attention with a large backlog', () => {
  it('still surfaces the oldest unacknowledged high-severity incident, and counts every open incident', async () => {
    const token = await signedInAdmin();
    const day = 24 * 3600 * 1000;
    const before = await SecurityIncident.countDocuments({ status: { $in: ['open', 'investigating'] } });

    await SecurityIncident.create({
      type: 'brute_force', severity: 'high', status: 'open', title: 'OLDEST unacknowledged high incident',
      createdAt: new Date(Date.now() - 10 * day),
    });
    // More recent, lower-severity open incidents than the old 500-row window could hold
    await SecurityIncident.insertMany(Array.from({ length: 520 }, (_, i) => ({
      type: 'suspicious_ip', severity: 'low', status: 'open', title: `Noise ${i}`, createdAt: new Date(Date.now() - i * 1000),
    })));

    const res = await request(app).get('/api/soc/attention').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.unacknowledged.map((i) => i.title)).toContain('OLDEST unacknowledged high incident');
    expect(res.body.counts.openTotal).toBe(before + 521);
    expect(res.body.counts.slaBreached).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('reports every locked account, not only the first ten it lists', async () => {
    const token = await signedInAdmin();
    const lockedUntil = new Date(Date.now() + 3600 * 1000);
    const before = await User.countDocuments({ lockedUntil: { $gt: new Date() } });
    await User.insertMany(Array.from({ length: 12 }, (_, i) => ({
      name: `Locked ${i}`, email: `locked-${Date.now()}-${n++}-${i}@example.com`, password: 'x'.repeat(20), role: 'student', lockedUntil,
    })));

    const res = await request(app).get('/api/soc/attention').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.locked.length).toBeLessThanOrEqual(10); // the list itself stays short
    expect(res.body.counts.lockedAccounts).toBe(before + 12); // the count does not
  }, 60000);
});
