const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { app } = require('../app');
const User = require('../models/User');
const UiActivity = require('../models/UiActivity');
const UploadRecord = require('../models/UploadRecord');
const SecurityIncident = require('../models/SecurityIncident');
const AnalystAction = require('../models/AnalystAction');
const vt = require('../lib/virusTotal');
const { recordUpload } = require('../middleware/recordUpload');
const { waitUntil } = require('./helpers');

let n = 0;
async function login(role) {
  const email = `vt-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'VT Test', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, phone: '+91 90000 00000' });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const jsonRes = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function withKey(fn) {
  return async () => {
    process.env.VT_API_KEY = 'test-key';
    try { await fn(); } finally { delete process.env.VT_API_KEY; vi.unstubAllGlobals(); }
  };
}

describe('VirusTotal client (hash lookup only)', () => {
  it('is inert without an API key', async () => {
    delete process.env.VT_API_KEY;
    expect((await vt.lookupHash('a'.repeat(64))).status).toBe('not_configured');
  });

  it('maps VirusTotal responses to risk states and never throws', withKey(async () => {
    const hash = 'b'.repeat(64);
    const stats = (s) => jsonRes(200, { data: { attributes: { last_analysis_stats: s, last_analysis_date: 1700000000, popular_threat_classification: { suggested_threat_label: 'trojan.emotet' } } } });

    const bad = await vt.lookupHash(hash, vi.fn().mockResolvedValue(stats({ malicious: 12, suspicious: 1, harmless: 0, undetected: 50 })));
    expect(bad).toMatchObject({ status: 'malicious', malicious: 12, suspicious: 1, label: 'trojan.emotet' });
    expect((await vt.lookupHash(hash, vi.fn().mockResolvedValue(stats({ malicious: 0, suspicious: 2 })))).status).toBe('suspicious');
    expect((await vt.lookupHash(hash, vi.fn().mockResolvedValue(stats({ malicious: 0, suspicious: 0, harmless: 60 })))).status).toBe('clean');
    expect((await vt.lookupHash(hash, vi.fn().mockResolvedValue(jsonRes(404, {})))).status).toBe('unknown');
    expect((await vt.lookupHash(hash, vi.fn().mockResolvedValue(jsonRes(429, {})))).status).toBe('rate_limited');
    const denied = await vt.lookupHash(hash, vi.fn().mockResolvedValue(jsonRes(401, {})));
    expect(denied.status).toBe('error');
    expect(denied.error).toMatch(/API key/);
    expect((await vt.lookupHash(hash, vi.fn().mockRejectedValue(new Error('network down')))).status).toBe('error');

    // The request carries only the hash and the key — never file content.
    const spy = vi.fn().mockResolvedValue(jsonRes(404, {}));
    await vt.lookupHash(hash, spy);
    expect(spy.mock.calls[0][0]).toBe(`https://www.virustotal.com/api/v3/files/${hash}`);
    expect(spy.mock.calls[0][1].headers['x-apikey']).toBe('test-key');
    expect(spy.mock.calls[0][1].body).toBeUndefined();
    expect(spy.mock.calls[0][1].method).toBeUndefined(); // plain GET
  }));
});

