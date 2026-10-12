const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../app');
const User = require('../models/User');

let n = 0;
async function signUp() {
  const email = `rh-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'Hardening Test', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true });
  return request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
}

describe('response hardening', () => {
  it('refuses TRACE and unknown HTTP methods with 405', async () => {
    const res = await request(app).trace('/api/health');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toMatch(/GET/);
  });

  it('health says whether the service is up, not which environment it runs in', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).not.toHaveProperty('env');
    expect(res.body).not.toHaveProperty('uptime');
  });

  it('a signed-in user object never carries the password hash, sessions or one-time tokens', async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    for (const field of ['password', 'sessions', 'emailVerifyToken', 'resetPasswordToken', 'loginAttempts']) {
      expect(res.body.user).not.toHaveProperty(field);
    }
    const me = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` });
    expect(me.body).not.toHaveProperty('sessions');
    expect(me.body).not.toHaveProperty('password');
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const res = await signUp();
    const { id } = jwt.decode(res.body.token);
    const forged = jwt.sign({ id, role: 'admin' }, null, { algorithm: 'none' });
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${forged}` })).status).toBe(401);
  });
});
