// Regression tests for the fixes from the security audit (see the PR description for the full table).
const fs = require('fs');
const path = require('path');
const jsonwebtoken = require('jsonwebtoken');
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { createRoom } = require('./helpers');
const { jwtSecretProblem } = require('../lib/tokens');
const { fetchPublicPage } = require('../lib/safeHttp');
const { isPrivateIPv6, isPrivateIPv4 } = require('../lib/ssrfGuard');
const { invalidate } = require('../lib/accountState');

let n = 0;
async function login(role, extra = {}) {
  const email = `audit-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Audit ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: String(res.body.user.id), email, cookie: res.headers['set-cookie'] };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('excessive data exposure: user objects never carry credentials', () => {
  it('toJSON drops the password hash, session token hashes and verification / reset tokens', () => {
    const u = new User({
      name: 'X', email: 'x@example.com', role: 'student', password: '$2a$10$hash',
      sessions: [{ tokenHash: 'abc', expires: new Date() }],
      emailVerifyToken: 'v', emailVerifyExpires: new Date(), resetPasswordToken: 'r', resetPasswordExpires: new Date(),
    });
    const json = u.toJSON();
    for (const k of ['password', 'sessions', 'emailVerifyToken', 'emailVerifyExpires', 'resetPasswordToken', 'resetPasswordExpires']) {
      expect(json).not.toHaveProperty(k);
    }
    expect(json.email).toBe('x@example.com');
  });

  it('a counselor editing a student\'s tags gets the student back without any of them', async () => {
    const counselor = await login('counselor');
    const student = await login('student');
    await User.findByIdAndUpdate(student.id, { counselorId: counselor.id, resetPasswordToken: 'pending-reset-hash', emailVerifyToken: 'pending-verify-hash' });
    const res = await request(app).put(`/api/students/${student.id}/meta`).set(auth(counselor.token)).send({ tags: ['UK'] });
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual(['UK']);
    for (const k of ['password', 'sessions', 'resetPasswordToken', 'emailVerifyToken']) expect(res.body).not.toHaveProperty(k);
  });
});

describe('JWT hardening', () => {
  it('accepts the app\'s own HS256 tokens but rejects other algorithms and alg:none', async () => {
    const me = await login('student');
    expect((await request(app).get('/api/students/me').set(auth(me.token))).status).toBe(200);

    const payload = { id: me.id, role: 'student', isAppTeam: false };
    const hs512 = jsonwebtoken.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS512', expiresIn: '5m' });
    expect((await request(app).get('/api/students/me').set(auth(hs512))).status).toBe(401);

    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...payload, role: 'admin' })}.`;
    expect((await request(app).get('/api/admin/students').set(auth(none))).status).toBe(401);
  });

  it('flags missing, short and placeholder signing secrets', () => {
    expect(jwtSecretProblem('')).toMatch(/not set/);
    expect(jwtSecretProblem('short')).toMatch(/shorter/);
    expect(jwtSecretProblem('<generate with: node -e "console.log(...)">')).toMatch(/placeholder/);
    expect(jwtSecretProblem('a'.repeat(40))).toMatch(/placeholder/);
    expect(jwtSecretProblem('9f2c41e7b0d84a6f93e15c2ab7d06f48e1c3b95d27a64f08')).toBeNull();
  });
});

describe('privilege changes apply on the next request, not when the token expires', () => {
  it('a demoted admin\'s old token is refused; refreshing gives a token with the new role', async () => {
    const admin = await login('admin');
    expect((await request(app).get('/api/admin/students').set(auth(admin.token))).status).toBe(200);

    await User.findByIdAndUpdate(admin.id, { role: 'counselor' });
    invalidate(admin.id);
    const res = await request(app).get('/api/admin/students').set(auth(admin.token));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ROLE_CHANGED');

    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', admin.cookie);
    expect(refreshed.status).toBe(200);
    expect(jsonwebtoken.decode(refreshed.body.token).role).toBe('counselor');
    expect((await request(app).get('/api/admin/students').set(auth(refreshed.body.token))).status).toBe(403);
  });
});

describe('HTTP methods, unknown routes and health', () => {
  it('rejects TRACE with 405 and answers unknown API paths with a JSON 404', async () => {
    const trace = await request(app).trace('/api/health');
    expect(trace.status).toBe(405);
    expect(trace.headers.allow).toMatch(/GET/);
    const unknown = await request(app).get('/api/definitely-not-a-route');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ message: 'Not found' });
    expect(unknown.text).not.toMatch(/Cannot GET/);
  });

  it('health no longer reveals the environment', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).not.toHaveProperty('env');
  });
});

describe('call recording uploads', () => {
  const created = [];
  afterAll(() => created.forEach((f) => fs.unlink(path.join(__dirname, '..', f.replace(/^\//, '')), () => {})));

  async function callRoom() {
    const counselor = await login('counselor');
    const student = await login('student');
    const { messages } = await createRoom({
      participants: [counselor.id, student.id], participantNames: ['C', 'S'],
      messages: [{ senderId: counselor.id, senderName: 'C', type: 'call', callStatus: 'answered' }],
    });
    return { counselor, msgId: String(messages[0]._id) };
  }

  it('refuses a file that only claims to be audio, whatever its name', async () => {
    const { counselor, msgId } = await callRoom();
    const res = await request(app).post(`/api/chat/calls/${msgId}/recording`).set(auth(counselor.token))
      .attach('recording', Buffer.from('<script>alert(1)</script>'), { filename: 'x.html', contentType: 'audio/webm' });
    expect(res.status).toBe(400);
  });

  it('stores a real WebM recording under a .webm name, never the uploaded one', async () => {
    const { counselor, msgId } = await callRoom();
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);
    const res = await request(app).post(`/api/chat/calls/${msgId}/recording`).set(auth(counselor.token))
      .attach('recording', webm, { filename: 'evil.html', contentType: 'audio/webm' });
    expect(res.status).toBe(200);
    created.push(res.body.recordingUrl);
    expect(res.body.recordingUrl).toMatch(/^\/uploads\/\d+-[0-9a-f]{32}\.webm$/);
  });
});

describe('SSRF', () => {
  it.each(['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://localhost:5000/api/health', 'http://10.0.0.5/', 'http://[::1]/', 'file:///etc/passwd'])(
    'fetchPublicPage refuses %s', async (url) => {
      await expect(fetchPublicPage(url)).rejects.toThrow();
    });

  it('the URL pre-check refuses the unspecified IPv6 address, multicast and NAT64', () => {
    expect(isPrivateIPv6('::')).toBe(true);
    expect(isPrivateIPv4('224.0.0.1')).toBe(true);
    expect(isPrivateIPv6('64:ff9b::7f00:1')).toBe(true);
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
  });
});

describe('default demo accounts', () => {
  it('the demo seed refuses to run against production', async () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(require('../seed').run()).rejects.toThrow(/production/);
    } finally {
      process.env.NODE_ENV = before;
    }
  });
});

describe('error messages', () => {
  it('no route sends an internal error message to the client on a 500', () => {
    const dir = path.join(__dirname, '..', 'routes');
    // recursive: the SOC routes live in routes/soc/
    const offenders = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.js'))
      .filter((f) => /status\(5\d\d\)\.json\(\{\s*(message|error):\s*err\??\.message/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
