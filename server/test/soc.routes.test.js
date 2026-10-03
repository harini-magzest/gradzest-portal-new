const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const BlockedIp = require('../models/BlockedIp');
const AnalystAction = require('../models/AnalystAction');
const PiiAccessLog = require('../models/PiiAccessLog');
const SecurityIncident = require('../models/SecurityIncident');
const { waitUntil } = require('./helpers');

async function makeAdmin(emailPrefix) {
  const email = `${emailPrefix}-${Date.now()}@example.com`;
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Test Admin', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role: 'admin' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: login.body.token, email, userId: login.body.user.id };
}

async function makeStudent(emailPrefix) {
  const email = `${emailPrefix}-${Date.now()}@example.com`;
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Test Student', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true });
  return { userId: reg.body.user.id, email };
}

describe('SOC routes — auth gating', () => {
  it('rejects every /api/soc route without a token', async () => {
    const res = await request(app).get('/api/soc/stats');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin (student) token with 403', async () => {
    const { email } = await makeStudent('soc-student');
    const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
    const res = await request(app).get('/api/soc/stats').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });

  it('allows an admin token through', async () => {
    const { token } = await makeAdmin('soc-admin');
    const res = await request(app).get('/api/soc/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('failedLogins');
  });
});

describe('SOC routes — blocked IPs actually block requests and are audited', () => {
  it('blocking an IP via the API rejects subsequent requests from it, and logs a real AnalystAction', async () => {
    const { token, email } = await makeAdmin('soc-blocker');
    const testIp = '192.0.2.55'; // TEST-NET-1, reserved for documentation/testing

    const before = await AnalystAction.countDocuments({ action: 'block_ip', targetId: testIp });

    const blockRes = await request(app).post('/api/soc/blocked-ips')
      .set('Authorization', `Bearer ${token}`)
      .send({ ip: testIp, reason: 'automated test' });
    expect(blockRes.status).toBe(200);

    const stored = await BlockedIp.findOne({ ip: testIp });
    expect(stored).toBeTruthy();

    // logAnalystAction is fire-and-forget and chain-queued (hash-chain
    // integrity serializes writes process-wide), so its completion time isn't
    // fixed — poll instead of assuming it landed by the time this line runs.
    const after = await waitUntil(async () => {
      const count = await AnalystAction.countDocuments({ action: 'block_ip', targetId: testIp });
      return count === before + 1 ? count : null;
    });
    expect(after).toBe(before + 1);

    // Clean up — unblock so it doesn't leak into other tests/real blocklist state.
    const unblockRes = await request(app).delete(`/api/soc/blocked-ips/${testIp}`)
      .set('Authorization', `Bearer ${token}`);
    expect(unblockRes.status).toBe(200);
    expect(await BlockedIp.findOne({ ip: testIp })).toBeNull();
  });
});

describe('PII access logging — real endpoint, real log entries', () => {
  it('viewing a student profile as a counselor creates a real PiiAccessLog entry with the right fields', async () => {
    const student = await makeStudent('pii-target');
    await User.findOneAndUpdate({ _id: student.userId }, { passport: { number: 'X1234567' }, address: { city: 'Testville' } });

    const counselorEmail = `pii-counselor-${Date.now()}@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'Test Counselor', email: counselorEmail, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email: counselorEmail }, { emailVerified: true, role: 'counselor' });
    const login = await request(app).post('/api/auth/login').send({ email: counselorEmail, password: 'TestPass123!' });

    const res = await request(app).get(`/api/students/${student.userId}`)
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);

    // logPiiAccess is fire-and-forget: poll for the row rather than sleeping a fixed time.
    const logEntry = await waitUntil(() => PiiAccessLog.findOne({ applicantId: student.userId, accessorEmail: counselorEmail }));
    expect(logEntry).toBeTruthy();
    expect(logEntry.fieldsAccessed).toEqual(expect.arrayContaining(['passport', 'address']));
    expect(logEntry.accessType).toBe('view');
  });
});

describe('Investigate — surfaces related incidents so an analyst doesn\'t have to cross-check the Incidents tab separately', () => {
  it('GET /investigate/user/:id includes open incidents tied to that user', async () => {
    const { token } = await makeAdmin('investigate-admin');
    const target = await makeStudent('investigate-target');

    const incident = await SecurityIncident.create({
      type: 'manual', severity: 'high', title: 'Test incident for investigate cross-link',
      relatedUserId: target.userId, relatedEmail: target.email,
    });

    const res = await request(app).get(`/api/soc/investigate/user/${target.userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.relatedIncidents).toBeInstanceOf(Array);
    expect(res.body.relatedIncidents.some((i) => String(i._id) === String(incident._id))).toBe(true);

    await SecurityIncident.deleteOne({ _id: incident._id });
  });

  it('GET /investigate/ip/:ip includes incidents tied to that IP', async () => {
    const { token } = await makeAdmin('investigate-admin-ip');
    const testIp = '192.0.2.77'; // TEST-NET-1, reserved for documentation/testing

    const incident = await SecurityIncident.create({
      type: 'manual', severity: 'medium', title: 'Test incident for IP investigate cross-link', relatedIp: testIp,
    });

    const res = await request(app).get(`/api/soc/investigate/ip/${testIp}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.relatedIncidents).toBeInstanceOf(Array);
    expect(res.body.relatedIncidents.some((i) => String(i._id) === String(incident._id))).toBe(true);

    await SecurityIncident.deleteOne({ _id: incident._id });
  });
});

describe('Incident assignment — the assignee picker in the UI needs a real, populated name back', () => {
  it('GET /analysts lists admin accounts an incident can be assigned to', async () => {
    const { token, email } = await makeAdmin('analyst-list-admin');
    const res = await request(app).get('/api/soc/analysts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.analysts).toBeInstanceOf(Array);
    expect(res.body.analysts.some((a) => a.email === email)).toBe(true);
  });

  it('PATCH /incidents/:id with assignedTo returns the assignee populated (name/email), not just a bare id', async () => {
    const { token } = await makeAdmin('assign-admin-actor');
    const { userId: targetId, email: targetEmail } = await makeAdmin('assign-admin-target');

    const incident = await SecurityIncident.create({ type: 'manual', severity: 'low', title: 'Assignment test incident' });

    const res = await request(app).patch(`/api/soc/incidents/${incident._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedTo: targetId });
    expect(res.status).toBe(200);
    expect(res.body.assignedTo).toBeTruthy();
    expect(res.body.assignedTo.email).toBe(targetEmail);

    // logAnalystAction is fire-and-forget: poll for the audit row rather than sleeping.
    const after = await waitUntil(() => AnalystAction.findOne({ action: 'incident_assigned', targetId: incident._id }).sort({ createdAt: -1 }));
    expect(after).toBeTruthy();

    await SecurityIncident.deleteOne({ _id: incident._id });
  });
});

describe('Incidents pagination — GET /incidents supports skip so the list is not silently capped at 200', () => {
  it('returns a total count and respects skip/limit', async () => {
    const { token } = await makeAdmin('paginate-admin');
    const ip = `198.51.100.${Math.floor(Math.random() * 250)}`;
    const created = [];
    for (let i = 0; i < 3; i++) {
      created.push(await SecurityIncident.create({ type: 'manual', severity: 'low', status: 'open', title: `Pagination test ${i}`, relatedIp: ip }));
    }

    const ours = await request(app).get('/api/soc/incidents').query({ status: 'open', limit: 2, skip: 0 })
      .set('Authorization', `Bearer ${token}`);
    expect(ours.body.incidents.length).toBeLessThanOrEqual(2);
    expect(ours.body.total).toBeGreaterThanOrEqual(3);

    const nextPage = await request(app).get('/api/soc/incidents').query({ status: 'open', limit: 2, skip: 2 })
      .set('Authorization', `Bearer ${token}`);
    expect(nextPage.status).toBe(200);
    // No overlap between the two pages
    const firstIds = new Set(ours.body.incidents.map((i) => i._id));
    for (const inc of nextPage.body.incidents) expect(firstIds.has(inc._id)).toBe(false);

    await SecurityIncident.deleteMany({ _id: { $in: created.map((c) => c._id) } });
  });
});
