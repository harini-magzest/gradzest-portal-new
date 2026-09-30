const request = require('supertest');
const crypto = require('crypto');
const { app } = require('../app');
const User = require('../models/User');

describe('Multi-session support', () => {
  it('lets two devices refresh independently without kicking each other out', async () => {
    const email = `sessions-${Date.now()}@example.com`;
    const deviceA = request.agent(app);
    const deviceB = request.agent(app);

    await deviceA.post('/api/auth/register').set('User-Agent', 'DeviceA/1.0')
      .send({ name: 'Session Test', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true });

    const loginB = await deviceB.post('/api/auth/login').set('User-Agent', 'DeviceB/1.0')
      .send({ email, password: 'TestPass123!' });
    expect(loginB.status).toBe(200);

    // Both devices should be able to refresh independently — this is the actual bug fix.
    const refreshA = await deviceA.post('/api/auth/refresh');
    expect(refreshA.status).toBe(200);
    expect(refreshA.body.token).toBeDefined();

    const refreshB = await deviceB.post('/api/auth/refresh');
    expect(refreshB.status).toBe(200);
    expect(refreshB.body.token).toBeDefined();

    // Device A refreshing again after B did should still work (A's session wasn't touched by B).
    const refreshA2 = await deviceA.post('/api/auth/refresh');
    expect(refreshA2.status).toBe(200);
  });

  it('lists both sessions via GET /sessions and revoking one does not affect the other', async () => {
    const email = `sessions-list-${Date.now()}@example.com`;
    const deviceA = request.agent(app);
    const deviceB = request.agent(app);

    const regA = await deviceA.post('/api/auth/register').set('User-Agent', 'DeviceA/1.0')
      .send({ name: 'Session Test', email, password: 'TestPass123!' });
    const tokenA = regA.body.token;
    await User.findOneAndUpdate({ email }, { emailVerified: true });

    await deviceB.post('/api/auth/login').set('User-Agent', 'DeviceB/1.0')
      .send({ email, password: 'TestPass123!' });

    const listRes = await deviceA.get('/api/auth/sessions').set('Authorization', `Bearer ${tokenA}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.sessions.length).toBeGreaterThanOrEqual(2);

    const other = listRes.body.sessions.find((s) => !s.isCurrent);
    expect(other).toBeDefined();

    const delRes = await deviceA.delete(`/api/auth/sessions/${other.id}`).set('Authorization', `Bearer ${tokenA}`);
    expect(delRes.status).toBe(200);

    // Device B's session was the one revoked — its next refresh should fail.
    const refreshB = await deviceB.post('/api/auth/refresh');
    expect(refreshB.status).toBe(401);

    // Device A is untouched.
    const refreshA = await deviceA.post('/api/auth/refresh');
    expect(refreshA.status).toBe(200);
  });

  it('password reset invalidates every session on every device', async () => {
    const email = `sessions-reset-${Date.now()}@example.com`;
    const deviceA = request.agent(app);
    const deviceB = request.agent(app);

    await deviceA.post('/api/auth/register').set('User-Agent', 'DeviceA/1.0')
      .send({ name: 'Session Test', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true });
    await deviceB.post('/api/auth/login').set('User-Agent', 'DeviceB/1.0')
      .send({ email, password: 'TestPass123!' });

    const user = await User.findOne({ email });
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewPass456!' });
    expect(resetRes.status).toBe(200);

    const refreshA = await deviceA.post('/api/auth/refresh');
    expect(refreshA.status).toBe(401);
    const refreshB = await deviceB.post('/api/auth/refresh');
    expect(refreshB.status).toBe(401);
  });
});
