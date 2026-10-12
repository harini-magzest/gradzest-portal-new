// Signed, short-lived file links (lib/fileLinks.js, POST /api/files/:name/link) instead of access tokens in /uploads URLs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const UploadRecord = require('../models/UploadRecord');
const RequestLog = require('../models/RequestLog');
const SecurityEvent = require('../models/SecurityEvent');
const { signedUploadPath, checkSignedUpload, LINK_TTL_MS } = require('../lib/fileLinks');
const { revokeAllSessions, invalidate } = require('../lib/accountState');
const { redactUrl } = require('../lib/redactUrl');

const UPLOADS = path.join(__dirname, '..', 'uploads');
let n = 0;
async function signedIn(role, extra = {}) {
  const email = `links-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Links ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { id: String(res.body.user.id), token: res.body.token };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const created = [];
async function storedFile(owner, content) {
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.pdf`;
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS, name), content);
  created.push(name);
  await UploadRecord.create({
    storedName: name, userId: owner.id, originalName: 'passport.pdf', mimeType: 'application/pdf', size: content.length,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  });
  return name;
}
const linkFor = (user, name) => request(app).post(`/api/files/${encodeURIComponent(name)}/link`).set(auth(user.token));

afterAll(() => created.forEach((f) => fs.rmSync(path.join(UPLOADS, f), { force: true })));

