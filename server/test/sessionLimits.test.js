const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { policyFor, sessionStatus, sessionPayload } = require('../lib/sessionPolicy');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('policyFor', () => {
  it('gives staff a shorter idle window than students, and everyone the same hard limit', () => {
    expect(policyFor('counselor')).toEqual({ idleMs: 30 * MIN, absoluteMs: 12 * HOUR });
    expect(policyFor('admin')).toEqual({ idleMs: 30 * MIN, absoluteMs: 12 * HOUR });
    expect(policyFor('student')).toEqual({ idleMs: 60 * MIN, absoluteMs: 12 * HOUR });
  });

  it('can be tuned with environment variables, and ignores nonsense values', () => {
    const saved = { ...process.env };
    process.env.SESSION_IDLE_MINUTES_STAFF = '10';
    process.env.SESSION_IDLE_MINUTES_STUDENT = '45';
    process.env.SESSION_MAX_HOURS = '8';
    expect(policyFor('admin')).toEqual({ idleMs: 10 * MIN, absoluteMs: 8 * HOUR });
    expect(policyFor('student')).toEqual({ idleMs: 45 * MIN, absoluteMs: 8 * HOUR });
    process.env.SESSION_IDLE_MINUTES_STAFF = 'soon';
    process.env.SESSION_MAX_HOURS = '-3';
    expect(policyFor('counselor')).toEqual({ idleMs: 30 * MIN, absoluteMs: 12 * HOUR });
    process.env = saved;
  });
});

describe('sessionStatus', () => {
  const now = Date.parse('2030-01-01T12:00:00Z');
  const ago = (ms) => new Date(now - ms);
  const session = (over) => ({ createdAt: ago(HOUR), lastUsedAt: ago(5 * MIN), expires: new Date(now + 11 * HOUR), ...over });

  it('allows an active session and reports its hard end', () => {
    const s = sessionStatus(session(), 'counselor', now);
    expect(s.ok).toBe(true);
    expect(s.expiresAt.getTime()).toBe(now + 11 * HOUR); // the stored end is earlier than createdAt + 12h
  });

  it('ends a session that has been idle past the role limit, with a different cut-off for staff and students', () => {
    const idle40 = session({ lastUsedAt: ago(40 * MIN) });
    expect(sessionStatus(idle40, 'counselor', now)).toEqual({ ok: false, reason: 'idle' });
    expect(sessionStatus(idle40, 'student', now).ok).toBe(true);
    expect(sessionStatus(session({ lastUsedAt: ago(70 * MIN) }), 'student', now)).toEqual({ ok: false, reason: 'idle' });
  });

  it('ends a session past its hard limit even when the person is active, and never lets old stored dates extend it', () => {
    expect(sessionStatus(session({ createdAt: ago(13 * HOUR), lastUsedAt: ago(MIN), expires: new Date(now + 6 * 24 * HOUR) }), 'student', now))
      .toEqual({ ok: false, reason: 'expired' }); // an old 7-day record is still capped at createdAt + 12h
    expect(sessionStatus(session({ expires: ago(MIN) }), 'student', now)).toEqual({ ok: false, reason: 'expired' });
  });

  it('treats a session with no start time as already over', () => {
    expect(sessionStatus({ lastUsedAt: ago(MIN), expires: new Date(now + HOUR) }, 'student', now)).toEqual({ ok: false, reason: 'expired' });
  });

  it('tells the browser its limits', () => {
    expect(sessionPayload(new Date(now), 'admin')).toEqual({ expiresAt: new Date(now).toISOString(), idleTimeoutMs: 30 * MIN });
  });
});

