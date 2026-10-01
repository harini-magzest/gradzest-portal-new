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
const { recordUpload } = require('../middleware/recordUpload');
const { waitUntil } = require('./helpers');

let n = 0;
async function login(role) {
  const email = `up-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'Up Test', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, phone: '+91 90000 00000' });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

describe('recording uploads', () => {
  it('records who uploaded what with the true SHA-256, as unreviewed, and still lets the upload proceed', async () => {
    const { id, email } = await login('student');
    const content = `passport-bytes-${Date.now()}`;
    const file = path.join(os.tmpdir(), `up-${Date.now()}.pdf`);
    fs.writeFileSync(file, `%PDF-1.4\n${content}\n%%EOF`);
    const req = {
      file: { path: file, originalname: 'My Passport.pdf', filename: 'stored.pdf', mimetype: 'application/pdf', size: fs.statSync(file).size },
      user: { id, email, name: 'Up Test', role: 'student' }, ip: '203.0.113.9', headers: { 'user-agent': 'Jest' }, app: { get: () => null },
    };
    const next = vi.fn();
    await recordUpload('student_document')(req, {}, next);
    expect(next).toHaveBeenCalledOnce();

    const rec = await UploadRecord.findOne({ userId: id }).lean();
    expect(rec).toMatchObject({ originalName: 'My Passport.pdf', source: 'student_document', role: 'student', email, ip: '203.0.113.9' });
    expect(rec.sha256).toBe(sha(fs.readFileSync(file, 'utf8')));
    expect(rec.review.status).toBe('unreviewed');
    fs.unlinkSync(file);
  });

  it('never contacts any external service, even if a VirusTotal key happens to be set in the environment', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    process.env.VT_API_KEY = 'should-be-ignored';
    try {
      const { id, email } = await login('student');
      const file = path.join(os.tmpdir(), `nofetch-${Date.now()}.pdf`);
      fs.writeFileSync(file, '%PDF-1.4\nx\n%%EOF');
      await recordUpload('student_document')({
        file: { path: file, originalname: 'a.pdf', filename: 'a.pdf', mimetype: 'application/pdf', size: 20 },
        user: { id, email, role: 'student' }, ip: '203.0.113.1', headers: {}, app: { get: () => null },
      }, {}, vi.fn());
      await new Promise((r) => setTimeout(r, 200));
      expect(spy).not.toHaveBeenCalled();
      fs.unlinkSync(file);
    } finally { delete process.env.VT_API_KEY; vi.unstubAllGlobals(); }
  });

  it('does not block the upload if recording fails (missing file), and skips requests with no file', async () => {
    const next = vi.fn();
    await recordUpload('chat_file')({ file: { path: path.join(os.tmpdir(), 'nope-does-not-exist.pdf') }, user: { id: 'x' }, headers: {}, app: { get: () => null } }, {}, next);
    expect(next).toHaveBeenCalledOnce();
    const next2 = vi.fn();
    await recordUpload('chat_file')({ user: { id: 'x' }, headers: {} }, {}, next2);
    expect(next2).toHaveBeenCalledOnce();
  });
});

describe('Uploads tab: listing and the manual VirusTotal review', () => {
  const mkRec = (u, over = {}) => UploadRecord.create({ userId: u.id, email: u.email, role: 'student', source: 'student_document', originalName: 'doc.pdf', sha256: sha(`r-${Date.now()}-${n++}`), size: 100, ...over });

  it('lists uploads with a link to the hash on virustotal.com, filters by review state, and is admin-only', async () => {
    const admin = await login('admin');
    const u = await login('student');
    const tag = `Doc${Date.now()}`;
    const flagged = await mkRec(u, { originalName: `${tag}-bad.pdf`, review: { status: 'flagged', by: 'a@b.c' } });
    await mkRec(u, { originalName: `${tag}-ok.pdf`, review: { status: 'clean' } });
    await mkRec(u, { originalName: `${tag}-new.pdf` });

    let res = await request(app).get('/api/soc/uploads').query({ q: tag }).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.uploads).toHaveLength(3);
    expect(res.body.uploads.find((x) => x._id === String(flagged._id)).vtLink).toBe(`https://www.virustotal.com/gui/file/${flagged.sha256}`);
    expect(res.body).not.toHaveProperty('vtConfigured');

    const names = async (risk) => (await request(app).get('/api/soc/uploads').query({ q: tag, risk }).set(auth(admin.token))).body.uploads.map((x) => x.originalName);
    expect(await names('flagged')).toEqual([`${tag}-bad.pdf`]);
    expect(await names('clean')).toEqual([`${tag}-ok.pdf`]);
    expect(await names('unreviewed')).toEqual([`${tag}-new.pdf`]);
    expect(res.body.summary.unreviewed).toBeGreaterThanOrEqual(1);

    expect((await request(app).get('/api/soc/uploads').set(auth(u.token))).status).toBe(403);
  });

  it('records the analyst verdict; flagging opens one incident and is audited; clean/reset work; bad input is refused', async () => {
    const admin = await login('admin');
    const u = await login('student');
    const rec = await mkRec(u, { originalName: 'suspect.pdf' });
    const post = (body, token = admin.token) => request(app).post(`/api/soc/uploads/${rec._id}/review`).set(auth(token)).send(body);

    let res = await post({ status: 'flagged', note: '14/70 engines on VirusTotal' });
    expect(res.status).toBe(200);
    expect(res.body.review).toMatchObject({ status: 'flagged', by: admin.email, note: '14/70 engines on VirusTotal' });
    expect(res.body.review.at).toBeTruthy();
    await waitUntil(async () => SecurityIncident.findOne({ type: 'malware_upload', relatedUserId: u.id }));
    const inc = await SecurityIncident.find({ type: 'malware_upload', relatedUserId: u.id });
    expect(inc).toHaveLength(1);
    expect(inc[0].severity).toBe('high');
    expect(inc[0].title).toContain('suspect.pdf');
    await waitUntil(async () => AnalystAction.findOne({ action: 'review_upload', targetId: String(rec._id) }));
    expect(await AnalystAction.findOne({ action: 'review_upload', targetId: String(rec._id) })).toBeTruthy();

    await post({ status: 'flagged' });                       // flagging again must not duplicate the incident
    await new Promise((r) => setTimeout(r, 200));
    expect(await SecurityIncident.countDocuments({ type: 'malware_upload', relatedUserId: u.id })).toBe(1);

    res = await post({ status: 'clean', note: 'false alarm' });
    expect(res.body.review).toMatchObject({ status: 'clean', note: 'false alarm' });
    res = await post({ status: 'unreviewed' });
    expect(res.body.review).toMatchObject({ status: 'unreviewed', by: '', note: '', at: null });

    expect((await post({ status: 'bogus' })).status).toBe(400);
    expect((await post({ status: 'clean' }, u.token)).status).toBe(403);
    expect((await request(app).post('/api/soc/uploads/not-an-id/review').set(auth(admin.token)).send({ status: 'clean' })).status).toBe(404);
    expect((await request(app).post(`/api/soc/uploads/${new (require('mongoose').Types.ObjectId)()}/review`).set(auth(admin.token)).send({ status: 'clean' })).status).toBe(404);
  });

  it('the old automatic-lookup endpoint is gone', async () => {
    const admin = await login('admin');
    const u = await login('student');
    const rec = await mkRec(u);
    expect((await request(app).post(`/api/soc/uploads/${rec._id}/virustotal`).set(auth(admin.token))).status).toBe(404);
  });
});

describe('SOC: lock, profile, feature usage', () => {
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

  it('the response card has contact details, last login, upload count and recent uploads with their review state and hash link', async () => {
    const admin = await login('admin');
    const target = await login('student');
    await UploadRecord.create({ userId: target.id, email: target.email, originalName: 'transcript.pdf', sha256: sha(`t-${Date.now()}`), size: 5000, review: { status: 'clean' } });
    const fetchCard = () => request(app).get(`/api/soc/investigate/user/${target.id}`).set(auth(admin.token));
    let res = await fetchCard();
    await waitUntil(async () => { res = await fetchCard(); return res.body.profile?.lastLogin; });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ phone: '+91 90000 00000', locked: false, uploadsCount: 1 });
    expect(res.body.profile.lastLogin).toBeTruthy();
    expect(res.body.recentUploads[0]).toMatchObject({ originalName: 'transcript.pdf', review: { status: 'clean' } });
    expect(res.body.recentUploads[0].vtLink).toContain('virustotal.com/gui/file/');
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