describe('recording uploads', () => {
  it('records who uploaded what with the true SHA-256, and still lets the upload proceed', async () => {
    delete process.env.VT_API_KEY;
    const { id, email } = await login('student');
    const content = `passport-bytes-${Date.now()}`;
    const file = path.join(os.tmpdir(), `up-${Date.now()}.pdf`);
    fs.writeFileSync(file, content);
    const req = {
      file: { path: file, originalname: 'My Passport.pdf', filename: 'stored.pdf', mimetype: 'application/pdf', size: content.length },
      user: { id, email, name: 'VT Test', role: 'student' }, ip: '203.0.113.9', headers: { 'user-agent': 'Jest' },
      app: { get: () => null },
    };
    const next = vi.fn();
    await recordUpload('student_document')(req, {}, next);
    expect(next).toHaveBeenCalledOnce();

    const rec = await UploadRecord.findOne({ userId: id }).lean();
    expect(rec).toMatchObject({ originalName: 'My Passport.pdf', source: 'student_document', role: 'student', email, ip: '203.0.113.9', size: content.length });
    expect(rec.sha256).toBe(sha(content));
    expect(rec.vt.status).toBe('not_configured');
    fs.unlinkSync(file);
  });

  it('does not block the upload if recording fails (missing file)', async () => {
    const next = vi.fn();
    await recordUpload('chat_file')({ file: { path: path.join(os.tmpdir(), 'nope-does-not-exist.pdf') }, user: { id: 'x' }, headers: {}, app: { get: () => null } }, {}, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips requests that carry no file', async () => {
    const next = vi.fn();
    await recordUpload('chat_file')({ user: { id: 'x' }, headers: {} }, {}, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('VirusTotal check of a recorded upload', () => {
  const mk = async (over = {}) => {
    const { id, email } = await login('student');
    return UploadRecord.create({ userId: id, email, role: 'student', source: 'student_document', originalName: 'cv.pdf', sha256: sha(`f-${Date.now()}-${n++}`), size: 10, ip: '203.0.113.7', ...over });
  };

  it('a known-malicious hash opens a high-severity incident naming the file and user', withKey(async () => {
    const rec = await mk();
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(200, { data: { attributes: { last_analysis_stats: { malicious: 7, suspicious: 0, harmless: 1, undetected: 60 } } } }));
    const out = await vt.checkUpload(rec._id, { fetchImpl });
    expect(out.vt.status).toBe('malicious');
    expect(out.vt.attempts).toBe(1);
    const inc = await SecurityIncident.findOne({ type: 'malware_upload', relatedUserId: rec.userId });
    expect(inc).toBeTruthy();
    expect(inc.severity).toBe('critical'); // 7 engines >= 5
    expect(inc.title).toContain('cv.pdf');
  }));

  it('reuses a recent result for the same hash instead of calling VirusTotal again', withKey(async () => {
    const hash = sha(`shared-${Date.now()}`);
    const first = await mk({ sha256: hash });
    const clean = vi.fn().mockResolvedValue(jsonRes(200, { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 70 } } } }));
    await vt.checkUpload(first._id, { fetchImpl: clean });
    expect(clean).toHaveBeenCalledTimes(1);

    const second = await mk({ sha256: hash });
    const never = vi.fn();
    const out = await vt.checkUpload(second._id, { fetchImpl: never });
    expect(never).not.toHaveBeenCalled();
    expect(out.vt.status).toBe('clean');
  }));

  it('a clean or unknown result raises no incident', withKey(async () => {
    const rec = await mk();
    await vt.checkUpload(rec._id, { fetchImpl: vi.fn().mockResolvedValue(jsonRes(404, {})) });
    expect((await UploadRecord.findById(rec._id)).vt.status).toBe('unknown');
    expect(await SecurityIncident.countDocuments({ type: 'malware_upload', relatedUserId: rec.userId })).toBe(0);
  }));
});

describe('SOC: uploads, lock, profile, feature usage', () => {
  it('lists uploads with a VirusTotal link, filters by risk, and is admin-only', async () => {
    const admin = await login('admin');
    const u = await login('student');
    const tag = `Doc${Date.now()}`;
    const rec = await UploadRecord.create({ userId: u.id, email: u.email, role: 'student', source: 'student_document', originalName: `${tag}.pdf`, sha256: sha(tag), size: 2048, vt: { status: 'malicious', malicious: 4 } });
    await UploadRecord.create({ userId: u.id, email: u.email, role: 'student', originalName: `${tag}-ok.pdf`, sha256: sha(tag + 'ok'), size: 1, vt: { status: 'clean' } });

    let res = await request(app).get('/api/soc/uploads').query({ q: tag }).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.uploads).toHaveLength(2);
    expect(res.body.uploads.find((x) => x._id === String(rec._id)).vtLink).toBe(`https://www.virustotal.com/gui/file/${sha(tag)}`);
    expect(res.body).toHaveProperty('vtConfigured');

    res = await request(app).get('/api/soc/uploads').query({ q: tag, risk: 'flagged' }).set(auth(admin.token));
    expect(res.body.uploads.map((x) => x.originalName)).toEqual([`${tag}.pdf`]);

    expect((await request(app).get('/api/soc/uploads').set(auth(u.token))).status).toBe(403);
  });

  it('re-check refuses cleanly without a key, and works (and is audited) with one', async () => {
    const admin = await login('admin');
    const u = await login('student');
    const rec = await UploadRecord.create({ userId: u.id, email: u.email, originalName: 'r.pdf', sha256: sha(`rc-${Date.now()}`), vt: { status: 'error' } });

    delete process.env.VT_API_KEY;
    expect((await request(app).post(`/api/soc/uploads/${rec._id}/virustotal`).set(auth(admin.token))).status).toBe(400);

    process.env.VT_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(200, { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 5 } } } })));
    try {
      const res = await request(app).post(`/api/soc/uploads/${rec._id}/virustotal`).set(auth(admin.token));
      expect(res.status).toBe(200);
      expect(res.body.vt.status).toBe('clean');
      await waitUntil(async () => AnalystAction.findOne({ action: 'virustotal_recheck', targetId: String(rec._id) }));
      expect(await AnalystAction.findOne({ action: 'virustotal_recheck', targetId: String(rec._id) })).toBeTruthy();
    } finally { delete process.env.VT_API_KEY; vi.unstubAllGlobals(); }
  });

  it('lock blocks sign-in with a clear message and revokes sessions; unlock restores it; cannot lock yourself', async () => {
    const admin = await login('admin');
    const target = await login('counselor');

    expect((await request(app).post(`/api/soc/investigate/user/${admin.id}/lock`).set(auth(admin.token)).send({})).status).toBe(400);

    const locked = await request(app).post(`/api/soc/investigate/user/${target.id}/lock`).set(auth(admin.token)).send({ reason: 'suspicious uploads' });
    expect(locked.status).toBe(200);
    expect((await User.findById(target.id)).sessions).toHaveLength(0);
    const denied = await request(app).post('/api/auth/login').send({ email: target.email, password: 'TestPass123!' });
    expect(denied.status).toBe(423);
    expect(denied.body.message).toMatch(/locked by an administrator/i);

    const profile = await request(app).get(`/api/soc/investigate/user/${target.id}`).set(auth(admin.token));
    expect(profile.body.profile.locked).toBe(true);

    await request(app).post(`/api/soc/investigate/user/${target.id}/lock`).set(auth(admin.token)).send({ locked: false });
    expect((await request(app).post('/api/auth/login').send({ email: target.email, password: 'TestPass123!' })).status).toBe(200);
  });

  it('the response card has contact details, last login, upload count and recent uploads', async () => {
    const admin = await login('admin');
    const target = await login('student');
    await UploadRecord.create({ userId: target.id, email: target.email, originalName: 'transcript.pdf', sha256: sha(`t-${Date.now()}`), size: 5000, vt: { status: 'unknown' } });
    // The sign-in event is written in the background, so poll for it instead of assuming it already landed.
    const fetchCard = () => request(app).get(`/api/soc/investigate/user/${target.id}`).set(auth(admin.token));
    let res = await fetchCard();
    await waitUntil(async () => { res = await fetchCard(); return res.body.profile?.lastLogin; });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ phone: '+91 90000 00000', locked: false, uploadsCount: 1 });
    expect(res.body.profile.lastLogin).toBeTruthy();
    expect(res.body.recentUploads[0]).toMatchObject({ originalName: 'transcript.pdf' });
    expect(res.body.recentUploads[0].vtLink).toContain('virustotal.com');
    expect(res.body.timeline.some((t) => t.source === 'upload' && t.title.includes('transcript.pdf'))).toBe(true);
  });

  it('feature usage ranks the pages, buttons and people actually in use', async () => {
    const admin = await login('admin');
    const a = await login('counselor');
    const b = await login('counselor');
    const file = 'src/pages/counselor/CounselorStudents.tsx';
    const mkUi = (u, kind, label) => ({ userId: u.id, email: u.email, role: 'counselor', kind, page: '/counselor/students', file, element: { tag: 'button', label } });
    await UiActivity.insertMany([
      mkUi(a, 'page_view', 'Students'), mkUi(b, 'page_view', 'Students'), mkUi(a, 'page_view', 'Students'),
      mkUi(a, 'click', 'Add note'), mkUi(a, 'click', 'Add note'), mkUi(b, 'click', 'Add note'), mkUi(b, 'click', 'Export'),
    ]);

    let res = await request(app).get('/api/soc/feature-usage').query({ period: '24h' }).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.pages.find((p) => p.file === file)).toMatchObject({ views: 3, users: 2 });
    expect(res.body.features.find((f) => f.file === file && f.label === 'Add note')).toMatchObject({ uses: 3, users: 2 });
    expect(res.body.features.find((f) => f.label === 'Export').uses).toBe(1);
    expect(res.body.users.find((u) => u.email === a.email).actions).toBe(4);

    res = await request(app).get('/api/soc/feature-usage').query({ period: '24h', userId: b.id }).set(auth(admin.token));
    expect(res.body.users).toHaveLength(1);
    expect(res.body.features.find((f) => f.label === 'Add note').uses).toBe(1);
    expect((await request(app).get('/api/soc/feature-usage').set(auth(a.token))).status).toBe(403);
  });
});
