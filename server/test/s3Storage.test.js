// S3 storage keeps files private: records store /uploads/<name>, never a bucket URL, and /uploads streams the object
// only after the same signed-link and per-file checks as a file on disk (lib/uploadToS3.js, app.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { execFile } = require('child_process');
const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const UploadRecord = require('../models/UploadRecord');
const { signedUploadPath, LINK_TTL_MS } = require('../lib/fileLinks');
const s3 = require('../lib/uploadToS3');
const { uploadToS3IfConfigured } = require('../middleware/uploadToS3IfConfigured');
const { deleteStoredFile } = require('../lib/storedFile');
const { migrateS3Urls } = require('../scripts/migrateS3Urls');

// An in-memory bucket that records every command it receives
const objects = new Map();
const commands = [];
const fakeS3 = {
  async send(command) {
    const name = command.constructor.name;
    const { Key, Body, ContentType } = command.input;
    commands.push({ name, input: command.input });
    const missing = () => Object.assign(new Error('not found'), { name: name === 'HeadObjectCommand' ? 'NotFound' : 'NoSuchKey' });
    if (name === 'PutObjectCommand') { objects.set(Key, { body: Buffer.from(Body), type: ContentType }); return {}; }
    if (name === 'DeleteObjectCommand') { objects.delete(Key); return {}; }
    const object = objects.get(Key);
    if (!object) throw missing();
    if (name === 'HeadObjectCommand') return {};
    return { Body: Readable.from([object.body]), ContentType: object.type, ContentLength: object.body.length };
  },
};

const env = { AWS_REGION: process.env.AWS_REGION, AWS_S3_BUCKET: process.env.AWS_S3_BUCKET };
beforeAll(() => {
  process.env.AWS_REGION = 'ap-south-1';
  process.env.AWS_S3_BUCKET = 'gradzest-test-bucket';
  s3._setClientForTests(fakeS3);
});
afterAll(() => {
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  s3._setClientForTests(null);
});
beforeEach(() => { commands.length = 0; });

let n = 0;
async function signedIn(role) {
  const email = `s3-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `S3 ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { id: String(res.body.user.id), token: res.body.token };
}
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const storedName = () => `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.pdf`;

// A student's document that exists only in the bucket, as an upload with S3 on leaves it
async function documentInS3(owner, content) {
  const name = storedName();
  objects.set(s3.s3KeyFor(name), { body: Buffer.from(content), type: 'application/pdf' });
  await UploadRecord.create({ storedName: name, userId: owner.id, sha256: crypto.createHash('sha256').update(content).digest('hex') });
  await User.updateOne({ _id: owner.id }, { $push: { documents: { name: 'Passport', type: 'Passport', url: `/uploads/${name}` } } });
  return name;
}

describe('uploading with S3 on', () => {
  it('stores a private object under documents/<name> and leaves the route a /uploads path, never a bucket URL', async () => {
    const name = storedName();
    const local = path.join(__dirname, '..', 'uploads', name);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, '%PDF-1.4 scanned and clean');
    const req = { file: { path: local, filename: name } };
    const next = vi.fn();
    await uploadToS3IfConfigured(req, { status: () => ({ json: () => {} }) }, next);

    expect(next).toHaveBeenCalled();
    expect(req.file.s3Key).toBe(`documents/${name}`);
    expect(req.file).not.toHaveProperty('s3Url');
    const put = commands.find((c) => c.name === 'PutObjectCommand');
    expect(put.input).toMatchObject({ Bucket: 'gradzest-test-bucket', Key: `documents/${name}` });
    expect(put.input).not.toHaveProperty('ACL'); // nothing is made public
    await vi.waitFor(() => expect(fs.existsSync(local)).toBe(false)); // the local copy is removed
  });
});

