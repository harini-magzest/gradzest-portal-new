const request = require('supertest');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { io: ioClient } = require('socket.io-client');
const { app, httpServer } = require('../app');
const User = require('../models/User');
const Role = require('../models/Role');
const ChatRoom = require('../models/ChatRoom');
const UiActivity = require('../models/UiActivity');
const { buildDevice, sanitizeHints } = require('../lib/device');
const { recordSignInActivity } = require('../lib/recordSignIn');
const { waitUntil } = require('./helpers');

const UPLOADS = path.join(__dirname, '..', 'uploads');
let n = 0;

async function mk(role, extra = {}, loginBody = {}, headers = {}) {
  const email = `rs-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Real ${role} ${n}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  let r = request(app).post('/api/auth/login');
  for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
  const res = await r.send({ email, password: 'TestPass123!', ...loginBody });
  return { token: res.body.token, fileToken: res.body.fileToken, id: res.body.user.id, email, name: res.body.user.name, cookies: res.headers['set-cookie'] };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

// ── device + sign-in rows ───────────────────────────────────────────────────

describe('device profile', () => {
  const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

  it('uses Client Hints to tell Windows 11 from 10 and to name an Android phone model', () => {
    const win = buildDevice(CHROME_WIN, { platform: 'Windows', platformVersion: '15.0.0', architecture: 'x86', bitness: '64', screen: '1920x1080@1', timezone: 'Asia/Kolkata' });
    expect(win.os).toBe('Windows 11');
    expect(win.label).toBe('Windows 11 (x86-64) · Chrome 120 · Desktop · 1920×1080');
    expect(win.clientReported).toBe(true);

    expect(buildDevice(CHROME_WIN, { platform: 'Windows', platformVersion: '10.0.0' }).os).toBe('Windows 10');

    const phone = buildDevice(CHROME_ANDROID, { platform: 'Android', platformVersion: '14.0.0', model: 'SM-S918B', mobile: true, screen: '412x915@2.6' });
    expect(phone.label).toBe('SM-S918B · Android 14 · Chrome 120 · Mobile · 412×915');
    expect(phone.model).toBe('SM-S918B');
  });

  it('falls back to what the User-Agent alone says, and is honest that it did', () => {
    const d = buildDevice(CHROME_WIN, undefined);
    expect(d.label).toBe('Windows 10/11 · Chrome 120 · Desktop');
    expect(d.clientReported).toBe(false);
    expect(buildDevice('', null).label).toBe('Unknown device');
    expect(buildDevice('curl/8.4.0', {}).deviceType).toBe('Automated client');
  });

  it('cleans hostile or oversized hints: no markup, bounded lengths, unknown keys dropped, bad screen ignored', () => {
    const h = sanitizeHints({ model: '<script>alert(1)</script>'.repeat(20), platform: 'Windows', screen: 'javascript:alert(1)', timezone: 'x'.repeat(500), evil: 'drop me', cores: 99999, mobile: 'yes' });
    expect(h.model).not.toMatch(/[<>]/);
    expect(h.model.length).toBeLessThanOrEqual(60);
    expect(h.screen).toBe('');
    expect(h.timezone.length).toBeLessThanOrEqual(60);
    expect(h).not.toHaveProperty('evil');
    expect(h.cores).toBeNull();
    expect(h.mobile).toBe(false);
  });
});

describe('sign-in rows carry the person\'s name and device, and are encrypted at rest', () => {
  it('a login records name, role, IP and the device (browser-reported hints included)', async () => {
    const u = await mk('counselor', {}, { device: { platform: 'Windows', platformVersion: '15.0.0', architecture: 'x86', bitness: '64', screen: '1366x768@1', timezone: 'Asia/Kolkata', language: 'en-IN' } },
      { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    const row = await waitUntil(async () => UiActivity.findOne({ userId: u.id, kind: 'login' }).lean());
    expect(row).toMatchObject({ kind: 'login', email: u.email, name: u.name, role: 'counselor' });
    expect(row.ip).toBeTruthy();
    expect(row.device.label).toContain('Windows 11');
    expect(row.device).toMatchObject({ browser: 'Chrome 120', deviceType: 'Desktop', timezone: 'Asia/Kolkata', language: 'en-IN', clientReported: true });
  });

  it('works for a student too, and a login without any hints still records the User-Agent device', async () => {
    const s = await mk('student');
    const row = await waitUntil(async () => UiActivity.findOne({ userId: s.id, kind: 'login' }).lean());
    expect(row.role).toBe('student');
    expect(row.device.clientReported).toBe(false);
  });

  it('a logout is recorded too', async () => {
    const u = await mk('counselor');
    await recordSignInActivity({ kind: 'logout', user: { _id: u.id, email: u.email, name: u.name, role: 'counselor' }, req: { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15' }, ip: '203.0.113.5' } });
    const row = await UiActivity.findOne({ userId: u.id, kind: 'logout' }).lean();
    expect(row.name).toBe(u.name);
    expect(row.device.label).toContain('Safari 17');
  });

  it('name, device and button text are ciphertext in the database but plaintext through the API', async () => {
    const admin = await mk('admin');
    const target = await mk('counselor', {}, { device: { model: 'Pixel 8', platform: 'Android', platformVersion: '14.0.0', mobile: true } });
    await waitUntil(async () => UiActivity.findOne({ userId: target.id, kind: 'login' }).lean());
    await request(app).post('/api/ui-trail').set(as(target)).send({ events: [{ kind: 'click', page: '/counselor/students', clientTime: new Date().toISOString(), element: { tag: 'button', label: 'Open Priya Sharma' } }], device: { model: 'Pixel 8' } });

    const raw = await UiActivity.collection.findOne({ userId: new mongoose.Types.ObjectId(target.id), kind: 'click' });
    expect(raw.name).toMatch(/^enc:v1:/);
    expect(raw.email).toMatch(/^enc:v1:/);
    expect(raw.element.label).toMatch(/^enc:v1:/);
    expect(raw.device.label).toMatch(/^enc:v1:/);
    expect(JSON.stringify(raw)).not.toContain('Priya Sharma');
    expect(JSON.stringify(raw)).not.toContain(target.email);

    const res = await request(app).get('/api/soc/ui-activity').query({ userId: target.id }).set(as(admin));
    expect(res.status).toBe(200);
    const click = res.body.activity.find((r) => r.kind === 'click');
    expect(click.name).toBe(target.name);
    expect(click.element.label).toBe('Open Priya Sharma');
    expect(click.device.label).toContain('Pixel 8');
    expect(res.body.activity.some((r) => r.kind === 'login' && r.name === target.name)).toBe(true);

    // the exact-text search still finds it even though it is stored encrypted
    const found = await request(app).get('/api/soc/ui-activity').query({ q: 'Open Priya Sharma' }).set(as(admin));
    expect(found.body.activity.some((r) => r.element.label === 'Open Priya Sharma')).toBe(true);

    // and the response card shows the device of the last sign-in
    const card = await request(app).get(`/api/soc/investigate/user/${target.id}`).set(as(admin));
    expect(card.body.profile.lastLogin.device.label).toContain('Pixel 8');
  });
});

// ── a valid token is not enough ─────────────────────────────────────────────

describe('deactivated, locked and deleted accounts lose access immediately', () => {
  it('deactivating a staff member signs them out everywhere right now, and they cannot sign back in or refresh', async () => {
    const admin = await mk('admin');
    const staff = await mk('counselor');
    expect((await request(app).get('/api/auth/me').set(as(staff))).status).toBe(200);

    const res = await request(app).put(`/api/users/${staff.id}`).set(as(admin)).send({ active: false });
    expect(res.status).toBe(200);

    const after = await request(app).get('/api/auth/me').set(as(staff));
    expect(after.status).toBe(401);                       // same token, seconds later: refused
    expect(after.body.code).toBe('ACCOUNT_DISABLED');
    expect((await User.findById(staff.id)).sessions).toHaveLength(0);

    const login = await request(app).post('/api/auth/login').send({ email: staff.email, password: 'TestPass123!' });
    expect(login.status).toBe(403);
    expect(login.body.message).toMatch(/deactivated/i);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', staff.cookies)).status).toBe(401);

    await request(app).put(`/api/users/${staff.id}`).set(as(admin)).send({ active: true });
    expect((await request(app).post('/api/auth/login').send({ email: staff.email, password: 'TestPass123!' })).status).toBe(200);
  });

  it('a SOC lock refuses the person\'s existing token at once, and unlock restores it', async () => {
    const admin = await mk('admin');
    const victim = await mk('counselor');
    expect((await request(app).get('/api/auth/me').set(as(victim))).status).toBe(200);
    await request(app).post(`/api/soc/investigate/user/${victim.id}/lock`).set(as(admin)).send({});
    expect((await request(app).get('/api/auth/me').set(as(victim))).status).toBe(401);
    await request(app).post(`/api/soc/investigate/user/${victim.id}/lock`).set(as(admin)).send({ locked: false });
    expect((await request(app).get('/api/auth/me').set(as(victim))).status).toBe(200);
  });

  it('a deleted account\'s token stops working', async () => {
    const u = await mk('student');
    await User.deleteOne({ _id: u.id });
    expect((await request(app).get('/api/auth/me').set(as(u))).status).toBe(401);
  });

  it('the automatic 15-minute lockout after failed logins does NOT kick out a live session (no denial-of-service on others)', async () => {
    const u = await mk('student');
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ email: u.email, password: 'wrong-password' });
    expect((await User.findById(u.id)).lockedUntil).toBeTruthy();
    expect((await request(app).get('/api/auth/me').set(as(u))).status).toBe(200);
  });
});

// ── file downloads are authorised per file ──────────────────────────────────

describe('uploaded files are only served to people entitled to them', () => {
  const made = [];
  const putFile = (body = 'secret document') => {
    const name = `rs-${Date.now()}-${n++}.pdf`;
    fs.mkdirSync(UPLOADS, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS, name), body);
    made.push(path.join(UPLOADS, name));
    return name;
  };
  afterAll(() => made.forEach((f) => fs.rmSync(f, { force: true })));
  const get = (u, name, how = 'header') => (how === 'header'
    ? request(app).get(`/uploads/${name}`).set(as(u))
    : request(app).get(`/uploads/${name}`).query({ token: how === 'query-access' ? u.token : u.fileToken }));

  it('a student document: the owner and admins can open it; another student and an unrelated counselor cannot', async () => {
    const owner = await mk('student');
    const other = await mk('student');
    const admin = await mk('admin');
    const name = putFile('passport scan');
    await User.updateOne({ _id: owner.id }, { $push: { documents: { name: 'Passport', type: 'Passport', url: `/uploads/${name}` } } });

    const ok = await get(owner, name);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-length']).toBe(String('passport scan'.length)); // the real file was served (PDFs aren't exposed as text)
    expect((await get(owner, name, 'query')).status).toBe(200);       // ?token=<file token> works for <img> links
    expect((await get(owner, name, 'query-access')).status).toBe(401); // the API access token is never accepted in a URL
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${owner.fileToken}` })).status).toBe(401); // and a file token can't call the API
    expect((await get(admin, name)).status).toBe(200);
    expect((await get(other, name)).status).toBe(404);

    const lonely = await Role.create({ name: `lonely-${Date.now()}` });
    const restricted = await mk('counselor', { hierarchyRole: lonely._id });
    expect((await get(restricted, name)).status).toBe(404);          // outside their team
  });

  it('a chat attachment is for the room\'s participants only — not other users, not even other admins', async () => {
    const a = await mk('student');
    const c = await mk('counselor');
    const intruder = await mk('student');
    const admin = await mk('admin');
    const name = putFile('private chat file');
    await ChatRoom.create({ participants: [a.id, c.id], participantNames: ['A', 'C'], type: 'student-counselor',
      messages: [{ senderId: a.id, senderName: 'A', content: 'f.pdf', type: 'file', fileUrl: `/uploads/${name}`, fileName: 'f.pdf' }] });
    expect((await get(a, name)).status).toBe(200);
    expect((await get(c, name)).status).toBe(200);
    expect((await get(intruder, name)).status).toBe(404);
    expect((await get(admin, name)).status).toBe(404);
  });

  it('a file tied to nobody is full-admin only (fails closed); Application Team and students are refused', async () => {
    const orphan = putFile('mystery');
    const admin = await mk('admin');
    const appTeam = await mk('admin', { isAppTeam: true });
    const student = await mk('student');
    expect((await get(admin, orphan)).status).toBe(200);
    expect((await get(appTeam, orphan)).status).toBe(404);
    expect((await get(student, orphan)).status).toBe(404);
  });

  it('requires a valid token, refuses a locked account, and cannot be used for path traversal', async () => {
    const admin = await mk('admin');
    const name = putFile('x');
    expect((await request(app).get(`/uploads/${name}`)).status).toBe(401);
    expect((await request(app).get(`/uploads/${name}`).set('Authorization', 'Bearer garbage')).status).toBe(401);
    expect((await request(app).get('/uploads/..%2f..%2fpackage.json').set(as(admin))).status).not.toBe(200);
    expect((await request(app).get('/uploads/%2e%2e/package.json').set(as(admin))).status).not.toBe(200);
    expect((await request(app).get('/uploads/%E0%A4%A').set(as(admin))).status).toBe(404); // malformed escape: clean 404, no crash
  });
});

