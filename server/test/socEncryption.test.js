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
    await BlockedIp.init(); // the unique index must be built before duplicates are expected to fail
    await BlockedIp.deleteMany({ ip: '198.51.100.9' });
    await BlockedIp.create({ ip: '198.51.100.9', reason: 'testing' });
    await expect(BlockedIp.create({ ip: '198.51.100.9' })).rejects.toThrow();
    await BlockedIp.updateOne({ ip: '198.51.100.9' }, { reason: 'updated' });
    const raw = await BlockedIp.collection.findOne({ ip: encrypt('198.51.100.9') });
    expect(raw.reason).toMatch(/^enc:v1:/);
    expect((await BlockedIp.findOne({ ip: '198.51.100.9' }).lean()).reason).toBe('updated');
  });
});

describe('hardening regressions', () => {
  it('a user-supplied string that starts with the ciphertext prefix is still encrypted and reads back intact', async () => {
    const spoof = 'enc:v1:not-really-ciphertext';
    const created = await SecurityEvent.create({ type: 'login_failure', email: spoof, ip: '203.0.113.88', userAgent: spoof, message: 'spoof' });
    const raw = await SecurityEvent.collection.findOne({ _id: created._id });
    expect(raw.userAgent).not.toBe(spoof); // stored encrypted, not in the clear
    expect(decrypt(raw.userAgent)).toBe(spoof);
    expect((await SecurityEvent.findById(created._id).lean()).userAgent).toBe(spoof); // not blanked
  });

  it('reading a document does not mark its arrays modified (a later save() must not rewrite them)', async () => {
    const PiiAccessLog = require('../models/PiiAccessLog');
    const doc = await PiiAccessLog.create({
      accessorId: new (require('mongoose').Types.ObjectId)(), accessorEmail: 'a@x.test', applicantId: new (require('mongoose').Types.ObjectId)(),
      applicantEmail: 'b@x.test', fieldsAccessed: ['passportNumber', 'phone'], ip: '203.0.113.5',
    });
    const loaded = await PiiAccessLog.findById(doc._id);
    expect(loaded.modifiedPaths()).toEqual([]);
  });

  it('refuses to encrypt without a key outside development/test', () => {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, ['-e', "require('./lib/fieldCrypto').encrypt('x')"], {
      cwd: require('path').join(__dirname, '..'), env: { PATH: process.env.PATH, NODE_ENV: 'staging', JWT_SECRET: 'x' }, encoding: 'utf8',
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/DATA_ENCRYPTION_KEY is required/);
  });

  it('ignores @domain owner entries in production', () => {
    const { spawnSync } = require('child_process');
    const code = "process.stdout.write(String(require('./lib/socOwners').isSocOwnerEmail('anyone@example.com')))";
    const run = (nodeEnv) => spawnSync(process.execPath, ['-e', code], {
      cwd: require('path').join(__dirname, '..'), env: { PATH: process.env.PATH, NODE_ENV: nodeEnv, SOC_OWNER_EMAILS: '@example.com' }, encoding: 'utf8',
    }).stdout;
    expect(run('test')).toBe('true');
    expect(run('production')).toBe('false');
  });
});

describe('incident notes are encrypted too', () => {
  it('stores note text and author as ciphertext, reads them back, and survives a second save', async () => {
    const SecurityIncident = require('../models/SecurityIncident');
    const inc = await SecurityIncident.create({ type: 'manual', title: 'note encryption test', severity: 'low' });
    const doc = await SecurityIncident.findById(inc._id);
    doc.notes.push({ author: 'Analyst A', authorRole: 'admin', text: 'called the student at +91 98765 43210' });
    await doc.save();
    expect(doc.notes[0].text).toBe('called the student at +91 98765 43210'); // plaintext restored on the saved doc

    const raw = await SecurityIncident.collection.findOne({ _id: inc._id });
    expect(raw.notes[0].text).toMatch(/^enc:v1:/);
    expect(raw.notes[0].author).toMatch(/^enc:v1:/);
    expect(JSON.stringify(raw)).not.toContain('98765');

    const again = await SecurityIncident.findById(inc._id);
    again.notes.push({ author: 'Analyst B', authorRole: 'admin', text: 'second note' });
    await again.save();
    const lean = await SecurityIncident.findById(inc._id).lean();
    expect(lean.notes.map((n) => n.text)).toEqual(['called the student at +91 98765 43210', 'second note']);
    const raw2 = await SecurityIncident.collection.findOne({ _id: inc._id });
    expect(raw2.notes.every((n) => /^enc:v1:/.test(n.text))).toBe(true);
    await SecurityIncident.deleteOne({ _id: inc._id });
  });
});

describe('search tells the caller when it looked at a capped window', () => {
  it('reports truncated:false for a small data set', async () => {
    const owner = await loginAdmin('example.com');
    const res = await request(app).get('/api/soc/incidents?q=zzz-no-such-thing').set('Authorization', `Bearer ${owner}`);
    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(false);
    const ev = await request(app).get('/api/soc/events?q=zzz-no-such-thing').set('Authorization', `Bearer ${owner}`);
    expect(ev.body.truncated).toBe(false);
  });
});

describe('migration script: values written under a legacy key', () => {
  const crypto = require('crypto');
  const { collect, legacyKeys } = require('../scripts/encryptSocData');
  const { deriveEncKey } = require('../lib/fieldCrypto');
  // Encrypts with an arbitrary master key, the way a server without DATA_ENCRYPTION_KEY used to.
  const encryptUnder = (plain, masterHex) => {
    const enc = deriveEncKey(masterHex);
    const siv = crypto.createHmac('sha256', Buffer.from(masterHex, 'hex')).update('siv').digest();
    const iv = crypto.createHmac('sha256', siv).update(plain, 'utf8').digest().subarray(0, 12);
    const c = crypto.createCipheriv('aes-256-gcm', enc, iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return 'enc:v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
  };
  const legacyMaster = crypto.createHash('sha256').update(`dev-only:${process.env.JWT_SECRET}`).digest('hex');
  const run = (doc, path) => { const out = {}; collect(doc, path.split('.'), '', out, legacyKeys()); return out; };

  it('re-encrypts legacy-key ciphertext from its plaintext instead of wrapping it', () => {
    const legacy = encryptUnder('203.0.113.9', legacyMaster);
    const out = run({ ip: legacy }, 'ip');
    expect(decrypt(out.ip)).toBe('203.0.113.9'); // one layer, readable with the current key
  });

  it('unwraps a value that was already wrapped once, and leaves a correct value alone', () => {
    const wrapped = encrypt(encryptUnder('a@b.test', legacyMaster));
    expect(decrypt(run({ email: wrapped }, 'email').email)).toBe('a@b.test');
    expect(run({ email: encrypt('a@b.test') }, 'email')).toEqual({}); // already correct: no write
  });

  it('encrypts plaintext, and reaches fields inside arrays', () => {
    const out = run({ notes: [{ text: 'one' }, { text: encrypt('two') }] }, 'notes.text');
    expect(Object.keys(out)).toEqual(['notes.0.text']);
    expect(decrypt(out['notes.0.text'])).toBe('one');
  });
});
