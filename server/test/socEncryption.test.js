const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const SecurityEvent = require('../models/SecurityEvent');
const BlockedIp = require('../models/BlockedIp');
const { encrypt, decrypt } = require('../lib/fieldCrypto');

let n = 0;
async function loginAdmin(domain) {
  const email = `enc-${Date.now()}-${n++}@${domain}`;
  await request(app).post('/api/auth/register').send({ name: 'Enc Admin', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role: 'admin' });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return res.body.token;
}

describe('SOC is owner-only', () => {
  it('lets a listed owner in and refuses another admin', async () => {
    const owner = await loginAdmin('example.com');
    const other = await loginAdmin('not-listed.test');
    const ok = await request(app).get('/api/soc/stats').set('Authorization', `Bearer ${owner}`);
    const denied = await request(app).get('/api/soc/stats').set('Authorization', `Bearer ${other}`);
    expect(ok.status).toBe(200);
    expect(denied.status).toBe(403);
  });
});

describe('SOC data is encrypted at rest', () => {
  it('round-trips and is deterministic, never storing plaintext', () => {
    const c = encrypt('victim@school.edu');
    expect(c).toMatch(/^enc:v1:/);
    expect(c).not.toContain('victim');
    expect(encrypt('victim@school.edu')).toBe(c);
    expect(decrypt(c)).toBe('victim@school.edu');
    expect(encrypt('')).toBe('');
    expect(decrypt('enc:v1:not-valid')).toBe('');
  });

  it('stores ciphertext in MongoDB but returns plaintext through the models, including exact-match queries', async () => {
    const email = `target-${Date.now()}@school.edu`;
    const ip = '203.0.113.77';
    const created = await SecurityEvent.create({ type: 'login_failure', email, ip, userAgent: 'UA-secret', message: `bad login for ${email}` });
    expect(created.email).toBe(email); // post-save restores plaintext for the caller

    const raw = await SecurityEvent.collection.findOne({ _id: created._id });
    for (const f of ['email', 'ip', 'userAgent', 'message']) expect(raw[f]).toMatch(/^enc:v1:/);
    expect(JSON.stringify(raw)).not.toContain('school.edu');
    expect(JSON.stringify(raw)).not.toContain('203.0.113.77');

    const hydrated = await SecurityEvent.findOne({ email });
    expect(hydrated.ip).toBe(ip);
    const lean = await SecurityEvent.find({ ip }).lean();
    expect(lean.some((e) => String(e._id) === String(created._id) && e.email === email)).toBe(true);
    expect(await SecurityEvent.distinct('ip', { email })).toEqual([ip]);
    const grouped = await SecurityEvent.aggregate([{ $match: { email: encrypt(email) } }, { $group: { _id: '$ip', count: { $sum: 1 } } }]);
    expect(grouped).toEqual([{ _id: ip, count: 1 }]);
  });

  it('keeps unique indexes and updates working on encrypted fields', async () => {
    await BlockedIp.deleteMany({ ip: '198.51.100.9' });
    await BlockedIp.create({ ip: '198.51.100.9', reason: 'testing' });
    await expect(BlockedIp.create({ ip: '198.51.100.9' })).rejects.toThrow();
    await BlockedIp.updateOne({ ip: '198.51.100.9' }, { reason: 'updated' });
    const raw = await BlockedIp.collection.findOne({ ip: encrypt('198.51.100.9') });
    expect(raw.reason).toMatch(/^enc:v1:/);
    expect((await BlockedIp.findOne({ ip: '198.51.100.9' }).lean()).reason).toBe('updated');
  });
});