// ── call signalling cannot be spoofed ───────────────────────────────────────

describe('call signalling uses the verified identity', () => {
  let port;
  const sockets = [];
  beforeAll(async () => {
    await new Promise((resolve) => httpServer.listen(0, resolve));
    port = httpServer.address().port;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => httpServer.close(resolve));
  });

  const connect = (u) => new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}`, { auth: { token: u.token }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.on('connect', () => { s.emit('register'); setTimeout(() => resolve(s), 100); });
    s.on('connect_error', reject);
  });
  const listen = (s, ev) => { const got = []; s.on(ev, (p) => got.push(p)); return got; };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  it('the receiver sees the caller\'s real id, name and role even if the sender lies about all three', async () => {
    const caller = await mk('counselor');
    const callee = await mk('student');
    const ceo = await mk('admin');
    const cs = await connect(caller);
    const rs = await connect(callee);
    const got = listen(rs, 'call:incoming');

    cs.emit('call:invite', { to: callee.id, from: ceo.id, fromName: 'The CEO', fromRole: 'admin', callType: 'video' });
    await waitUntil(() => got.length > 0);
    expect(got[0].from).toBe(caller.id);
    expect(got[0].fromName).toBe(caller.name);
    expect(got[0].fromRole).toBe('counselor');
    expect(got[0].callType).toBe('video');
  });

  it('students cannot ring other students; garbage targets are ignored; ring spam is capped', async () => {
    const a = await mk('student');
    const b = await mk('student');
    const staff = await mk('counselor');
    const as_ = await connect(a);
    const bs = await connect(b);
    const ss = await connect(staff);
    const toB = listen(bs, 'call:incoming');
    const toStaff = listen(ss, 'call:incoming');

    as_.emit('call:invite', { to: b.id });                 // student -> student: dropped
    as_.emit('call:invite', { to: { $ne: null } });        // not an id: dropped
    as_.emit('call:invite', { to: 'not-an-id' });
    for (let i = 0; i < 14; i++) as_.emit('call:invite', { to: staff.id }); // student -> staff is allowed, but capped
    await pause(600);
    expect(toB).toHaveLength(0);
    expect(toStaff.length).toBeGreaterThan(0);
    expect(toStaff.length).toBeLessThanOrEqual(10);
  });

  it('answers and ICE are relayed with the real sender; a locked account cannot open a socket', async () => {
    const a = await mk('counselor');
    const b = await mk('student');
    const as_ = await connect(a);
    const bs = await connect(b);
    const offers = listen(bs, 'call:offer');
    as_.emit('call:offer', { to: b.id, offer: { sdp: 'x' }, from: 'someone-else' });
    await waitUntil(() => offers.length > 0);
    expect(offers[0].from).toBe(a.id);

    const admin = await mk('admin');
    const locked = await mk('counselor');
    await request(app).post(`/api/soc/investigate/user/${locked.id}/lock`).set(as(admin)).send({});
    await expect(connect(locked)).rejects.toBeTruthy();
  });
});
