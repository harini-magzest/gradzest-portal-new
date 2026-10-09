const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../app');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const SecurityEvent = require('../models/SecurityEvent');
const { waitUntil } = require('./helpers');

const PASSWORD = 'TestPass123!';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
let n = 0;

async function session(role, extra = {}) {
  const email = `settings-${role}-${Date.now()}-${n++}@example.com`;
  const user = await User.create({ name: `Settings ${role}`, email, password: HASH, role, emailVerified: true, active: true, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { id: String(user._id), email, token: res.body.token };
}
const admin = () => session('admin');
const appTeam = () => session('admin', { isAppTeam: true });
const get = (s, path) => request(app).get(path).set(bearer(s.token));

describe('company profile', () => {
  it('starts with defaults, saves what an admin sends, and trims it', async () => {
    const a = await admin();
    const first = await get(a, '/api/admin/settings/company');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ name: 'Gradzest', tagline: '', website: '' });

    const res = await request(app).put('/api/admin/settings/company').set(bearer(a.token))
      .send({ name: '  Gradzest Education  ', tagline: 'Your global partner', email: 'hello@gradzest.example', website: 'https://gradzest.example', phone: '+91 99999 99999' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Gradzest Education', tagline: 'Your global partner', email: 'hello@gradzest.example' });
    // it persists, and a later partial update keeps the rest
    await request(app).put('/api/admin/settings/company').set(bearer(a.token)).send({ address: 'Chennai, India' });
    const again = await get(a, '/api/admin/settings/company');
    expect(again.body).toMatchObject({ name: 'Gradzest Education', address: 'Chennai, India', website: 'https://gradzest.example' });
  });

  it('rejects bad input and ignores fields it does not know', async () => {
    const a = await admin();
    const put = (body) => request(app).put('/api/admin/settings/company').set(bearer(a.token)).send(body);
    expect((await put({ name: '   ' })).status).toBe(400);
    expect((await put({ email: 'not-an-email' })).status).toBe(400);
    // Script-looking addresses are stopped earlier still, by the WAF (403); either way they are never stored.
    expect([400, 403]).toContain((await put({ website: 'javascript:alert(1)' })).status);
    expect([400, 403]).toContain((await put({ website: 'data:text/html,<script>' })).status);
    // ...and the validator itself only lets http(s) addresses through
    for (const website of ['ftp://files.example.com', 'example.com', '//evil.example.com', 'https://has space.example.com']) {
      expect((await put({ website })).status).toBe(400);
    }
    expect((await put({ name: 'x'.repeat(101) })).status).toBe(400);
    expect((await put({ name: { $ne: '' } })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    const stray = await put({ tagline: 'ok', role: 'admin', evil: 'yes', key: 'other' });
    expect(stray.status).toBe(200);
    expect(stray.body.evil).toBeUndefined();
    expect(stray.body.role).toBeUndefined();
  });

  it('is for full admins only', async () => {
    for (const s of [await session('counselor'), await session('student'), await appTeam()]) {
      expect((await get(s, '/api/admin/settings/company')).status).toBe(403);
      expect((await request(app).put('/api/admin/settings/company').set(bearer(s.token)).send({ name: 'Hijacked' })).status).toBe(403);
    }
    expect((await request(app).get('/api/admin/settings/company')).status).toBe(401);
  });
});

describe('integrations status', () => {
  it('says whether each service is connected, and never echoes a key', async () => {
    const a = await admin();
    process.env.SMTP_USER = 'mailer@example.test';
    process.env.SMTP_PASS = 'super-secret-smtp-password';
    process.env.SMARTFLO_API_TOKEN = 'super-secret-smartflo-token';
    try {
      const res = await get(a, '/api/admin/integrations');
      expect(res.status).toBe(200);
      expect(res.body.email.connected).toBe(true);
      expect(res.body.calls.connected).toBe(true);
      expect(res.body.whatsapp.connected).toBe(false); // blanked in the test setup
      expect(res.body.ai.connected).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/super-secret|mailer@example/);
    } finally {
      delete process.env.SMTP_USER; delete process.env.SMTP_PASS; delete process.env.SMARTFLO_API_TOKEN;
    }
  });

  it('is for full admins only', async () => {
    for (const s of [await session('counselor'), await appTeam()]) expect((await get(s, '/api/admin/integrations')).status).toBe(403);
  });
});

describe('CSV exports', () => {
  it('exports students as CSV, defuses spreadsheet formulas, and leaves out erased students', async () => {
    const a = await admin();
    const tag = `exp${Date.now()}`;
    await User.create({ name: `=HYPERLINK("http://evil.test","${tag}")`, email: `${tag}-a@example.com`, password: HASH, role: 'student', phone: '+91 90000 00001', nationality: 'India' });
    await User.create({ name: `Erased ${tag}`, email: `${tag}-b@example.com`, password: HASH, role: 'student', deletedAt: new Date() });

    const res = await get(a, '/api/admin/export/students');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="gradzest-students-\d{4}-\d{2}-\d{2}\.csv"/);
    const csv = res.text;
    expect(csv.split('\r\n')[0]).toBe('Name,Email,Phone,Nationality,Status,Lead stage,Education level,Preferred countries,Counselor,Source,Joined');
    expect(csv).toContain(`${tag}-a@example.com`);
    expect(csv).not.toContain(`${tag}-b@example.com`);
    // the formula is stored with a leading quote, so a spreadsheet shows it as text instead of running it
    expect(csv).toContain(`"'=HYPERLINK(`);
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  it('exports applications and meetings', async () => {
    const a = await admin();
    const tag = `exp${Date.now()}`;
    await User.create({
      name: `Applicant ${tag}`, email: `${tag}-app@example.com`, password: HASH, role: 'student',
      applications: [{ universityName: `Uni ${tag}`, courseName: 'MSc Data Science', intake: 'Fall 2027', status: 'submitted' }],
    });
    await Meeting.create({ title: `Call ${tag}`, scheduledDate: '2030-01-01', scheduledTime: '10:00', participants: [{ name: 'Asha' }, { name: 'Ravi' }] });

    const apps = await get(a, '/api/admin/export/applications');
    expect(apps.status).toBe(200);
    expect(apps.text).toContain(`Uni ${tag}`);
    expect(apps.text).toContain('MSc Data Science');
    const meetings = await get(a, '/api/admin/export/meetings');
    expect(meetings.text).toContain(`Call ${tag}`);
    expect(meetings.text).toContain('Asha; Ravi');
  });

  it('logs every export as a security event', async () => {
    const a = await admin();
    await get(a, '/api/admin/export/meetings');
    const event = await waitUntil(() => SecurityEvent.findOne({ type: 'data_export', userId: a.id, 'meta.export': 'meetings' }));
    expect(event).toBeTruthy();
  });

  it('is for full admins only, and knows only its own three exports', async () => {
    for (const s of [await session('counselor'), await session('student'), await appTeam()]) {
      expect((await get(s, '/api/admin/export/students')).status).toBe(403);
    }
    expect((await request(app).get('/api/admin/export/students')).status).toBe(401);
    const a = await admin();
    for (const kind of ['full', 'users', '__proto__', 'constructor', 'toString']) {
      expect((await get(a, `/api/admin/export/${kind}`)).status).toBe(404);
    }
  });
});
