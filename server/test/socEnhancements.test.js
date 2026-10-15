const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const BlockedIp = require('../models/BlockedIp');
const AnalystAction = require('../models/AnalystAction');
const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const SuppressionRule = require('../models/SuppressionRule');
const detect = require('../lib/detectIncidents');
const { refreshSuppressions } = require('../lib/suppression');
const { logAnalystAction, verifyAuditChain } = require('../lib/logAnalystAction');
const { toCsv } = require('../lib/csv');
const { buildIpMatcher, parseIpEntry } = require('../lib/ipMatch');
const { computeSla } = require('../lib/sla');

let counter = 0;
const uniq = (p) => `${p}-${Date.now()}-${counter++}`;
const oid = () => new mongoose.Types.ObjectId();

async function makeAdmin(prefix) {
  const email = `${uniq(prefix)}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'Test Admin', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role: 'admin' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: login.body.token, email, userId: login.body.user.id };
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('helpers', () => {
  it('csv neutralises spreadsheet formulas and quotes special characters', () => {
    const out = toCsv([{ label: 'A', key: 'a' }, { label: 'B', key: 'b' }], [{ a: '=HYPERLINK("x")', b: 'one, "two"' }]);
    expect(out).toContain(`'=HYPERLINK`);
    expect(out).toContain('"one, ""two"""');
  });

  it('ip matcher handles single IPs, v4 CIDRs, v6, and mapped addresses', () => {
    const match = buildIpMatcher(['10.1.2.3', '203.0.113.0/24', '2001:db8::/32']);
    expect(match('10.1.2.3')).toBe(true);
    expect(match('::ffff:10.1.2.3')).toBe(true);
    expect(match('203.0.113.200')).toBe(true);
    expect(match('203.0.114.1')).toBe(false);
    expect(match('2001:db8::1')).toBe(true);
    expect(parseIpEntry('999.1.1.1').ok).toBe(false);
    expect(parseIpEntry('10.0.0.0/33').ok).toBe(false);
  });

  it('SLA: an untouched high incident past its ack target is breached; an acked one is not', () => {
    const createdAt = new Date(Date.now() - 2 * 3600 * 1000);
    expect(computeSla({ severity: 'high', status: 'open', createdAt }).ackBreached).toBe(true);
    const acked = { severity: 'high', status: 'investigating', createdAt, acknowledgedAt: new Date(createdAt.getTime() + 10 * 60000) };
    expect(computeSla(acked).ackBreached).toBe(false);
    expect(computeSla(acked).resolveBreached).toBe(false);
  });
});