let n = 0;
async function signIn(role) {
  const email = `sesslimit-${role}-${Date.now()}-${n++}@example.com`;
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: `Limit ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const login = await agent.post('/api/auth/login').send({ email, password: 'TestPass123!' });
  // Registering also signed this agent in once; keep only the session the agent's cookie now belongs to (the sign-in)
  const user = await User.findOne({ email });
  user.sessions = [user.sessions[user.sessions.length - 1]];
  await user.save();
  return { agent, email, login };
}
const stored = async (email) => (await User.findOne({ email }).select('sessions')).sessions[0];
const setSession = (email, fields) => User.updateOne({ email }, { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`sessions.0.${k}`, v])) });

describe('POST /api/auth/refresh enforces the session limits', () => {
  it('sign-in tells the browser its limits: 30 minutes idle for staff, 60 for students, ending within 12 hours', async () => {
    const staff = await signIn('counselor');
    expect(staff.login.status).toBe(200);
    expect(staff.login.body.session.idleTimeoutMs).toBe(30 * MIN);
    const end = Date.parse(staff.login.body.session.expiresAt) - Date.now();
    expect(end).toBeGreaterThan(11.9 * HOUR);
    expect(end).toBeLessThanOrEqual(12 * HOUR);
    expect((await signIn('student')).login.body.session.idleTimeoutMs).toBe(60 * MIN);
  });

  it('a normal refresh works, renews the idle clock, and does NOT push the hard end later', async () => {
    const { agent, email } = await signIn('student');
    const before = await stored(email);
    await setSession(email, { lastUsedAt: new Date(Date.now() - 20 * MIN) });

    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(Date.parse(res.body.session.expiresAt)).toBe(before.expires.getTime());

    const after = await stored(email);
    expect(after.expires.getTime()).toBe(before.expires.getTime());      // hard end unchanged
    expect(Date.now() - after.lastUsedAt.getTime()).toBeLessThan(10 * 1000); // idle clock renewed
    expect(after.tokenHash).not.toBe(before.tokenHash);                  // token rotated
  });

  it('refuses a staff session idle for over 30 minutes, with a clear code, and removes the session', async () => {
    const { agent, email } = await signIn('counselor');
    await setSession(email, { lastUsedAt: new Date(Date.now() - 31 * MIN) });
    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_IDLE');
    expect(res.body.message).toMatch(/inactive/i);
    expect((await User.findOne({ email }).select('sessions')).sessions).toHaveLength(0);
    expect((await agent.post('/api/auth/refresh')).status).toBe(401); // and the cookie is useless afterwards
  });

  it('the same 31 idle minutes are fine for a student, 61 are not', async () => {
    const { agent, email } = await signIn('student');
    await setSession(email, { lastUsedAt: new Date(Date.now() - 31 * MIN) });
    expect((await agent.post('/api/auth/refresh')).status).toBe(200);
    await setSession(email, { lastUsedAt: new Date(Date.now() - 61 * MIN) });
    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_IDLE');
  });

  it('refuses a session older than 12 hours however recently it was used', async () => {
    const { agent, email } = await signIn('admin');
    await setSession(email, { createdAt: new Date(Date.now() - 13 * HOUR), lastUsedAt: new Date(Date.now() - MIN), expires: new Date(Date.now() + 6 * 24 * HOUR) });
    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
    expect(res.body.message).toMatch(/time limit/i);
  });
});

describe('DELETE /api/auth/sessions (sign out everywhere else)', () => {
  it('keeps this device signed in and ends every other one', async () => {
    const email = `sesslimit-all-${Date.now()}@example.com`;
    const here = request.agent(app);
    const other = request.agent(app);
    const reg = await here.post('/api/auth/register').send({ name: 'Everywhere', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true });
    await other.post('/api/auth/login').send({ email, password: 'TestPass123!' });
    expect((await User.findOne({ email }).select('sessions')).sessions).toHaveLength(2);

    const res = await here.delete('/api/auth/sessions').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(1);

    expect((await other.post('/api/auth/refresh')).status).toBe(401);  // the other device is out
    expect((await here.post('/api/auth/refresh')).status).toBe(200);   // this one stays in
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).delete('/api/auth/sessions')).status).toBe(401);
  });
});
