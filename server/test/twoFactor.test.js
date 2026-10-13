const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { app } = require('../app');
const User = require('../models/User');
const SecurityEvent = require('../models/SecurityEvent');
const { totp } = require('../lib/totp');
const twoFactor = require('../lib/twoFactor');
const { waitUntil } = require('./helpers');

const PASSWORD = 'TestPass123!';
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;

// Created straight in the database with a cheap hash: going through /register costs a full bcrypt round and a mail attempt
// per user, which is what makes a suite like this slow, and sign-up is not what is under test here.
const HASH = bcrypt.hashSync(PASSWORD, 4);
async function makeUser(role = 'student') {
  const email = `tf-${role}-${Date.now()}-${n++}@example.com`;
  const user = await User.create({ name: 'TF Test', email, password: HASH, role, emailVerified: true, active: true });
  return { email, password: PASSWORD, id: String(user._id) };
}

// Signs in (password only) and returns the agent with its cookie plus the access token.
async function signIn(u) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: u.email, password: u.password });
  return { agent, res, token: res.body.token };
}

// Turns 2FA on for `u` through the real endpoints. The enable code consumes its time step, so tests that sign in straight
// afterwards take a fresh code with freshCode().
async function enableTwoFactor(u) {
  const { agent, token } = await signIn(u);
  const setup = await agent.post('/api/account/2fa/setup').set(bearer(token)).send({ password: u.password });
  expect(setup.status).toBe(200);
  const enable = await agent.post('/api/account/2fa/enable').set(bearer(token)).send({ code: totp(setup.body.secret) });
  expect(enable.status).toBe(200);
  return { secret: setup.body.secret, recoveryCodes: enable.body.recoveryCodes, agent, token };
}

// Simulates the next 30-second window having arrived: forget the last accepted step, then return the current code.
async function freshCode(u, secret) {
  await User.updateOne({ _id: u.id }, { $set: { 'twoFactor.lastStep': 0 } });
  return totp(secret);
}

async function firstStep(u) {
  const res = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(res.status).toBe(200);
  expect(res.body.twoFactorRequired).toBe(true);
  return res.body.challengeToken;
}

const secondStep = (challengeToken, code) => request(app).post('/api/auth/2fa/login').send({ challengeToken, code });

