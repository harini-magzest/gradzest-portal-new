// scripts/rotateDemoAccounts.js: the demo accounts whose passwords were in the source code get a new random password
// (or are deleted), and every existing session of theirs stops working at once.
const path = require('path');
const { execFile } = require('child_process');
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { rotateDemoAccounts, DEMO_EMAILS } = require('../scripts/rotateDemoAccounts');
const { invalidate } = require('../lib/accountState');

const PASSWORD = 'Original-Pass-42';
let n = 0;

// A signed-in account: its access token and the refresh cookie of that session
async function signedIn(role, extra = {}, email = `rotate-${role}-${Date.now()}-${n++}@example.com`) {
  await request(app).post('/api/auth/register').send({ name: `Rotate ${role}`, email, password: PASSWORD });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return { email, id: String(res.body.user.id), token: res.body.token, cookie: res.headers['set-cookie'] };
}
const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('rotateDemoAccounts', () => {
  it('targets exactly the four demo accounts by default', () => {
    expect(DEMO_EMAILS).toEqual(['admin@eduabroad.com', 'kavitha@eduabroad.com', 'rajesh@eduabroad.com', 'aryan@example.com']);
  });

  it('changes nothing on a dry run', async () => {
    const a = await signedIn('admin');
    const before = await User.findOne({ email: a.email }).select('password sessions').lean();
    const [row] = await rotateDemoAccounts({ emails: [a.email] });
    expect(row).toMatchObject({ email: a.email, role: 'admin', sessions: before.sessions.length, action: expect.stringMatching(/^would set a new password/) });
    expect(row.sessions).toBeGreaterThan(0);
    expect(row.password).toBeUndefined();
    const after = await User.findOne({ email: a.email }).select('password sessions').lean();
    expect(after.password).toBe(before.password);
    expect(after.sessions).toHaveLength(before.sessions.length);
    expect((await me(a.token)).status).toBe(200);
  });

  it('sets a new random password and ends every session: old password, access token and refresh token all fail', async () => {
    const a = await signedIn('admin');
    const b = await signedIn('student');
    const rows = await rotateDemoAccounts({ apply: true, emails: [a.email, b.email, 'nobody-here@example.com'] });

    expect(rows[2]).toEqual({ email: 'nobody-here@example.com', action: 'not found, nothing to do' });
    const [pa, pb] = [rows[0].password, rows[1].password];
    expect(pa.length).toBeGreaterThanOrEqual(24);
    expect(pa).not.toBe(pb);
    expect((await User.findOne({ email: a.email }).select('password').lean()).password).toMatch(/^\$2[aby]\$10\$/);

    const old = await me(a.token);
    expect(old.status).toBe(401);
    expect(old.body.code).toBe('SESSION_REVOKED');
    expect((await request(app).post('/api/auth/refresh').set('Cookie', a.cookie)).status).toBe(401);
    expect((await login(a.email, PASSWORD)).status).toBe(401);

    const fresh = await login(a.email, pa);
    expect(fresh.status).toBe(200);
    expect((await me(fresh.body.token)).status).toBe(200); // a token issued after the rotation works
  });

  it('with --delete removes the account, and its token stops working', async () => {
    const s = await signedIn('student');
    const [row] = await rotateDemoAccounts({ apply: true, remove: true, emails: [s.email] });
    expect(row.action).toBe('deleted');
    expect(await User.exists({ email: s.email })).toBeNull();
    expect((await me(s.token)).status).toBe(401);
  });

  it('will not delete a counselor who still has students', async () => {
    const c = await signedIn('counselor');
    await signedIn('student', { counselorId: c.id });
    const [row] = await rotateDemoAccounts({ apply: true, remove: true, emails: [c.email] });
    expect(row.action).toMatch(/^not deleted: 1 student/);
    expect(await User.exists({ email: c.email })).not.toBeNull();
  });

  it('run as a command against a database seeded with the demo accounts: dry run by default, then --apply', async () => {
    // Each test file has its own in-memory database, so the real demo emails can be created here safely
    const roles = { 'admin@eduabroad.com': 'admin', 'kavitha@eduabroad.com': 'counselor', 'rajesh@eduabroad.com': 'counselor', 'aryan@example.com': 'student' };
    const accounts = {};
    for (const [email, role] of Object.entries(roles)) accounts[email] = await signedIn(role, {}, email);
    const run = (...args) => new Promise((resolve) => {
      // MONGODB_URI is this file's in-memory database; dotenv never overrides a variable that is already set
      execFile(process.execPath, [path.join(__dirname, '..', 'scripts', 'rotateDemoAccounts.js'), ...args],
        { env: process.env }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
    });

    const dry = await run();
    expect(dry.code).toBe(0);
    expect(dry.stdout).toMatch(/DRY RUN/);
    for (const email of DEMO_EMAILS) expect(dry.stdout).toMatch(new RegExp(`${esc(email)}.*would set a new password`));
    expect(dry.stdout).not.toMatch(/New passwords/);
    expect((await me(accounts['admin@eduabroad.com'].token)).status).toBe(200);

    const applied = await run('--apply');
    expect(applied.code).toBe(0);
    // The script ran in another process, so this server only sees the revocation once its account cache entry
    // expires (10 seconds by design); clear it rather than wait
    for (const { id } of Object.values(accounts)) invalidate(id);
    for (const email of DEMO_EMAILS) {
      const pw = applied.stdout.match(new RegExp(`^\\s+${esc(email)}\\s+([A-Za-z0-9_-]{32})$`, 'm'))[1];
      expect(applied.stdout.split(pw).length - 1).toBe(1); // printed once
      expect((await login(email, pw)).status).toBe(200);
      expect((await login(email, PASSWORD)).status).toBe(401);
      expect((await me(accounts[email].token)).status).toBe(401);
    }

    expect((await run('--force')).code).toBe(1); // unknown options are refused, not ignored
  }, 90000);
});
