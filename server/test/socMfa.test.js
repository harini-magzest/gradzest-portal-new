const request = require('supertest');
const jwt = require('jsonwebtoken');
const { io: ioClient } = require('socket.io-client');
const { app, io, httpServer } = require('../app');
const User = require('../models/User');
const SocMfa = require('../models/SocMfa');
const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const totp = require('../lib/totp');
const socMfa = require('../lib/socMfa');
const { waitUntil } = require('./helpers');

const PASSWORD = 'TestPass123!';
let n = 0;
async function mk(role = 'admin', extra = {}) {
  const email = `mfa-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `MFA ${role}`, email, password: PASSWORD });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u, soc) => ({ Authorization: `Bearer ${u.token}`, ...(soc ? { 'X-SOC-Token': soc } : {}) });
const now = () => Date.now();

// Walks the real enrolment flow and returns what a user would hold afterwards.
async function enroll(owner) {
  const setup = await request(app).post('/api/soc-auth/setup').set(as(owner)).send({ password: PASSWORD });
  expect(setup.status).toBe(200);
  const confirm = await request(app).post('/api/soc-auth/confirm').set(as(owner)).send({ code: totp.totpAt(setup.body.secret, now()) });
  expect(confirm.status).toBe(200);
  return { secret: setup.body.secret, socToken: confirm.body.socToken, recoveryCodes: confirm.body.recoveryCodes, setup: setup.body };
}

describe('TOTP implementation (RFC 6238)', () => {
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'));

  it('matches the published RFC 6238 test vectors', () => {
    const vectors = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']];
    for (const [t, expected] of vectors) expect(totp.totpAt(secret, t * 1000)).toBe(expected);
  });

  it('accepts the current step and one step of clock drift either way, nothing further', () => {
    const t = 1111111109000;
    expect(totp.verifyTotp(secret, totp.totpAt(secret, t), { now: t })).not.toBeNull();
    expect(totp.verifyTotp(secret, totp.totpAt(secret, t - 30000), { now: t })).not.toBeNull();
    expect(totp.verifyTotp(secret, totp.totpAt(secret, t + 30000), { now: t })).not.toBeNull();
    expect(totp.verifyTotp(secret, totp.totpAt(secret, t - 90000), { now: t })).toBeNull();
    expect(totp.verifyTotp(secret, totp.totpAt(secret, t + 90000), { now: t })).toBeNull();
  });

  it('refuses a step that was already used (replay) and malformed input', () => {
    const t = 1111111109000;
    const step = totp.verifyTotp(secret, totp.totpAt(secret, t), { now: t });
    expect(totp.verifyTotp(secret, totp.totpAt(secret, t), { now: t, afterStep: step })).toBeNull();
    for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, '12 345', { $ne: 1 }]) {
      expect(totp.verifyTotp(secret, bad, { now: t })).toBeNull();
    }
  });

  it('round-trips base32 and builds an authenticator-compatible otpauth URL', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253]);
    expect(totp.base32Decode(totp.base32Encode(buf))).toEqual(buf);
    expect(totp.generateSecret()).toMatch(/^[A-Z2-7]{32}$/);
    const url = totp.otpauthUrl({ secret: 'ABC', account: 'a@b.c', issuer: 'Gradzest SOC' });
    expect(url).toBe('otpauth://totp/Gradzest%20SOC:a%40b.c?secret=ABC&issuer=Gradzest%20SOC&algorithm=SHA1&digits=6&period=30');
  });
});

describe('the SOC requires two-factor step-up', () => {
  const saved = process.env.SOC_MFA_REQUIRED;
  beforeAll(() => { process.env.SOC_MFA_REQUIRED = 'true'; });
  afterAll(() => { process.env.SOC_MFA_REQUIRED = saved; });

  it('an owner who has not enrolled is told to set up two-factor, not given the SOC', async () => {
    const owner = await mk();
    const res = await request(app).get('/api/soc/stats').set(as(owner));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SOC_MFA_SETUP_REQUIRED');
    const status = await request(app).get('/api/soc-auth/status').set(as(owner));
    expect(status.body).toMatchObject({ required: true, enrolled: false, verified: false });
  });

  it('enrolment needs the password, stores the secret encrypted, hands back recovery codes once, and opens the SOC', async () => {
    const owner = await mk();
    const wrong = await request(app).post('/api/soc-auth/setup').set(as(owner)).send({ password: 'not-my-password' });
    expect(wrong.status).toBe(401);

    const setup = await request(app).post('/api/soc-auth/setup').set(as(owner)).send({ password: PASSWORD });
    expect(setup.status).toBe(200);
    expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.body.otpauthUrl).toContain(`secret=${setup.body.secret}`);
    const raw = await SocMfa.collection.findOne({ userId: new (require('mongoose').Types.ObjectId)(owner.id) });
    expect(raw.secret).toMatch(/^enc:v1:/);                       // the TOTP secret is ciphertext in the database
    expect(JSON.stringify(raw)).not.toContain(setup.body.secret);

    const badConfirm = await request(app).post('/api/soc-auth/confirm').set(as(owner)).send({ code: '000000' });
    expect(badConfirm.status).toBe(401);
    expect((await request(app).get('/api/soc/stats').set(as(owner))).status).toBe(403); // still not enabled

    const ok = await request(app).post('/api/soc-auth/confirm').set(as(owner)).send({ code: totp.totpAt(setup.body.secret, now()) });
    expect(ok.status).toBe(200);
    expect(ok.body.recoveryCodes).toHaveLength(10);
    expect(ok.body.recoveryCodes[0]).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    const stored = await SocMfa.findOne({ userId: owner.id }).lean();
    expect(stored.enabled).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(ok.body.recoveryCodes[0]); // recovery codes are stored hashed only

    expect((await request(app).get('/api/soc/stats').set(as(owner, ok.body.socToken))).status).toBe(200);
    expect((await request(app).post('/api/soc-auth/setup').set(as(owner)).send({ password: PASSWORD })).status).toBe(409); // can't be re-enrolled over
  });

  it('a signed-in owner without a step-up token is refused with SOC_MFA_REQUIRED; garbage tokens too', async () => {
    const owner = await mk();
    const { socToken } = await enroll(owner);
    const none = await request(app).get('/api/soc/incidents').set(as(owner));
    expect(none.status).toBe(403);
    expect(none.body.code).toBe('SOC_MFA_REQUIRED');
    expect((await request(app).get('/api/soc/incidents').set(as(owner, 'garbage'))).status).toBe(403);
    expect((await request(app).get('/api/soc/incidents').set(as(owner, socToken.slice(0, -3) + 'xyz'))).status).toBe(403);
    expect((await request(app).get('/api/soc/incidents').set(as(owner, socToken))).status).toBe(200);
  });

  it('every SOC route is behind the step-up (no route forgets it)', async () => {
    const owner = await mk();
    await enroll(owner);
    const socRouter = require('../routes/soc');
    const routes = socRouter.stack.filter((l) => l.route).flatMap((l) => Object.keys(l.route.methods).map((m) => ({ method: m, path: l.route.path })));
    const open = [];
    for (const { method, path } of routes) {
      const res = await request(app)[method]('/api/soc' + path.replace(/:[A-Za-z]+/g, '000000000000000000000000')).set(as(owner)).send({});
      if (res.status !== 403 || res.body.code !== 'SOC_MFA_REQUIRED') open.push(`${method.toUpperCase()} ${path} -> ${res.status}`);
    }
    expect(open).toEqual([]);
  });

  it('a code that was just used cannot be replayed, but the next step\'s code works', async () => {
    const owner = await mk();
    const { secret } = await enroll(owner);                      // confirm consumed this step's code
    const replay = await request(app).post('/api/soc-auth/verify').set(as(owner)).send({ code: totp.totpAt(secret, now()) });
    expect(replay.status).toBe(401);
    const next = await request(app).post('/api/soc-auth/verify').set(as(owner)).send({ code: totp.totpAt(secret, now() + 30000) });
    expect(next.status).toBe(200);
    expect(next.body.socToken).toBeTruthy();
    expect((await request(app).get('/api/soc/stats').set(as(owner, next.body.socToken))).status).toBe(200);
  });

  it('the token is bound to the owner, the browser, the enrolment and its expiry', async () => {
    const owner = await mk();
    const other = await mk();
    const { socToken } = await enroll(owner);
    await enroll(other);

    // another owner's token
    expect((await request(app).get('/api/soc/stats').set(as(other, socToken))).status).toBe(403);
    // a different browser
    expect((await request(app).get('/api/soc/stats').set({ ...as(owner, socToken), 'User-Agent': 'SomeOtherBrowser/1.0' })).status).toBe(403);
    // forged with the right secret but wrong purpose
    const forged = jwt.sign({ sub: owner.id, purpose: 'access' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    expect((await request(app).get('/api/soc/stats').set(as(owner, forged))).status).toBe(403);
    // expired
    const decoded = jwt.decode(socToken);
    const expired = jwt.sign({ sub: decoded.sub, purpose: 'soc', ver: decoded.ver, uah: decoded.uah }, process.env.JWT_SECRET, { expiresIn: -10 });
    expect((await request(app).get('/api/soc/stats').set(as(owner, expired))).status).toBe(403);
    // the real one still works
    expect((await request(app).get('/api/soc/stats').set(as(owner, socToken))).status).toBe(200);

    // resetting the enrolment (what the server script does) voids every token issued before
    await SocMfa.deleteOne({ userId: owner.id });
    socMfa.invalidate(owner.id);
    expect((await request(app).get('/api/soc/stats').set(as(owner, socToken))).status).toBe(403);
    const again = await enroll(owner);
    expect((await request(app).get('/api/soc/stats').set(as(owner, socToken))).status).toBe(403); // the old token stays dead
    expect((await request(app).get('/api/soc/stats').set(as(owner, again.socToken))).status).toBe(200);
  });

  it('signing out of the SOC voids the token immediately', async () => {
    const owner = await mk();
    const { socToken } = await enroll(owner);
    expect((await request(app).get('/api/soc/stats').set(as(owner, socToken))).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1100)); // jwt iat has 1-second resolution
    expect((await request(app).post('/api/soc-auth/logout').set(as(owner))).status).toBe(200);
    expect((await request(app).get('/api/soc/stats').set(as(owner, socToken))).status).toBe(403);
  });

  it('five wrong codes lock the prompt, void open sessions, log security events and raise an incident', async () => {
    const owner = await mk();
    const { secret, socToken } = await enroll(owner);
    let last;
    for (let i = 0; i < 5; i++) last = await request(app).post('/api/soc-auth/verify').set(as(owner)).send({ code: '000000' });
    expect(last.status).toBe(429);
    expect(last.body.code).toBe('SOC_MFA_LOCKED');

    // even the right code is refused while locked
    expect((await request(app).post('/api/soc-auth/verify').set(as(owner)).send({ code: totp.totpAt(secret, now() + 30000) })).status).toBe(429);
    // and the session that was open is gone
    expect((await request(app).get('/api/soc/stats').set(as(owner, socToken))).status).toBe(403);

    // These are written in the background; allow plenty of time when the whole suite is loading the machine.
    await waitUntil(async () => SecurityIncident.findOne({ type: 'account_lockout', relatedUserId: owner.id }), { timeout: 15000 });
    const inc = await SecurityIncident.findOne({ type: 'account_lockout', relatedUserId: owner.id });
    expect(inc.title).toMatch(/SOC two-factor locked/);
    await waitUntil(async () => (await SecurityEvent.countDocuments({ type: 'soc_mfa_failure', userId: owner.id })) >= 5, { timeout: 15000 });
    expect(await SecurityEvent.countDocuments({ type: 'soc_mfa_failure', userId: owner.id })).toBeGreaterThanOrEqual(5);

    // lock expiry restores access
    await SocMfa.updateOne({ userId: owner.id }, { lockedUntil: null });
    const ok = await request(app).post('/api/soc-auth/verify').set(as(owner)).send({ code: totp.totpAt(secret, now() + 30000) });
    expect(ok.status).toBe(200);
  });

  it('a recovery code opens the SOC once and only once', async () => {
    const owner = await mk();
    const { recoveryCodes } = await enroll(owner);
    const first = await request(app).post('/api/soc-auth/verify').set(as(owner)).send({ recoveryCode: recoveryCodes[3].toLowerCase() });
    expect(first.status).toBe(200);
    expect(first.body.recoveryCodesLeft).toBe(9);
    expect((await request(app).post('/api/soc-auth/verify').set(as(owner)).send({ recoveryCode: recoveryCodes[3] })).status).toBe(401);
    expect((await request(app).post('/api/soc-auth/verify').set(as(owner)).send({ recoveryCode: 'AAAAA-AAAAA' })).status).toBe(401);
  });

  it('only the SOC owner can use the two-factor endpoints at all', async () => {
    const owner = await mk();
    const appTeam = await mk('admin', { isAppTeam: true });
    const student = await mk('student');
    process.env.SOC_OWNER_EMAILS = owner.email;
    try {
      const other = await mk();
      for (const u of [other, appTeam, student]) {
        expect((await request(app).post('/api/soc-auth/setup').set(as(u)).send({ password: PASSWORD })).status).toBe(403);
        expect((await request(app).post('/api/soc-auth/verify').set(as(u)).send({ code: '123456' })).status).toBe(403);
        expect((await request(app).get('/api/soc-auth/status').set(as(u))).status).toBe(403);
      }
      expect((await request(app).get('/api/soc-auth/status')).status).toBe(401);
    } finally { process.env.SOC_OWNER_EMAILS = '@example.com,owner@soc.test'; }
  });

  it('SOC_MFA_REQUIRED=false disables the requirement (development / automated tests only)', async () => {
    const owner = await mk();
    process.env.SOC_MFA_REQUIRED = 'false';
    try {
      expect((await request(app).get('/api/soc/stats').set(as(owner))).status).toBe(200);
    } finally { process.env.SOC_MFA_REQUIRED = 'true'; }
  });
});

describe('the live SOC feed follows the same step-up', () => {
  const saved = process.env.SOC_MFA_REQUIRED;
  let port;
  const clients = [];
  beforeAll(async () => {
    process.env.SOC_MFA_REQUIRED = 'true';
    await new Promise((resolve) => httpServer.listen(0, resolve));
    port = httpServer.address().port;
  });
  afterAll(async () => {
    process.env.SOC_MFA_REQUIRED = saved;
    clients.forEach((c) => c.disconnect());
    await new Promise((resolve) => httpServer.close(resolve));
  });
  const connect = (u) => new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}`, { auth: { token: u.token }, transports: ['websocket'], reconnection: false });
    clients.push(s);
    s.on('connect', () => { s.emit('register'); setTimeout(() => resolve(s), 250); });
    s.on('connect_error', reject);
  });
  const inRoom = async (id) => (await io.in('admin-room').fetchSockets()).some((s) => s.data.userId === id);

  it('the owner is not in the live room until they pass two-factor; they join on verify and leave on sign-out', async () => {
    const owner = await mk();
    const sock = await connect(owner);
    const got = [];
    // Only count this test's own marker events: real ones (e.g. "two-factor enabled") are legitimately delivered too.
    sock.on('security_event', (e) => { if (e.n !== undefined) got.push(e); });

    expect(await inRoom(owner.id)).toBe(false);                    // signed in as owner, but not stepped up
    io.to('admin-room').emit('security_event', { n: 1 });
    await new Promise((r) => setTimeout(r, 300));
    expect(got).toHaveLength(0);

    await enroll(owner);                                           // passing two-factor opens the live feed on the open socket
    await waitUntil(() => inRoom(owner.id));
    io.to('admin-room').emit('security_event', { n: 2 });
    await waitUntil(() => got.length > 0);
    expect(got).toHaveLength(1);

    await request(app).post('/api/soc-auth/logout').set(as(owner));
    await waitUntil(async () => !(await inRoom(owner.id)));
    io.to('admin-room').emit('security_event', { n: 3 });
    await new Promise((r) => setTimeout(r, 300));
    expect(got).toHaveLength(1);                                   // nothing after sign-out
  });
});