describe('two-factor sign-in', () => {
  describe('setup', () => {
    it('needs the current password to start, and nothing is switched on by starting', async () => {
      const u = await makeUser();
      const { agent, token } = await signIn(u);
      const bad = await agent.post('/api/account/2fa/setup').set(bearer(token)).send({ password: 'WrongPass1!' });
      // 403, not 401: the web client treats a 401 on these routes as an expired token and would send the guess twice
      expect(bad.status).toBe(403);
      const none = await agent.post('/api/account/2fa/setup').set(bearer(token)).send({});
      expect(none.status).toBe(403);

      const ok = await agent.post('/api/account/2fa/setup').set(bearer(token)).send({ password: u.password });
      expect(ok.status).toBe(200);
      expect(ok.body.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(ok.body.otpauthUri).toContain('otpauth://totp/Gradzest:');
      const status = await agent.get('/api/account/2fa').set(bearer(token));
      expect(status.body.enabled).toBe(false);
    });

    it('rejects a wrong code, and turns on with the right one, handing out ten recovery codes once', async () => {
      const u = await makeUser();
      const { agent, token } = await signIn(u);
      const setup = await agent.post('/api/account/2fa/setup').set(bearer(token)).send({ password: u.password });
      const code = totp(setup.body.secret);
      const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');

      expect((await agent.post('/api/account/2fa/enable').set(bearer(token)).send({ code: wrong })).status).toBe(400);
      expect((await agent.get('/api/account/2fa').set(bearer(token))).body.enabled).toBe(false);

      const enable = await agent.post('/api/account/2fa/enable').set(bearer(token)).send({ code });
      expect(enable.status).toBe(200);
      expect(enable.body.recoveryCodes).toHaveLength(10);
      expect(new Set(enable.body.recoveryCodes).size).toBe(10);
      enable.body.recoveryCodes.forEach((c) => expect(c).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/));

      const status = await agent.get('/api/account/2fa').set(bearer(token));
      expect(status.body).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 });
      // already on: it cannot be set up over the top, which would swap the secret under the owner's feet
      const again = await agent.post('/api/account/2fa/setup').set(bearer(token)).send({ password: u.password });
      expect(again.status).toBe(409);

      const event = await waitUntil(() => SecurityEvent.findOne({ type: 'two_factor_change', userId: u.id, 'meta.action': 'enabled' }));
      expect(event).toBeTruthy();
    });

    it('needs a login: every account route refuses an anonymous caller', async () => {
      for (const [method, path] of [['get', '/api/account/2fa'], ['post', '/api/account/2fa/setup'], ['post', '/api/account/2fa/enable'],
        ['post', '/api/account/2fa/disable'], ['post', '/api/account/2fa/recovery-codes'], ['post', '/api/account/change-password'], ['put', '/api/account/profile']]) {
        expect((await request(app)[method](path).send({})).status).toBe(401);
      }
    });

    it('stores the secret encrypted and the recovery codes only as hashes', async () => {
      const u = await makeUser();
      const { secret, recoveryCodes } = await enableTwoFactor(u);
      // Through the driver, not the model: the User model decrypts the encrypted-at-rest fields it reads (including this
      // one), and this test is about what is stored
      const raw = await User.collection.findOne({ _id: new mongoose.Types.ObjectId(u.id) });
      expect(raw.twoFactor.secret.startsWith('enc:v1:')).toBe(true);
      expect(raw.twoFactor.secret).not.toContain(secret);
      const stored = JSON.stringify(raw.twoFactor.recoveryCodes);
      for (const c of recoveryCodes) expect(stored).not.toContain(c.replace(/-/g, ''));
      expect(raw.twoFactor.pendingSecret).toBeUndefined();
    });
  });

  describe('signing in', () => {
    it('stops after the password: a challenge, no token, no session cookie', async () => {
      const u = await makeUser();
      await enableTwoFactor(u);
      const res = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
      expect(res.status).toBe(200);
      expect(res.body.twoFactorRequired).toBe(true);
      expect(res.body.challengeToken).toBeTruthy();
      expect(res.body.token).toBeUndefined();
      expect(res.body.user).toBeUndefined();
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('a wrong password still gets nothing, 2FA or not', async () => {
      const u = await makeUser();
      await enableTwoFactor(u);
      const res = await request(app).post('/api/auth/login').send({ email: u.email, password: 'WrongPass1!' });
      expect(res.status).toBe(401);
      expect(res.body.challengeToken).toBeUndefined();
    });

    it('completes with a correct code, and never returns the secret', async () => {
      const u = await makeUser();
      const { secret } = await enableTwoFactor(u);
      const challenge = await firstStep(u);
      const res = await secondStep(challenge, await freshCode(u, secret));
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.twoFactor).toEqual({ enabled: true });
      expect(res.headers['set-cookie'].join(';')).toContain('refreshToken=');
      expect(JSON.stringify(res.body)).not.toContain(secret);

      const me = await request(app).get('/api/auth/me').set(bearer(res.body.token));
      expect(me.body.twoFactor).toEqual({ enabled: true });
      expect(JSON.stringify(me.body)).not.toContain(secret);
      expect(JSON.stringify(me.body)).not.toMatch(/recoveryCodes|pendingSecret|lastStep/);
    });

    it('accepts a code typed with a space in the middle', async () => {
      const u = await makeUser();
      const { secret } = await enableTwoFactor(u);
      const code = await freshCode(u, secret);
      const res = await secondStep(await firstStep(u), `${code.slice(0, 3)} ${code.slice(3)}`);
      expect(res.status).toBe(200);
    });

    it('a code works once: replaying it is refused, with a message that says why', async () => {
      const u = await makeUser();
      const { secret } = await enableTwoFactor(u);
      const code = await freshCode(u, secret);
      expect((await secondStep(await firstStep(u), code)).status).toBe(200);
      const replay = await secondStep(await firstStep(u), code);
      expect(replay.status).toBe(401);
      expect(replay.body.token).toBeUndefined();
      expect(replay.body.message).toMatch(/already used/i);
    });

    it('two requests racing with the same code: exactly one gets in', async () => {
      const u = await makeUser();
      const { secret } = await enableTwoFactor(u);
      const code = await freshCode(u, secret);
      const [c1, c2] = [await firstStep(u), await firstStep(u)];
      const results = await Promise.all([secondStep(c1, code), secondStep(c2, code)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('counts wrong codes toward the lockout, and a correct code cannot get past it', async () => {
      const u = await makeUser();
      const { secret } = await enableTwoFactor(u);
      const challenge = await firstStep(u);
      const good = await freshCode(u, secret);
      const wrong = String((Number(good) + 1) % 1000000).padStart(6, '0');

      const first = await secondStep(challenge, wrong);
      expect(first.status).toBe(401);
      expect(first.body.message).toMatch(/4 attempts remaining/);
      for (let i = 0; i < 3; i++) await secondStep(challenge, wrong);
      const last = await secondStep(challenge, wrong);
      expect(last.status).toBe(423);

      const locked = await secondStep(challenge, good);
      expect(locked.status).toBe(423);
      expect(locked.body.token).toBeUndefined();
      // the password step is locked as well
      expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(423);
      const failures = await SecurityEvent.countDocuments({ type: 'login_failure', userId: u.id, 'meta.stage': '2fa' });
      expect(failures).toBeGreaterThanOrEqual(5);
    });

    it('the password step does not reset the failed-attempt counter, so guesses cannot be reset between tries', async () => {
      const u = await makeUser();
      const { secret } = await enableTwoFactor(u);
      const wrong = String((Number(await freshCode(u, secret)) + 1) % 1000000).padStart(6, '0');
      for (let i = 0; i < 4; i++) {
        await secondStep(await firstStep(u), wrong); // each round: password right, code wrong
      }
      expect((await User.findById(u.id)).loginAttempts).toBe(4);
      expect((await secondStep(await firstStep(u), wrong)).status).toBe(423);
    });

    it('a challenge that is forged, tampered with, or really an access token is useless', async () => {
      const u = await makeUser();
      const { secret, token } = await enableTwoFactor(u);
      const code = await freshCode(u, secret);

      const forged = jwt.sign({ sub: u.id, purpose: '2fa' }, 'not-the-key', { expiresIn: 300 });
      expect((await secondStep(forged, code)).status).toBe(401);
      expect((await secondStep('garbage', code)).status).toBe(401);
      expect((await secondStep(undefined, code)).status).toBe(401);
      // signed with the JWT secret itself (as an access token is), not the dedicated challenge key
      expect((await secondStep(jwt.sign({ sub: u.id, purpose: '2fa' }, process.env.JWT_SECRET, { expiresIn: 300 }), code)).status).toBe(401);
      expect((await secondStep(token, code)).status).toBe(401);
      // an expired one
      const expired = jwt.sign({ sub: u.id, purpose: '2fa' }, require('crypto').createHmac('sha256', process.env.JWT_SECRET).update('2fa-challenge:v1').digest(), { expiresIn: -10 });
      expect((await secondStep(expired, code)).status).toBe(401);
    });

    it('and a challenge cannot be used as an access token', async () => {
      const u = await makeUser();
      await enableTwoFactor(u);
      const challenge = await firstStep(u);
      for (const path of ['/api/auth/me', '/api/account/2fa', '/api/auth/sessions']) {
        expect((await request(app).get(path).set(bearer(challenge))).status).toBe(401);
      }
    });

    it('an account that says 2FA is on but has no usable secret can never sign in', async () => {
      const u = await makeUser();
      await User.updateOne({ _id: u.id }, { $set: { 'twoFactor.enabled': true } }); // no secret at all
      const challenge = await firstStep(u);
      // every code, including the one an empty key would produce, is refused
      const res = await secondStep(challenge, totp('A'.repeat(8)));
      expect(res.status).toBe(403);
      expect(res.body.token).toBeUndefined();
      // a secret that will not decrypt (wrong key) reads back as '' and must fail closed too
      await User.updateOne({ _id: u.id }, { $set: { 'twoFactor.secret': 'enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } });
      expect((await secondStep(challenge, '000000')).status).toBe(403);
    });
  });

  describe('recovery codes', () => {
    it('sign you in once each, in any case or spacing, and tell you how many are left', async () => {
      const u = await makeUser();
      const { recoveryCodes } = await enableTwoFactor(u);
      const code = recoveryCodes[0];

      const res = await secondStep(await firstStep(u), code.toUpperCase().replace(/-/g, ' '));
      expect(res.status).toBe(200);
      expect(res.body.recoveryCodesRemaining).toBe(9);
      const again = await secondStep(await firstStep(u), code);
      expect(again.status).toBe(401);
      const other = await secondStep(await firstStep(u), recoveryCodes[1]);
      expect(other.status).toBe(200);
      expect(other.body.recoveryCodesRemaining).toBe(8);

      const event = await waitUntil(() => SecurityEvent.findOne({ type: 'two_factor_change', userId: u.id, 'meta.action': 'recovery_used' }));
      expect(event.severity).toBe('medium');
    });

    it('can be regenerated with the password and a code, and the old set stops working', async () => {
      const u = await makeUser();
      const { secret, recoveryCodes, agent, token } = await enableTwoFactor(u);

      const noProof = await agent.post('/api/account/2fa/recovery-codes').set(bearer(token)).send({ password: u.password });
      expect(noProof.status).toBe(403);
      const res = await agent.post('/api/account/2fa/recovery-codes').set(bearer(token)).send({ password: u.password, code: await freshCode(u, secret) });
      expect(res.status).toBe(200);
      expect(res.body.recoveryCodes).toHaveLength(10);
      expect(res.body.recoveryCodes).not.toEqual(expect.arrayContaining([recoveryCodes[0]]));

      expect((await secondStep(await firstStep(u), recoveryCodes[0])).status).toBe(401);
      expect((await secondStep(await firstStep(u), res.body.recoveryCodes[0])).status).toBe(200);
    });
  });

  describe('turning it off', () => {
    it('needs the password and a current code; a stolen session alone cannot do it', async () => {
      const u = await makeUser();
      const { secret, agent, token } = await enableTwoFactor(u);

      expect((await agent.post('/api/account/2fa/disable').set(bearer(token)).send({})).status).toBe(403);
      expect((await agent.post('/api/account/2fa/disable').set(bearer(token)).send({ password: u.password })).status).toBe(403);
      const wrongPw = await agent.post('/api/account/2fa/disable').set(bearer(token)).send({ password: 'WrongPass1!', code: await freshCode(u, secret) });
      expect(wrongPw.status).toBe(403);
      expect((await agent.get('/api/account/2fa').set(bearer(token))).body.enabled).toBe(true);

      const ok = await agent.post('/api/account/2fa/disable').set(bearer(token)).send({ password: u.password, code: await freshCode(u, secret) });
      expect(ok.status).toBe(200);
      expect((await agent.get('/api/account/2fa').set(bearer(token))).body.enabled).toBe(false);

      // signing in needs only the password again, and nothing secret is left behind
      const login = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
      expect(login.body.token).toBeTruthy();
      const raw = await User.findById(u.id).select(twoFactor.SECRET_FIELDS).lean();
      expect(raw.twoFactor.secret).toBeUndefined();
      expect(raw.twoFactor.recoveryCodes).toBeUndefined();
      const event = await waitUntil(() => SecurityEvent.findOne({ type: 'two_factor_change', userId: u.id, 'meta.action': 'disabled' }));
      expect(event.severity).toBe('medium');
    });
  });

  describe('an administrator resetting a locked-out colleague', () => {
    it('turns 2FA off, ends their sessions, and logs it as a high-severity event', async () => {
      const staff = await makeUser('counselor');
      await enableTwoFactor(staff);
      const admin = await makeUser('admin');
      const adminSession = await signIn(admin);

      const res = await adminSession.agent.post(`/api/users/${staff.id}/two-factor/reset`).set(bearer(adminSession.token));
      expect(res.status).toBe(200);
      const after = await User.findById(staff.id).select(twoFactor.SECRET_FIELDS);
      expect(after.twoFactor.enabled).toBe(false);
      expect(after.twoFactor.secret).toBeUndefined();
      expect(after.sessions).toHaveLength(0);
      const login = await request(app).post('/api/auth/login').send({ email: staff.email, password: staff.password });
      expect(login.body.token).toBeTruthy();

      const event = await waitUntil(() => SecurityEvent.findOne({ type: 'two_factor_change', userId: staff.id, 'meta.action': 'reset' }));
      expect(event.severity).toBe('high');
      expect(event.meta.by).toBe(admin.id);
    });

    it('is for administrators only, never for yourself, and only where 2FA is on', async () => {
      const staff = await makeUser('counselor');
      await enableTwoFactor(staff);
      const other = await makeUser('counselor');
      const otherSession = await signIn(other);
      expect((await otherSession.agent.post(`/api/users/${staff.id}/two-factor/reset`).set(bearer(otherSession.token))).status).toBe(403);
      expect((await User.findById(staff.id)).twoFactor.enabled).toBe(true);

      const admin = await makeUser('admin');
      const adminSession = await signIn(admin);
      expect((await adminSession.agent.post(`/api/users/${admin.id}/two-factor/reset`).set(bearer(adminSession.token))).status).toBe(400);
      expect((await adminSession.agent.post(`/api/users/${other.id}/two-factor/reset`).set(bearer(adminSession.token))).status).toBe(400);
      expect((await adminSession.agent.post('/api/users/not-an-id/two-factor/reset').set(bearer(adminSession.token))).status).toBe(404);
    });

    it('shows whether staff have 2FA in the staff list, without any secret', async () => {
      const staff = await makeUser('counselor');
      const { secret } = await enableTwoFactor(staff);
      const admin = await makeUser('admin');
      const { agent, token } = await signIn(admin);
      const list = await agent.get('/api/users').set(bearer(token));
      expect(list.status).toBe(200);
      const row = list.body.users.find((x) => String(x._id) === staff.id);
      expect(row.twoFactor).toEqual({ enabled: true });
      expect(JSON.stringify(list.body)).not.toContain(secret);
    });
  });

  describe('mass assignment', () => {
    it('an admin editing a counselor or app-team member cannot overwrite their 2FA state through the update body', async () => {
      const staff = await makeUser('counselor');
      await enableTwoFactor(staff);
      const admin = await makeUser('admin');
      const { agent, token } = await signIn(admin);

      const res = await agent.put(`/api/admin/counselors/${staff.id}`).set(bearer(token)).send({ title: 'Senior', twoFactor: { enabled: false } });
      // Request validation (middleware/validate.js) refuses fields the edit form does not have, instead of ignoring them
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e) => e.field)).toContain('twoFactor');
      const after = await User.findById(staff.id).select(twoFactor.SECRET_FIELDS);
      expect(after.twoFactor.enabled).toBe(true);
      expect(after.twoFactor.secret).toBeTruthy();
      // the same edit without the 2FA field goes through
      expect((await agent.put(`/api/admin/counselors/${staff.id}`).set(bearer(token)).send({ title: 'Senior' })).status).toBe(200);
      expect((await User.findById(staff.id)).title).toBe('Senior');
    });

    it("a student cannot switch off their own 2FA through their profile", async () => {
      const u = await makeUser();
      const { token, agent } = await enableTwoFactor(u);
      await agent.put('/api/students/me').set(bearer(token)).send({ preferenceNote: 'hi', twoFactor: { enabled: false } });
      expect((await User.findById(u.id)).twoFactor.enabled).toBe(true);
    });
  });
});
