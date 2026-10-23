const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const AnalystAction = require('../models/AnalystAction');
const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const socExtras = require('../routes/soc/extras');

let counter = 0;
const uniq = (p) => `${p}-${Date.now()}-${counter++}`;
const oid = () => new mongoose.Types.ObjectId();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function makeUser(prefix, role = 'admin') {
  const email = `${uniq(prefix)}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'Test Person', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: login.body.token, email, userId: login.body.user.id };
}

describe('SOC extras: owner-only', () => {
  it('every route on the extras router rejects non-owners and anonymous callers', async () => {
    const student = await makeUser('extras-student', 'student');
    const routes = socExtras.stack.filter((l) => l.route).map((l) => ({ path: l.route.path, method: Object.keys(l.route.methods)[0] }));
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const r of routes) {
      const url = `/api/soc${r.path.replace(':id', String(oid()))}`;
      const anon = await request(app)[r.method](url);
      expect([401, 403]).toContain(anon.status);
      const s = await request(app)[r.method](url).set(auth(student.token));
      expect(s.status).toBe(403);
    }
  });
});

describe('GET /api/soc/access', () => {
  const saved = process.env.SOC_OWNER_EMAILS;
  afterEach(() => { if (saved === undefined) delete process.env.SOC_OWNER_EMAILS; else process.env.SOC_OWNER_EMAILS = saved; });

  it('is 200 for the SOC owner, 403 for any other admin, 401 when signed out', async () => {
    const owner = await makeUser('access-owner');
    const otherAdmin = await makeUser('access-other');
    process.env.SOC_OWNER_EMAILS = owner.email;
    const asOwner = await request(app).get('/api/soc/access').set(auth(owner.token));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body).toEqual({ ok: true });
    expect((await request(app).get('/api/soc/access').set(auth(otherAdmin.token))).status).toBe(403);
    expect((await request(app).get('/api/soc/access')).status).toBe(401);
  });
});

describe('GET /api/soc/attention', () => {
  it('surfaces unacknowledged high-severity incidents and noisy accounts', async () => {
    const admin = await makeUser('extras-admin');
    const victim = await makeUser('extras-victim', 'student');
    const inc = await SecurityIncident.create({ type: 'brute_force', severity: 'critical', title: 'Attention test', relatedIp: '198.51.100.7', relatedUserId: victim.userId, status: 'open' });
    await SecurityEvent.create({ type: 'login_failure', userId: victim.userId, ip: '198.51.100.7', severity: 'medium' });

    const res = await request(app).get('/api/soc/attention').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.counts.unacknowledged).toBeGreaterThanOrEqual(1);
    expect(res.body.unacknowledged.some((i) => String(i._id) === String(inc._id))).toBe(true);
    const acct = res.body.accounts.find((a) => a.userId === victim.userId);
    expect(acct).toBeTruthy();
    expect(acct.openIncidents).toBeGreaterThanOrEqual(1);
    expect(res.body.ips.some((i) => i.ip === '198.51.100.7')).toBe(true);
  });
});

describe('GET /api/soc/incidents/:id/detail', () => {
  it('returns the incident with SLA, subject, related incidents and actions; 404 for bad ids', async () => {
    const admin = await makeUser('extras-detail');
    const subject = await makeUser('extras-subject', 'student');
    const ip = '198.51.100.55';
    const a = await SecurityIncident.create({ type: 'brute_force', severity: 'high', title: 'Detail A', relatedIp: ip, relatedUserId: subject.userId });
    await SecurityIncident.create({ type: 'waf_block', severity: 'medium', title: 'Detail B', relatedIp: ip });
    await SecurityEvent.create({ type: 'login_failure', userId: subject.userId, ip, severity: 'medium' });
    await AnalystAction.create({ analystId: admin.userId, analystEmail: admin.email, action: 'incident_assigned', targetType: 'incident', targetId: String(a._id), reason: 'looked at it', prevHash: '', hash: uniq('h') });

    const res = await request(app).get(`/api/soc/incidents/${a._id}/detail`).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.incident.title).toBe('Detail A');
    expect(res.body.sla.policy.ackMinutes).toBe(60);
    expect(res.body.subject.email).toBe(subject.email);
    expect(res.body.related.map((r) => r.title)).toContain('Detail B');
    expect(res.body.evidence.kind).toBe('matched');
    expect(res.body.evidence.events.length).toBeGreaterThanOrEqual(1);
    expect(res.body.actions.length).toBe(1);

    expect((await request(app).get('/api/soc/incidents/not-an-id/detail').set(auth(admin.token))).status).toBe(404);
    expect((await request(app).get(`/api/soc/incidents/${oid()}/detail`).set(auth(admin.token))).status).toBe(404);
  });
});

describe('GET /api/soc/search', () => {
  it('finds users, incidents and IPs; ignores too-short queries', async () => {
    const admin = await makeUser('extras-search');
    await SecurityIncident.create({ type: 'brute_force', severity: 'low', title: 'Zebra-crossing probe', relatedIp: '198.51.100.99' });

    const short = await request(app).get('/api/soc/search?q=z').set(auth(admin.token));
    expect(short.body).toEqual({ users: [], ips: [], incidents: [], uploads: [] });

    const byTitle = await request(app).get('/api/soc/search?q=zebra').set(auth(admin.token));
    expect(byTitle.body.incidents.some((i) => i.title === 'Zebra-crossing probe')).toBe(true);

    const byUser = await request(app).get(`/api/soc/search?q=${encodeURIComponent(admin.email.slice(0, 14))}`).set(auth(admin.token));
    expect(byUser.body.users.some((u) => u.email === admin.email)).toBe(true);

    const byIp = await request(app).get('/api/soc/search?q=198.51.100.99').set(auth(admin.token));
    expect(byIp.body.ips[0].ip).toBe('198.51.100.99');
    expect(byIp.body.incidents.some((i) => i.title === 'Zebra-crossing probe')).toBe(true);
  });
});

describe('PATCH /api/soc/incidents/bulk and enriched audit trail', () => {
  it('bulk-updates, reports failures, and the audit trail resolves names', async () => {
    const admin = await makeUser('extras-bulk');
    const [x, y] = await SecurityIncident.create([
      { type: 'brute_force', severity: 'low', title: 'Bulk X' },
      { type: 'brute_force', severity: 'low', title: 'Bulk Y' },
    ]);
    const bad = String(oid());
    const res = await request(app).patch('/api/soc/incidents/bulk').set(auth(admin.token))
      .send({ ids: [String(x._id), String(y._id), bad, 'junk'], status: 'false_positive', resolutionReason: 'testing' });
    expect(res.status).toBe(200);
    expect(res.body.updated.sort()).toEqual([String(x._id), String(y._id)].sort());
    expect(res.body.failed.length).toBe(2);
    expect((await SecurityIncident.findById(x._id)).status).toBe('false_positive');

    expect((await request(app).patch('/api/soc/incidents/bulk').set(auth(admin.token)).send({ ids: [], status: 'resolved' })).status).toBe(400);
    expect((await request(app).patch('/api/soc/incidents/bulk').set(auth(admin.token)).send({ ids: [String(x._id)] })).status).toBe(400);

    const student = await makeUser('extras-bulk-student', 'student');
    expect((await request(app).patch('/api/soc/incidents/bulk').set(auth(student.token)).send({ ids: [String(x._id)], status: 'open' })).status).toBe(403);

    const trail = await request(app).get('/api/soc/audit-trail?limit=50').set(auth(admin.token));
    const row = trail.body.actions.find((a) => a.targetType === 'incident' && String(a.targetId) === String(x._id));
    expect(row).toBeTruthy();
    expect(row.targetLabel).toBe('Bulk X');
    expect(row.analystName).toBe('Test Person');
  });
});
