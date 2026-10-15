const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const SecurityEvent = require('../models/SecurityEvent');
const { getScore } = require('../lib/skyload/riskRegistry');

const LOCAL_IPS = ['::ffff:127.0.0.1', '127.0.0.1', '::1'];
let n = 0;
async function login(role, extra = {}) {
  const email = `sky-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'Sky', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  return (await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' })).body.token;
}
const maxScore = () => Math.max(...LOCAL_IPS.map((ip) => getScore(ip) || 0));
const botFlags = () => SecurityEvent.countDocuments({ type: 'skyload_bot_flag' });

describe('Skyload does not treat the SOC owner\'s own dashboard as a bot', () => {
  it('a burst of 60 SOC requests with a full-admin token all succeed, raise no bot flags and leave the IP\'s risk score alone', async () => {
    const admin = await login('admin');
    const flagsBefore = await botFlags();
    const scoreBefore = maxScore();
    const results = await Promise.all(Array.from({ length: 60 }, () => request(app).get('/api/soc/analysts').set({ Authorization: `Bearer ${admin}` })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(await botFlags()).toBe(flagsBefore);
    // (the score may only have decayed: the login calls above are headerless supertest requests and carry their own baseline)
    expect(maxScore()).toBeLessThanOrEqual(scoreBefore + 0.001);
  });

  it('a signed-in student or Application Team burst is not bot-scored (counted per user), but an anonymous burst still is', async () => {
    const student = await login('student');
    const appTeam = await login('admin', { isAppTeam: true });
    const flagsBefore = await botFlags();
    await Promise.all(Array.from({ length: 40 }, () => request(app).get('/api/soc/analysts').set({ Authorization: `Bearer ${student}` })));
    await Promise.all(Array.from({ length: 40 }, () => request(app).get('/api/soc/analysts').set({ Authorization: `Bearer ${appTeam}` })));
    await new Promise((r) => setTimeout(r, 300));
    // Signed-in traffic is accounted against the user and never velocity-scored (see lib/clientKey.js): a normal page load
    // is dozens of requests and must not flag the person's own account. Their volume is still capped per user.
    expect(await botFlags()).toBe(flagsBefore);

    await Promise.all(Array.from({ length: 40 }, () => request(app).get('/api/soc/analysts')));
    await new Promise((r) => setTimeout(r, 400));
    expect(await botFlags()).toBeGreaterThan(flagsBefore); // anonymous: still scored exactly as before
    expect(maxScore()).toBeGreaterThanOrEqual(5);
  });

  it('a forged or expired admin token does not earn the exemption', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ id: 'x', role: 'admin' }, 'not-the-real-secret');
    const flagsBefore = await botFlags();
    await Promise.all(Array.from({ length: 45 }, () => request(app).get('/api/soc/analysts').set({ Authorization: `Bearer ${forged}` })));
    await new Promise((r) => setTimeout(r, 300));
    expect(await botFlags()).toBeGreaterThan(flagsBefore);
  });
});

describe('isTrustedSocAdmin (shared by Skyload and the general rate limiter)', () => {
  const jwt = require('jsonwebtoken');
  const { isTrustedSocAdmin } = require('../middleware/skyload');
  const reqFor = (url, token) => ({ originalUrl: url, url, path: url.split('?')[0], headers: token ? { authorization: `Bearer ${token}` } : {} });
  const sign = (p) => jwt.sign(p, process.env.JWT_SECRET);

  it('trusts a full admin on /api/soc paths, including relative paths seen by a limiter mounted under /api', () => {
    const t = sign({ id: 'a', role: 'admin' });
    expect(isTrustedSocAdmin(reqFor('/api/soc/stats?period=24h', t))).toBe(true);
    expect(isTrustedSocAdmin(reqFor('/api/soc', t))).toBe(true);
    // a limiter mounted at /api sees req.path === '/soc/stats' but originalUrl is still the full URL
    expect(isTrustedSocAdmin({ path: '/soc/stats', originalUrl: '/api/soc/stats', headers: { authorization: `Bearer ${t}` } })).toBe(true);
  });

  it('does not trust lookalike paths, other roles, app-team admins, bad tokens or no token', () => {
    const admin = sign({ id: 'a', role: 'admin' });
    expect(isTrustedSocAdmin(reqFor('/api/socks', admin))).toBe(false);
    expect(isTrustedSocAdmin(reqFor('/api/students', admin))).toBe(false);
    expect(isTrustedSocAdmin(reqFor('/api/soc/stats', sign({ id: 'c', role: 'counselor' })))).toBe(false);
    expect(isTrustedSocAdmin(reqFor('/api/soc/stats', sign({ id: 'x', role: 'admin', isAppTeam: true })))).toBe(false);
    expect(isTrustedSocAdmin(reqFor('/api/soc/stats', jwt.sign({ id: 'a', role: 'admin' }, 'wrong-secret')))).toBe(false);
    expect(isTrustedSocAdmin(reqFor('/api/soc/stats'))).toBe(false);
  });

  it('as a rate-limiter skip: owner is never limited, everyone else still is', async () => {
    const express = require('express');
    const rateLimit = require('express-rate-limit');
    const probe = express();
    probe.use('/api', rateLimit({ windowMs: 60000, max: 3, skip: isTrustedSocAdmin, standardHeaders: true, legacyHeaders: false }));
    probe.get('/api/soc/ping', (_q, r) => r.json({ ok: true }));
    probe.get('/api/other/ping', (_q, r) => r.json({ ok: true }));
    const admin = sign({ id: 'a', role: 'admin' });
    for (let i = 0; i < 20; i++) {
      expect((await request(probe).get('/api/soc/ping').set('Authorization', `Bearer ${admin}`)).status).toBe(200);
    }
    const anon = [];
    for (let i = 0; i < 6; i++) anon.push((await request(probe).get('/api/other/ping')).status);
    expect(anon.filter((s) => s === 429).length).toBeGreaterThanOrEqual(3);
  });
});