describe('new detection rules', () => {
  it('credential stuffing: many different accounts from one IP opens one incident', async () => {
    const ip = '198.51.100.10';
    let last;
    for (let i = 0; i < 5; i++) {
      last = await SecurityEvent.create({ type: 'login_failure', ip, email: `victim${i}-${Date.now()}@example.com`, severity: 'low' });
      await detect.checkCredentialStuffingRule(last, null);
    }
    const incidents = await SecurityIncident.find({ type: 'credential_stuffing', relatedIp: ip });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].title).toContain('5 different accounts');
  });

  it('credential stuffing: repeated failures on ONE account do not trip it', async () => {
    const ip = '198.51.100.11';
    for (let i = 0; i < 8; i++) {
      const e = await SecurityEvent.create({ type: 'login_failure', ip, email: 'same@example.com' });
      await detect.checkCredentialStuffingRule(e, null);
    }
    expect(await SecurityIncident.countDocuments({ type: 'credential_stuffing', relatedIp: ip })).toBe(0);
  });

  it('suppression allowlist stops incidents for an allowlisted CIDR, and only for the listed types', async () => {
    const ip = '198.51.100.77';
    await SuppressionRule.create({ kind: 'ip', value: '198.51.100.0/24', incidentTypes: ['credential_stuffing'], reason: 'office' });
    await refreshSuppressions();
    for (let i = 0; i < 5; i++) {
      const e = await SecurityEvent.create({ type: 'login_failure', ip, email: `s${i}-${Date.now()}@example.com` });
      await detect.checkCredentialStuffingRule(e, null);
      await detect.checkLoginFailureRules(e, null); // brute_force is NOT in the rule's type list
    }
    expect(await SecurityIncident.countDocuments({ type: 'credential_stuffing', relatedIp: ip })).toBe(0);
    expect(await SecurityIncident.countDocuments({ type: 'brute_force', relatedIp: ip })).toBe(1);
    await SuppressionRule.deleteMany({ value: '198.51.100.0/24' });
    await refreshSuppressions();
  });

  it('password reset abuse: many requests for one account, and one IP fanning out across accounts', async () => {
    const email = `reset-victim-${Date.now()}@example.com`;
    for (let i = 0; i < 5; i++) {
      const e = await SecurityEvent.create({ type: 'password_reset_request', email, ip: `192.0.2.${100 + i}` });
      await detect.checkPasswordResetAbuseRule(e, null);
    }
    expect(await SecurityIncident.countDocuments({ type: 'password_reset_abuse', relatedEmail: email })).toBe(1);

    const ip = '192.0.2.200';
    for (let i = 0; i < 5; i++) {
      const e = await SecurityEvent.create({ type: 'password_reset_request', email: `fan${i}-${Date.now()}@example.com`, ip });
      await detect.checkPasswordResetAbuseRule(e, null);
    }
    expect(await SecurityIncident.countDocuments({ type: 'password_reset_abuse', relatedIp: ip })).toBe(1);
  });

  it('privilege change: every grant is an incident', async () => {
    const e = await SecurityEvent.create({ type: 'privilege_change', email: 'boss@example.com', ip: '192.0.2.50', message: 'Admin-role account created for x@y.z', severity: 'high' });
    await detect.checkPrivilegeChangeRule(e, null);
    const inc = await SecurityIncident.findOne({ type: 'privilege_escalation', relatedEmail: 'boss@example.com' });
    expect(inc).toBeTruthy();
    expect(inc.severity).toBe('high');
  });

  it('mass export: five exports by one account in an hour opens one incident; fewer do not', async () => {
    const userId = oid();
    const email = `exp-${userId}@example.com`;
    for (let i = 0; i < 4; i++) {
      await detect.checkMassExportRule(await SecurityEvent.create({ type: 'data_export', userId, email, ip: '192.0.2.80' }), null);
    }
    expect(await SecurityIncident.countDocuments({ type: 'mass_export', relatedUserId: userId })).toBe(0);
    await detect.checkMassExportRule(await SecurityEvent.create({ type: 'data_export', userId, email, ip: '192.0.2.80' }), null);
    await detect.checkMassExportRule(await SecurityEvent.create({ type: 'data_export', userId, email, ip: '192.0.2.80' }), null);
    expect(await SecurityIncident.countDocuments({ type: 'mass_export', relatedUserId: userId })).toBe(1);
  });

  it('CSV export routes log a data_export event', async () => {
    const { token, userId } = await makeAdmin('export-log');
    await request(app).get('/api/soc/events/export.csv').set(auth(token));
    await wait(300);
    const ev = await SecurityEvent.findOne({ type: 'data_export', userId }).lean();
    expect(ev).toBeTruthy();
    expect(ev.meta.export).toBe('events');
  });

  it('off-hours admin: flags a 03:30 IST login, ignores a 17:30 IST login and non-admins', async () => {
    const userId = oid();
    const at = (iso) => ({ type: 'login_success', role: 'admin', userId, email: `oh-${userId}@example.com`, ip: '192.0.2.60', createdAt: new Date(iso) });
    await detect.checkOffHoursAdminRule(at('2026-03-10T12:00:00Z'), null);        // 17:30 IST
    expect(await SecurityIncident.countDocuments({ type: 'off_hours_admin', relatedUserId: userId })).toBe(0);
    await detect.checkOffHoursAdminRule({ ...at('2026-03-10T22:00:00Z'), role: 'student' }, null);
    expect(await SecurityIncident.countDocuments({ type: 'off_hours_admin', relatedUserId: userId })).toBe(0);
    await detect.checkOffHoursAdminRule(at('2026-03-10T22:00:00Z'), null);        // 03:30 IST
    expect(await SecurityIncident.countDocuments({ type: 'off_hours_admin', relatedUserId: userId })).toBe(1);
  });

  it('new device: needs a baseline, then flags an unseen user agent once', async () => {
    const userId = oid();
    const email = `nd-${userId}@example.com`;
    const login = (ua, minutesAgo) => SecurityEvent.create({
      type: 'login_success', role: 'admin', userId, email, ip: '192.0.2.70', userAgent: ua,
      createdAt: new Date(Date.now() - minutesAgo * 60000),
    });
    const first = await login('Chrome/1', 60);
    await detect.checkNewDevicePrivilegedRule(first, null); // first-ever login: no baseline, no incident
    expect(await SecurityIncident.countDocuments({ type: 'new_device_privileged', relatedUserId: userId })).toBe(0);
    const same = await login('Chrome/1', 30);
    await detect.checkNewDevicePrivilegedRule(same, null);
    expect(await SecurityIncident.countDocuments({ type: 'new_device_privileged', relatedUserId: userId })).toBe(0);
    const other = await login('Firefox/9', 1);
    await detect.checkNewDevicePrivilegedRule(other, null);
    expect(await SecurityIncident.countDocuments({ type: 'new_device_privileged', relatedUserId: userId })).toBe(1);
  });
});

