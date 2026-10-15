// What the SOC's sign-out actions promise, and what the rest of the SOC's list endpoints cost.
//
// "Log out everywhere" and "Force password reset" tell the analyst that the person is signed out. An access token already
// issued is good for 15 minutes unless the account's sessionsRevokedAt moves past it (lib/accountState.js), so clearing
// the session list alone leaves the person working, with a live socket, for up to a quarter of an hour: the wrong
// behaviour for the button an analyst presses in the middle of an incident.
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const SecurityIncident = require('../models/SecurityIncident');
const SecurityEvent = require('../models/SecurityEvent');

const PASSWORD = 'TestPass123!';
let n = 0;
const uniq = (p) => `${p}-${Date.now()}-${n++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const me = (token) => request(app).get('/api/auth/me').set(auth(token));

async function signedIn(prefix, extra = {}) {
  const email = `${uniq(prefix)}@example.com`;
  await request(app).post('/api/auth/register').send({ name: prefix, email, password: PASSWORD });
  await User.findOneAndUpdate({ email }, { emailVerified: true, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return { email, id: String(res.body.user.id), token: res.body.token };
}

describe('SOC sign-out actions take effect at once', () => {
  it('log out everywhere: the access token the person already holds is refused straight away', async () => {
    const analyst = await signedIn('revoke-analyst', { role: 'admin' });
    const target = await signedIn('revoke-target');
    expect((await me(target.token)).status).toBe(200);

    const res = await request(app).post(`/api/soc/investigate/user/${target.id}/logout-everywhere`).set(auth(analyst.token));
    expect(res.status).toBe(200);

    const after = await me(target.token);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('SESSION_REVOKED');
    expect((await User.findById(target.id).lean()).sessions).toHaveLength(0);
  });

  it('log out everywhere: the person can sign in again afterwards, and the new token works', async () => {
    const analyst = await signedIn('revoke-analyst2', { role: 'admin' });
    const target = await signedIn('revoke-target2');
    await request(app).post(`/api/soc/investigate/user/${target.id}/logout-everywhere`).set(auth(analyst.token));

    const again = await request(app).post('/api/auth/login').send({ email: target.email, password: PASSWORD });
    expect(again.status).toBe(200);
    expect((await me(again.body.token)).status).toBe(200);
  });

  it('force password reset: the access token the person already holds is refused straight away', async () => {
    const analyst = await signedIn('force-analyst', { role: 'admin' });
    const target = await signedIn('force-target');
    expect((await me(target.token)).status).toBe(200);

    const res = await request(app).post(`/api/soc/investigate/user/${target.id}/force-password-reset`).set(auth(analyst.token));
    expect(res.status).toBe(200);

    const after = await me(target.token);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('SESSION_REVOKED');
  });

  it('revoking one session leaves the account\'s other signed-in access alone', async () => {
    const analyst = await signedIn('one-analyst', { role: 'admin' });
    const target = await signedIn('one-target');
    const second = await request(app).post('/api/auth/login').send({ email: target.email, password: PASSWORD });
    expect(second.status).toBe(200);

    const user = await User.findById(target.id).lean();
    const res = await request(app).delete(`/api/soc/investigate/user/${target.id}/sessions/${user.sessions[0]._id}`).set(auth(analyst.token));
    expect(res.status).toBe(200);
    // A single device was revoked: the account's tokens are not all invalidated
    expect((await me(second.body.token)).status).toBe(200);
  });
});

describe('SOC notes', () => {
  it('refuses a note that is too long instead of storing it', async () => {
    const analyst = await signedIn('note-analyst', { role: 'admin' });
    const incident = await SecurityIncident.create({ type: 'manual', severity: 'low', title: 'Note target' });

    const ok = await request(app).post(`/api/soc/incidents/${incident._id}/notes`).set(auth(analyst.token)).send({ text: 'x'.repeat(4000) });
    expect(ok.status).toBe(200);

    const tooLong = await request(app).post(`/api/soc/incidents/${incident._id}/notes`).set(auth(analyst.token)).send({ text: 'x'.repeat(4001) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toMatch(/too long/i);
    expect((await SecurityIncident.findById(incident._id).lean()).notes).toHaveLength(1);
  });
});

describe('SOC events feed', () => {
  it('does not run the all-time per-type count on every request, only when asked for it', async () => {
    const analyst = await signedIn('feed-analyst', { role: 'admin' });
    await SecurityEvent.create({ type: 'login_failure', severity: 'low', email: 'someone@example.com', ip: '203.0.113.5', message: 'x' });

    const plain = await request(app).get('/api/soc/events?limit=5').set(auth(analyst.token));
    expect(plain.status).toBe(200);
    expect(plain.body.events.length).toBeGreaterThan(0);
    expect(plain.body).not.toHaveProperty('counts');

    const withCounts = await request(app).get('/api/soc/events?limit=5&counts=1').set(auth(analyst.token));
    expect(withCounts.status).toBe(200);
    expect(withCounts.body.counts.login_failure).toBeGreaterThan(0);
  });
});