describe('POST /api/files/:name/link', () => {
  it('gives the owner a five-minute link that downloads the file', async () => {
    const owner = await signedIn('student');
    const name = await storedFile(owner, 'owner-file-A');
    const res = await linkFor(owner, name);
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(new RegExp(`^/uploads/${name}\\?uid=${owner.id}&exp=\\d+&sig=[A-Za-z0-9_-]{43}$`));
    expect(new Date(res.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(LINK_TTL_MS - 5000);
    expect(res.body.url).not.toContain(owner.token);
    const file = await request(app).get(res.body.url);
    expect(file.status).toBe(200);
    expect(file.text || file.body.toString()).toBe('owner-file-A');
  });

  it('refuses a link to someone without access to the file, the same way as for a file that does not exist', async () => {
    const owner = await signedIn('student');
    const other = await signedIn('student');
    const name = await storedFile(owner, 'private');
    expect((await linkFor(other, name)).status).toBe(404);
    expect((await linkFor(other, '1700000000000-doesnotexist.pdf')).status).toBe(404);
    expect((await linkFor(other, '..%2F.env')).status).toBe(400); // not a stored file name at all: refused by validation
    expect((await request(app).post(`/api/files/${name}/link`)).status).toBe(401);
  });
});

describe('GET /uploads with a signed link', () => {
  it('rejects an expired link', async () => {
    const owner = await signedIn('student');
    const name = await storedFile(owner, 'x');
    const { url } = signedUploadPath(name, owner.id, Date.now() - LINK_TTL_MS - 1000);
    const res = await request(app).get(url);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/expired/);
  });

  it('rejects a tampered signature, user or expiry', async () => {
    const owner = await signedIn('student');
    const other = await signedIn('student');
    const name = await storedFile(owner, 'x');
    const { url } = signedUploadPath(name, owner.id);
    const u = new URL(url, 'http://x');
    const variants = [
      (p) => p.set('sig', `${p.get('sig').slice(0, -1)}${p.get('sig').endsWith('A') ? 'B' : 'A'}`),
      (p) => p.set('uid', other.id),
      (p) => p.set('exp', String(Number(p.get('exp')) + 3600000)),
      (p) => p.delete('sig'),
    ];
    for (const change of variants) {
      const p = new URLSearchParams(u.search);
      change(p);
      const res = await request(app).get(`${u.pathname}?${p}`);
      expect([401, 403]).toContain(res.status); // never the file
      expect(res.text).not.toBe('x');
    }
  });

  it('a link for file A cannot fetch file B', async () => {
    const owner = await signedIn('student');
    const a = await storedFile(owner, 'file-A');
    const b = await storedFile(owner, 'file-B');
    const { url } = signedUploadPath(a, owner.id);
    const res = await request(app).get(url.replace(a, b));
    expect(res.status).toBe(403);
    expect(checkSignedUpload(b, Object.fromEntries(new URL(url, 'http://x').searchParams))).toEqual({ error: 'invalid' });
  });

  it('stops working when the person loses access or is signed out everywhere, even before it expires', async () => {
    // A file nobody owns is admin-only; the admin's link must die with the admin role
    const admin = await signedIn('admin');
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.pdf`;
    fs.writeFileSync(path.join(UPLOADS, name), 'orphan');
    created.push(name);
    const link = (await linkFor(admin, name)).body.url;
    expect((await request(app).get(link)).status).toBe(200);
    await User.findByIdAndUpdate(admin.id, { role: 'counselor' });
    invalidate(admin.id);
    expect((await request(app).get(link)).status).toBe(404);

    const student = await signedIn('student');
    const own = (await linkFor(student, await storedFile(student, 'mine'))).body.url;
    expect((await request(app).get(own)).status).toBe(200);
    await revokeAllSessions(student.id);
    expect((await request(app).get(own)).status).toBe(401);
  });
});

describe('the old ?token= links', () => {
  const before = process.env.ALLOW_LEGACY_UPLOAD_TOKENS;
  afterEach(() => { if (before === undefined) delete process.env.ALLOW_LEGACY_UPLOAD_TOKENS; else process.env.ALLOW_LEGACY_UPLOAD_TOKENS = before; });

  it('are refused unless ALLOW_LEGACY_UPLOAD_TOKENS is on', async () => {
    const owner = await signedIn('student');
    const name = await storedFile(owner, 'legacy');
    process.env.ALLOW_LEGACY_UPLOAD_TOKENS = 'false';
    expect((await request(app).get(`/uploads/${name}?token=${owner.token}`)).status).toBe(401);
    process.env.ALLOW_LEGACY_UPLOAD_TOKENS = 'true';
    expect((await request(app).get(`/uploads/${name}?token=${owner.token}`)).status).toBe(200);
  });

  it('are off by default in production', async () => {
    const { legacyUploadTokensAllowed } = require('../lib/fileLinks');
    const env = process.env.NODE_ENV;
    delete process.env.ALLOW_LEGACY_UPLOAD_TOKENS;
    try {
      process.env.NODE_ENV = 'production';
      expect(legacyUploadTokensAllowed()).toBe(false);
    } finally {
      process.env.NODE_ENV = env;
    }
  });
});

describe('credentials never reach the request log', () => {
  it('redactUrl replaces token, sig and similar values and keeps everything else', () => {
    expect(redactUrl('/uploads/a.pdf?uid=abc&exp=123&sig=SECRET')).toBe('/uploads/a.pdf?uid=abc&exp=123&sig=[redacted]');
    expect(redactUrl('/uploads/a.pdf?token=eyJhbGciOi.x.y')).toBe('/uploads/a.pdf?token=[redacted]');
    expect(redactUrl('/api/auth/verify-email?token=abc&x=1')).toBe('/api/auth/verify-email?token=[redacted]&x=1');
    expect(redactUrl('/api/students?search=ana')).toBe('/api/students?search=ana');
    expect(redactUrl('/api/health')).toBe('/api/health');
  });

  it('the request log and security events store a URL without the token in it', async () => {
    const secret = `tok-${crypto.randomBytes(12).toString('hex')}`;
    await request(app).get(`/api/auth/verify-email?token=${secret}`);
    await request(app).get(`/api/students/me?token=${secret}`).set('Authorization', 'Bearer not-a-real-token');
    await vi.waitFor(async () => {
      const logged = await RequestLog.find({ path: /^\/api\/(auth\/verify-email|students\/me)\?token=/ }).lean();
      expect(logged.length).toBeGreaterThanOrEqual(2);
      for (const r of logged) expect(r.path).not.toContain(secret);
      const events = await SecurityEvent.find({ type: 'token_invalid' }).sort({ _id: -1 }).limit(5).lean();
      const mine = events.find((e) => /\/api\/students\/me/.test(e.message || ''));
      expect(mine).toBeTruthy();
      expect(mine.message).toContain('token=[redacted]');
      expect(JSON.stringify(mine)).not.toContain(secret);
    });
  });
});

describe('FILE_URL_SECRET', () => {
  it('production refuses to start with a missing, weak or reused secret', async () => {
    const start = (env) => new Promise((resolve) => {
      execFile(process.execPath, ['-e', "require('./app')"], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:1/never', JWT_SECRET: 'j'.repeat(10) + crypto.randomBytes(24).toString('hex'), ...env },
        timeout: 20000,
      }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr }));
    });
    const missing = await start({ FILE_URL_SECRET: '' });
    expect(missing.code).toBe(1);
    expect(missing.out).toMatch(/FILE_URL_SECRET/);
    expect((await start({ FILE_URL_SECRET: 'short' })).code).toBe(1);
    const jwt = 'k'.repeat(8) + crypto.randomBytes(24).toString('hex');
    expect((await start({ FILE_URL_SECRET: jwt, JWT_SECRET: jwt })).out).toMatch(/must differ/);
  }, 60000);
});