describe('audit trail hash chain', () => {
  it('verifies an untouched chain and pinpoints a tampered row', async () => {
    const analyst = { id: oid(), email: 'chain@example.com' };
    await logAnalystAction({ analyst, action: 'block_ip', targetType: 'ip', targetId: '203.0.113.1', reason: 'one' });
    await logAnalystAction({ analyst, action: 'unblock_ip', targetType: 'ip', targetId: '203.0.113.1', reason: 'two' });
    await logAnalystAction({ analyst, action: 'block_ip', targetType: 'ip', targetId: '203.0.113.2', reason: 'three' });
    const clean = await verifyAuditChain();
    expect(clean.ok).toBe(true);
    expect(clean.checked).toBeGreaterThanOrEqual(3);

    const victim = await AnalystAction.findOne({ reason: 'two' });
    await AnalystAction.collection.updateOne({ _id: victim._id }, { $set: { reason: 'rewritten' } });
    const broken = await verifyAuditChain();
    expect(broken.ok).toBe(false);
    expect(String(broken.brokenAt.id)).toBe(String(victim._id));

    await AnalystAction.collection.updateOne({ _id: victim._id }, { $set: { reason: 'two' } });
    expect((await verifyAuditChain()).ok).toBe(true);
  });
});

describe('SOC API additions', () => {
  it('incident lifecycle: assign/investigate acknowledges, resolve records outcome, reopen clears it', async () => {
    const { token } = await makeAdmin('lifecycle');
    const inc = await SecurityIncident.create({ type: 'manual', severity: 'high', title: 'lifecycle' });

    let res = await request(app).patch(`/api/soc/incidents/${inc._id}`).set(auth(token)).send({ status: 'investigating' });
    expect(res.status).toBe(200);
    expect(res.body.acknowledgedAt).toBeTruthy();

    res = await request(app).patch(`/api/soc/incidents/${inc._id}`).set(auth(token))
      .send({ status: 'false_positive', resolutionReason: 'benign_activity', resolutionComment: 'QA scanner' });
    expect(res.body.resolvedAt).toBeTruthy();
    expect(res.body.resolutionReason).toBe('benign_activity');

    res = await request(app).patch(`/api/soc/incidents/${inc._id}`).set(auth(token)).send({ status: 'open' });
    expect(res.body.resolvedAt).toBeNull();
    expect(res.body.resolutionReason).toBe('');

    res = await request(app).patch(`/api/soc/incidents/${inc._id}`).set(auth(token)).send({ status: 'bogus' });
    expect(res.status).toBe(400);
    await SecurityIncident.deleteOne({ _id: inc._id });
  });

  it('a note acknowledges an untouched incident', async () => {
    const { token } = await makeAdmin('note-ack');
    const inc = await SecurityIncident.create({ type: 'manual', severity: 'low', title: 'note ack' });
    const res = await request(app).post(`/api/soc/incidents/${inc._id}/notes`).set(auth(token)).send({ text: 'looking' });
    expect(res.body.acknowledgedAt).toBeTruthy();
    await SecurityIncident.deleteOne({ _id: inc._id });
  });

  it('GET /incidents returns the SLA policy and supports search + type filters', async () => {
    const { token } = await makeAdmin('inc-search');
    const marker = uniq('needle');
    const inc = await SecurityIncident.create({ type: 'manual', severity: 'low', title: `Find ${marker}`, relatedIp: '203.0.113.99' });
    let res = await request(app).get(`/api/soc/incidents?q=${marker}`).set(auth(token));
    expect(res.body.incidents.map((i) => String(i._id))).toEqual([String(inc._id)]);
    expect(res.body.slaPolicy.critical.ackMinutes).toBe(15);
    res = await request(app).get(`/api/soc/incidents?q=${marker}&type=brute_force`).set(auth(token));
    expect(res.body.incidents).toHaveLength(0);
    await SecurityIncident.deleteOne({ _id: inc._id });
  });

  it('CSV exports work and are admin-only', async () => {
    const { token } = await makeAdmin('csv');
    const inc = await SecurityIncident.create({ type: 'manual', severity: 'low', title: '=cmd|evil' });
    let res = await request(app).get('/api/soc/incidents/export.csv').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`'=cmd|evil`);
    res = await request(app).get('/api/soc/events/export.csv').set(auth(token));
    expect(res.status).toBe(200);
    res = await request(app).get('/api/soc/audit-trail/export.csv').set(auth(token));
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/soc/incidents/export.csv')).status).toBe(401);
    await SecurityIncident.deleteOne({ _id: inc._id });
  });

  it('incident PDF report renders', async () => {
    const { token } = await makeAdmin('pdf');
    const inc = await SecurityIncident.create({ type: 'manual', severity: 'low', title: 'pdf me' });
    const res = await request(app).get(`/api/soc/incidents/${inc._id}/report.pdf`).set(auth(token)).buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
    await SecurityIncident.deleteOne({ _id: inc._id });
  });

  it('stats include comparison, response-time and backlog fields', async () => {
    const { token } = await makeAdmin('stats');
    const res = await request(app).get('/api/soc/stats?period=7d').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.previous).toHaveProperty('failedLogins');
    expect(res.body).toHaveProperty('openByAge');
    expect(res.body).toHaveProperty('slaBreached');
    expect(res.body.ruleEffectiveness).toBeInstanceOf(Array);
    expect(res.body.targetedAccounts).toBeInstanceOf(Array);
  });

  it('bulk block: accepts IPs and CIDRs, rejects junk, unsafe ranges and your own address; supports expiry', async () => {
    const { token } = await makeAdmin('bulk');
    const res = await request(app).post('/api/soc/blocked-ips/bulk').set(auth(token)).send({
      ips: ['203.0.113.0/28', '203.0.113.99', 'not-an-ip', '10.0.0.0/4', '127.0.0.1'], reason: 'test', expiresInHours: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.blocked.sort()).toEqual(['203.0.113.0/28', '203.0.113.99']);
    expect(res.body.rejected.map((r) => r.ip).sort()).toEqual(['10.0.0.0/4', '127.0.0.1', 'not-an-ip']);
    const row = await BlockedIp.findOne({ ip: '203.0.113.0/28' });
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const single = await request(app).post('/api/soc/blocked-ips').set(auth(token)).send({ ip: '127.0.0.0/24' });
    expect(single.status).toBe(400);
    await BlockedIp.deleteMany({ ip: { $in: ['203.0.113.0/28', '203.0.113.99'] } });
  });

  it('a blocked CIDR really blocks requests from inside it via the middleware matcher', async () => {
    const { ipBlockMiddleware, refreshBlockedIps } = require('../middleware/ipBlock');
    await BlockedIp.create({ ip: '198.18.0.0/15', reason: 'cidr test' });
    await BlockedIp.create({ ip: '198.51.100.240', reason: 'expired', expiresAt: new Date(Date.now() - 1000) });
    await refreshBlockedIps();
    const run = (ip) => new Promise((resolve) => {
      const res = { status: (c) => ({ json: () => resolve(c) }) };
      ipBlockMiddleware({ ip }, res, () => resolve(200));
    });
    expect(await run('198.19.5.5')).toBe(403);
    expect(await run('198.20.0.1')).toBe(200);
    expect(await run('198.51.100.240')).toBe(200); // expired temporary block no longer applies
    await BlockedIp.deleteMany({ ip: { $in: ['198.18.0.0/15', '198.51.100.240'] } });
    await refreshBlockedIps();
  });

  it('suppression CRUD validates input and is audited', async () => {
    const { token } = await makeAdmin('supp');
    let res = await request(app).post('/api/soc/suppressions').set(auth(token)).send({ kind: 'ip', value: 'garbage' });
    expect(res.status).toBe(400);
    res = await request(app).post('/api/soc/suppressions').set(auth(token)).send({ kind: 'ip', value: '203.0.113.0/24', incidentTypes: ['waf_block'], reason: 'pentest' });
    expect(res.status).toBe(201);
    const list = await request(app).get('/api/soc/suppressions').set(auth(token));
    expect(list.body.suppressions.some((s) => s.value === '203.0.113.0/24')).toBe(true);
    await wait(200);
    expect(await AnalystAction.findOne({ action: 'add_suppression', targetId: res.body._id })).toBeTruthy();
    const del = await request(app).delete(`/api/soc/suppressions/${res.body._id}`).set(auth(token));
    expect(del.status).toBe(200);
  });

  it('investigate: lists sessions without token hashes, revokes exactly one, and merges PII/analyst/incident rows into the timeline', async () => {
    const { token } = await makeAdmin('inv-actor');
    const email = `${uniq('inv-target')}@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'Target', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true });
    const l1 = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' }).set('User-Agent', 'Device-A');
    await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' }).set('User-Agent', 'Device-B');
    const userId = l1.body.user.id;
    await SecurityIncident.create({ type: 'manual', severity: 'low', title: 'about target', relatedUserId: userId });

    let res = await request(app).get(`/api/soc/investigate/user/${userId}`).set(auth(token));
    const startCount = res.body.sessions.length; // register + two logins
    expect(startCount).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(res.body.sessions)).not.toContain('tokenHash');
    expect(res.body.timeline.some((t) => t.source === 'incident')).toBe(true);

    const del = await request(app).delete(`/api/soc/investigate/user/${userId}/sessions/${res.body.sessions[0].id}`).set(auth(token));
    expect(del.status).toBe(200);
    expect(del.body.activeSessions).toBe(startCount - 1);
    res = await request(app).get(`/api/soc/investigate/user/${userId}`).set(auth(token));
    expect(res.body.sessions).toHaveLength(startCount - 1);
    await wait(200);
    expect(await AnalystAction.findOne({ action: 'revoke_session' }).sort({ createdAt: -1 })).toBeTruthy();
  });

  it('force password reset: old password stops working, sessions gone, refuses self-targeting', async () => {
    const { token, userId: selfId } = await makeAdmin('force-actor');
    const email = `${uniq('force-target')}@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'Target', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true });
    const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
    const userId = login.body.user.id;

    expect((await request(app).post(`/api/soc/investigate/user/${selfId}/force-password-reset`).set(auth(token))).status).toBe(400);

    const res = await request(app).post(`/api/soc/investigate/user/${userId}/force-password-reset`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('emailSent');
    const after = await User.findById(userId);
    expect(after.sessions).toHaveLength(0);
    expect(after.resetPasswordToken).toBeTruthy();
    expect((await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' })).status).toBe(401);
  });

  it('audit-trail verify endpoint reports the chain state', async () => {
    const { token } = await makeAdmin('verify');
    const res = await request(app).get('/api/soc/audit-trail/verify').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('checked');
  });
});

describe('auth hooks feeding the rules', () => {
  it('login for an unknown account is now logged; forgot-password logs a request event even for unknown emails', async () => {
    const ghost = `ghost-${Date.now()}@example.com`;
    await request(app).post('/api/auth/login').send({ email: ghost, password: 'whatever1!' });
    await request(app).post('/api/auth/forgot-password').send({ email: ghost });
    await wait(300);
    expect(await SecurityEvent.findOne({ type: 'login_failure', email: ghost })).toBeTruthy();
    expect(await SecurityEvent.findOne({ type: 'password_reset_request', email: ghost })).toBeTruthy();
  });
});
