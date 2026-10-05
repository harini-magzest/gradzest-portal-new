const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');

async function makeAdmin(emailPrefix) {
  const email = `${emailPrefix}-${Date.now()}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'Test Admin', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role: 'admin' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return login.body.token;
}

describe('GET /api/soc/posture — dynamic code analysis', () => {
  it('rejects without an admin token', async () => {
    const res = await request(app).get('/api/soc/posture');
    expect(res.status).toBe(401);
  });

  it('returns real, code-derived data — not a hardcoded claim', async () => {
    const token = await makeAdmin('posture-admin');
    const res = await request(app).get('/api/soc/posture?refresh=1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    // activeFeatures: populated by real app.js execution at boot, not a static list.
    expect(Array.isArray(res.body.activeFeatures)).toBe(true);
    expect(res.body.activeFeatures.length).toBeGreaterThan(0);
    expect(res.body.activeFeatures.some((f) => f.name === 'helmet')).toBe(true);

    // codeAnalysis: real grep results against the actual source tree.
    expect(res.body.codeAnalysis).toBeTruthy();
    expect(Array.isArray(res.body.codeAnalysis.featureFileUsage)).toBe(true);
    const wafFeature = res.body.codeAnalysis.featureFileUsage.find((f) => f.key === 'waf');
    expect(wafFeature.fileCount).toBeGreaterThan(0);

    expect(Array.isArray(res.body.codeAnalysis.piiFileUsage)).toBe(true);
    const userModelPii = res.body.codeAnalysis.piiFileUsage.find((p) => p.file.includes('models/User.js'));
    expect(userModelPii).toBeTruthy();
    expect(userModelPii.fields).toContain('passportNumber');

    // The scanner must not flag its own pattern-definition source as a finding
    // (regression test for the self-match bug found and fixed this session).
    const selfFlags = res.body.codeAnalysis.codeFlags.filter((f) => f.file.includes('lib/codeScan.js'));
    expect(selfFlags.length).toBe(0);
  }, 90000); // refresh=1 runs a real `npm audit` plus a source scan; under load that exceeds the 20s default

  it('still returns dependency audit data alongside the new sections', async () => {
    const token = await makeAdmin('posture-admin2');
    const res = await request(app).get('/api/soc/posture').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.dependencyAudit).toBeTruthy();
    expect(res.body.knownGaps.length).toBeGreaterThan(0);
  });
});

describe('GET /api/soc/posture/checklist-pdf', () => {
  it('rejects without an admin token', async () => {
    const res = await request(app).get('/api/soc/posture/checklist-pdf');
    expect(res.status).toBe(401);
  });

  it('returns a real PDF document', async () => {
    const token = await makeAdmin('pdf-admin');
    const res = await request(app).get('/api/soc/posture/checklist-pdf').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.length).toBeGreaterThan(500); // a real generated PDF, not an empty stub
    // PDF magic bytes
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });
});
