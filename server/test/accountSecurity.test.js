const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../app');
const User = require('../models/User');
const SecurityEvent = require('../models/SecurityEvent');
const { waitUntil } = require('./helpers');

const PASSWORD = 'TestPass123!';
const NEW_PASSWORD = 'BrandNew456#';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;

async function makeUser(role = 'counselor', extra = {}) {
  const email = `acct-${role}-${Date.now()}-${n++}@example.com`;
  const user = await User.create({ name: 'Acct Test', email, password: HASH, role, emailVerified: true, active: true, ...extra });
  return { email, password: PASSWORD, id: String(user._id) };
}

async function signIn(u, password = u.password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set('User-Agent', `Device-${n++}`).send({ email: u.email, password });
  return { agent, res, token: res.body.token };
}

describe('change password', () => {
  const change = (s, body) => s.agent.post('/api/account/change-password').set(bearer(s.token)).send(body);

  it('changes the password, keeps this device signed in and signs every other device out', async () => {
    const u = await makeUser();
    const here = await signIn(u);
    const elsewhere = await signIn(u);

    const res = await change(here, { currentPassword: u.password, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);

    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: NEW_PASSWORD })).status).toBe(200);
    // this device is handed a fresh session and token in the response; the other device's session is gone
    expect(res.body.token).toBeTruthy();
    expect((await request(app).get('/api/auth/me').set(bearer(res.body.token))).status).toBe(200);
    expect((await here.agent.post('/api/auth/refresh')).status).toBe(200);
    expect((await elsewhere.agent.post('/api/auth/refresh')).status).toBe(401);

    const event = await waitUntil(() => SecurityEvent.findOne({ type: 'password_change', userId: u.id }));
    expect(event).toBeTruthy();
    // the hash on file is a hash, and of the new password
    const stored = await User.findById(u.id);
    expect(stored.password).not.toBe(NEW_PASSWORD);
    expect(await bcrypt.compare(NEW_PASSWORD, stored.password)).toBe(true);
  });

  it('refuses a wrong current password and leaves the password alone', async () => {
    const u = await makeUser();
    const s = await signIn(u);
    const res = await change(s, { currentPassword: 'WrongPass1!', newPassword: NEW_PASSWORD });
    // 403, not 401: the web client treats a 401 on these routes as an expired token and would send the guess twice
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/incorrect/i);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(200);
  });

  it('enforces the same password rules as sign-up', async () => {
    const u = await makeUser();
    const s = await signIn(u);
    for (const weak of ['short1!', 'alllowercase1!', 'NoNumbersHere!', 'NoSpecial123']) {
      const res = await change(s, { currentPassword: u.password, newPassword: weak });
      expect(res.status).toBe(400);
    }
    expect((await change(s, { currentPassword: u.password })).status).toBe(400);
    expect((await change(s, { newPassword: NEW_PASSWORD })).status).toBe(400);
    expect((await change(s, { currentPassword: u.password, newPassword: u.password })).body.message).toMatch(/different/i);
    // still the old password
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(200);
  });

  it('counts wrong current passwords toward the lockout, so a stolen session cannot guess the password', async () => {
    const u = await makeUser();
    const s = await signIn(u);
    let last;
    for (let i = 0; i < 5; i++) last = await change(s, { currentPassword: 'WrongPass1!', newPassword: NEW_PASSWORD });
    expect(last.status).toBe(423);
    // locked: even the right password is refused now
    expect((await change(s, { currentPassword: u.password, newPassword: NEW_PASSWORD })).status).toBe(423);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(423);
  });

  it('does not accept non-string passwords (no crash, no bypass)', async () => {
    const u = await makeUser();
    const s = await signIn(u);
    for (const bad of [{ $ne: '' }, ['x'], 12345678, true]) {
      const res = await change(s, { currentPassword: bad, newPassword: NEW_PASSWORD });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });
});

describe('staff profile', () => {
  const update = (s, body) => s.agent.put('/api/account/profile').set(bearer(s.token)).send(body);

  it('lets staff change their own name, phone and bio, and nothing else', async () => {
    const u = await makeUser('admin');
    const s = await signIn(u);
    const res = await update(s, {
      name: '  Priya Menon  ', phone: '+91 98765 43210', bio: 'Head of admissions',
      email: 'hijack@example.com', role: 'student', active: false, isAppTeam: true, password: 'x',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Priya Menon', phone: '+91 98765 43210', bio: 'Head of admissions' });
    expect(res.body.password).toBeUndefined();
    const stored = await User.findById(u.id);
    expect(stored.email).toBe(u.email);
    expect(stored.role).toBe('admin');
    expect(stored.active).toBe(true);
    expect(stored.isAppTeam).toBeFalsy();
  });

  it('keeps first and last name in step when they exist', async () => {
    const u = await makeUser('counselor', { firstName: 'Old', lastName: 'Name' });
    const s = await signIn(u);
    const res = await update(s, { name: 'Anita Rao Iyer' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Anita Rao Iyer', firstName: 'Anita Rao', lastName: 'Iyer' });
  });

  it('rejects an empty name or an empty update, and is not for students', async () => {
    const u = await makeUser('admin');
    const s = await signIn(u);
    expect((await update(s, { name: '   ' })).status).toBe(400);
    expect((await update(s, {})).status).toBe(400);
    const student = await makeUser('student');
    const st = await signIn(student);
    expect((await update(st, { name: 'Nope' })).status).toBe(403);
  });
});
