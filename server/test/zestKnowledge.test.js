// Replacing the PDF behind a knowledge-base document while keeping its title, and the usage counts shown next to each
// document in the Zest panel's Knowledge tab.

const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const ZestQueryLog = require('../models/ZestQueryLog');
const { replaceDocument } = require('../lib/zestKnowledge');

let n = 0;
async function mk(role) {
  const email = `zestkb-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `KB ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

async function doc(admin, extra = {}) {
  const d = await KnowledgeDocument.create({
    title: `KB doc ${Date.now()}-${n++}`, originalFilename: 'old.pdf', storagePath: '/uploads/old.pdf', uploadedBy: admin.id,
    mimeType: 'application/pdf', fileSize: 100, status: 'ready', chunkCount: 2, ...extra,
  });
  await KnowledgeChunk.insertMany([{ documentId: d._id, documentTitle: d.title, text: 'old chunk one', order: 0 }, { documentId: d._id, documentTitle: d.title, text: 'old chunk two', order: 1 }]);
  return d;
}

const newFile = { storagePath: '/uploads/new.pdf', originalFilename: 'new.pdf', mimeType: 'application/pdf', fileSize: 2048 };

describe('replaceDocument', () => {
  it('keeps the document, its id and its title, and swaps the file and the text behind it', async () => {
    const admin = await mk('admin');
    const d = await doc(admin);

    const updated = await replaceDocument(d, newFile, ['new chunk one', 'new chunk two', 'new chunk three']);
    expect(String(updated._id)).toBe(String(d._id));
    expect(updated).toMatchObject({ title: d.title, originalFilename: 'new.pdf', storagePath: '/uploads/new.pdf', fileSize: 2048, status: 'ready', error: '', chunkCount: 3 });

    const chunks = await KnowledgeChunk.find({ documentId: d._id }).sort({ order: 1 }).lean();
    expect(chunks.map(c => c.text)).toEqual(['new chunk one', 'new chunk two', 'new chunk three']);
    expect(chunks.every(c => c.documentTitle === d.title)).toBe(true);
  });

  it('turns a failed document into a ready one, clearing the old error', async () => {
    const admin = await mk('admin');
    const d = await doc(admin, { status: 'failed', error: 'No extractable text', chunkCount: 0 });
    const updated = await replaceDocument(d, newFile, ['readable text']);
    expect(updated).toMatchObject({ status: 'ready', error: '', chunkCount: 1 });
  });

  it('does nothing, and leaves the old text in place, when there is nothing to replace it with', async () => {
    const admin = await mk('admin');
    const d = await doc(admin);
    await expect(replaceDocument(d, newFile, [])).rejects.toThrow(/at least one chunk/);
    expect((await KnowledgeChunk.find({ documentId: d._id }).lean()).map(c => c.text).sort()).toEqual(['old chunk one', 'old chunk two']);
    expect((await KnowledgeDocument.findById(d._id).lean()).originalFilename).toBe('old.pdf');
  });

  it("does not touch another document's text", async () => {
    const admin = await mk('admin');
    const target = await doc(admin);
    const bystander = await doc(admin);
    await replaceDocument(target, newFile, ['only the target changes']);
    expect(await KnowledgeChunk.countDocuments({ documentId: bystander._id })).toBe(2);
  });
});

describe('POST /api/zest/documents/:id/replace', () => {
  it('is admin only', async () => {
    const admin = await mk('admin');
    const counselor = await mk('counselor');
    const student = await mk('student');
    const d = await doc(admin);
    expect((await request(app).post(`/api/zest/documents/${d._id}/replace`)).status).toBe(401);
    expect((await request(app).post(`/api/zest/documents/${d._id}/replace`).set(as(counselor))).status).toBe(403);
    expect((await request(app).post(`/api/zest/documents/${d._id}/replace`).set(as(student))).status).toBe(403);
  });

  it('refuses an unknown or malformed id before any file is handled', async () => {
    const admin = await mk('admin');
    expect((await request(app).post('/api/zest/documents/000000000000000000000000/replace').set(as(admin))).status).toBe(404);
    // A malformed id is refused by request validation (middleware/validate.js), before the upload is read
    expect((await request(app).post('/api/zest/documents/not-an-id/replace').set(as(admin))).status).toBe(400);
  });
});

describe('GET /api/zest/documents shows how often each document was used', () => {
  it('counts the answers that cited each document, and shows zero for one never used', async () => {
    const admin = await mk('admin');
    const asker = await mk('student');
    const used = await doc(admin);
    const idle = await doc(admin);
    await ZestQueryLog.create({ userId: asker.id, userRole: 'student', question: 'first', answer: 'a', sourceDocIds: [used._id] });
    await ZestQueryLog.create({ userId: asker.id, userRole: 'student', question: 'second', answer: 'a', sourceDocIds: [used._id, idle._id] });

    const res = await request(app).get('/api/zest/documents').set(as(admin));
    expect(res.status).toBe(200);
    expect(res.body.find(d => d._id === String(used._id)).timesUsed).toBe(2);
    expect(res.body.find(d => d._id === String(idle._id)).timesUsed).toBe(1);
  });

  it('ignores answers older than the usage window', async () => {
    const admin = await mk('admin');
    const asker = await mk('student');
    const d = await doc(admin);
    const old = await ZestQueryLog.create({ userId: asker.id, userRole: 'student', question: 'long ago', answer: 'a', sourceDocIds: [d._id] });
    // createdAt is immutable through Mongoose, so backdate the row through the raw collection.
    await ZestQueryLog.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 200 * 86400000) } });

    const res = await request(app).get('/api/zest/documents').set(as(admin));
    expect(res.body.find(x => x._id === String(d._id)).timesUsed).toBe(0);
  });
});