describe('opening a file kept in S3', () => {
  it('streams it to its owner through a signed link, privately', async () => {
    const owner = await signedIn('student');
    const name = await documentInS3(owner, 'passport scan from s3');
    const link = await request(app).post(`/api/files/${name}/link`).set(auth(owner));
    expect(link.status).toBe(200);
    expect(link.body.url).not.toMatch(/amazonaws|s3\./);
    const file = await request(app).get(link.body.url).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(file.body.toString()).toBe('passport scan from s3');
    expect(file.headers['cache-control']).toBe('private, no-store');
  });

  it('gives no link to another user, and an expired or tampered link never reaches the bucket', async () => {
    const owner = await signedIn('student');
    const other = await signedIn('student');
    const name = await documentInS3(owner, 'private');
    expect((await request(app).post(`/api/files/${name}/link`).set(auth(other))).status).toBe(404);

    const expired = signedUploadPath(name, owner.id, Date.now() - LINK_TTL_MS - 1000).url;
    const good = new URL(signedUploadPath(name, owner.id).url, 'http://x');
    good.searchParams.set('sig', `${good.searchParams.get('sig').slice(0, -2)}AA`);
    commands.length = 0;
    expect((await request(app).get(expired)).status).toBe(403);
    expect((await request(app).get(`${good.pathname}?${good.searchParams}`)).status).toBe(403);
    expect(commands.filter((c) => c.name === 'GetObjectCommand')).toEqual([]);
  });

  it('removes the object when the document is deleted', async () => {
    const owner = await signedIn('student');
    const name = await documentInS3(owner, 'to delete');
    deleteStoredFile(`/uploads/${name}`);
    await vi.waitFor(() => expect(objects.has(`documents/${name}`)).toBe(false));
  });
});

describe('nothing stores a bucket URL', () => {
  it('no route or library builds an amazonaws.com address', () => {
    const offenders = [];
    for (const dir of ['routes', 'lib', 'middleware']) {
      for (const f of fs.readdirSync(path.join(__dirname, '..', dir)).filter((x) => x.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(__dirname, '..', dir, f), 'utf8');
        // storedFile.js recognises old stored URLs in order to delete their objects; it never builds one
        if (/amazonaws\.com/.test(src) && f !== 'storedFile.js') offenders.push(`${dir}/${f}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('scripts/migrateS3Urls.js', () => {
  const bucketUrl = (name) => `https://gradzest-test-bucket.s3.ap-south-1.amazonaws.com/documents/${name}`;

  it('turns stored bucket URLs into /uploads paths, only with --apply, and is safe to run twice', async () => {
    const db = mongoose.connection.db;
    const [a, b, c] = [storedName(), storedName(), storedName()];
    const { insertedId: userId } = await db.collection('users').insertOne({
      email: `s3-migrate-${Date.now()}@example.com`, role: 'student',
      documents: [{ name: 'Passport', url: bucketUrl(a) }, { name: 'Local', url: '/uploads/already-local.pdf' }],
      applications: [{ universityName: 'X', offerLetterUrl: bucketUrl(b) }],
    });
    const { insertedId: roomId } = await db.collection('chatrooms').insertOne({ participants: [], messages: [{ content: '', fileUrl: bucketUrl(c) }] });

    const dry = await migrateS3Urls(db);
    expect(dry.users.fields).toBeGreaterThanOrEqual(2);
    expect((await db.collection('users').findOne({ _id: userId })).documents[0].url).toBe(bucketUrl(a));

    await migrateS3Urls(db, { apply: true });
    const user = await db.collection('users').findOne({ _id: userId });
    expect(user.documents.map((d) => d.url)).toEqual([`/uploads/${a}`, '/uploads/already-local.pdf']);
    expect(user.applications[0].offerLetterUrl).toBe(`/uploads/${b}`);
    expect((await db.collection('chatrooms').findOne({ _id: roomId })).messages[0].fileUrl).toBe(`/uploads/${c}`);

    const again = await migrateS3Urls(db, { apply: true });
    expect(Object.values(again).every((s) => s.fields === 0)).toBe(true);
  });

  it('runs as a command: a dry run by default, and unknown options are refused', async () => {
    const run = (...args) => new Promise((resolve) => {
      execFile(process.execPath, [path.join(__dirname, '..', 'scripts', 'migrateS3Urls.js'), ...args], { env: process.env },
        (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
    });
    const dry = await run();
    expect(dry.code).toBe(0);
    expect(dry.stdout).toMatch(/DRY RUN/);
    expect((await run('--force')).code).toBe(1);
  }, 60000);
});
