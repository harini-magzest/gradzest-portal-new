// Only a PDF may go into the Zest knowledge base. multer's shared filter also lets Word documents and images through (other
// routes need them), and those would reach pdf-parse, fail, and leave a "failed" document and an orphaned upload behind.

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const KnowledgeChunk = require('../models/KnowledgeChunk');

const uploadDir = path.join(__dirname, '..', 'uploads');
const files = () => (fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : []);

let n = 0;
async function mk(role) {
  const email = `zestkbup-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `KB ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const DOCX = Buffer.from('504b0304140000000800', 'hex'); // a zip, as .docx is

describe('knowledge base accepts PDFs only', () => {
  it('refuses an image, removes what was uploaded, and creates no document', async () => {
    const admin = await mk('admin');
    const docsBefore = await KnowledgeDocument.countDocuments();
    const filesBefore = files().length;

    const res = await request(app).post('/api/zest/documents').set(as(admin))
      .field('title', 'Not a PDF')
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only pdf/i);
    expect(await KnowledgeDocument.countDocuments()).toBe(docsBefore);
    expect(files().length).toBe(filesBefore); // nothing orphaned on disk
  });

  it('refuses a Word document the same way', async () => {
    const admin = await mk('admin');
    const res = await request(app).post('/api/zest/documents').set(as(admin))
      .field('title', 'Not a PDF either')
      .attach('file', DOCX, {
        filename: 'policy.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    expect(res.status).toBe(400);
  });

  it('refuses a non-PDF as the replacement file, and leaves the existing document untouched', async () => {
    const admin = await mk('admin');
    const existing = await KnowledgeDocument.create({
      title: `Keep me ${Date.now()}`, originalFilename: 'keep.pdf', storagePath: '/uploads/keep.pdf', uploadedBy: admin.id,
      mimeType: 'application/pdf', fileSize: 10, status: 'ready', chunkCount: 1,
    });
    await KnowledgeChunk.create({ documentId: existing._id, documentTitle: existing.title, text: 'the original text', order: 0 });
    const filesBefore = files().length;

    const res = await request(app).post(`/api/zest/documents/${existing._id}/replace`).set(as(admin))
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    const after = await KnowledgeDocument.findById(existing._id);
    expect(after.status).toBe('ready');
    expect(after.originalFilename).toBe('keep.pdf');
    expect(await KnowledgeChunk.countDocuments({ documentId: existing._id })).toBe(1);
    expect(files().length).toBe(filesBefore);
  });

  it('still takes a PDF (the request gets past the type check)', async () => {
    const admin = await mk('admin');
    const res = await request(app).post('/api/zest/documents').set(as(admin))
      .field('title', `A PDF ${Date.now()}`)
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), { filename: 'real.pdf', contentType: 'application/pdf' });
    // This file has no text, so extraction fails: it is stored as a "failed" document (201), not refused as the wrong type
    expect(res.status).not.toBe(400);
    expect([201, 503]).toContain(res.status); // 503 = no antivirus scanner on this machine, which is a different gate
    if (res.status === 201) await KnowledgeDocument.deleteOne({ _id: res.body._id || res.body.id });
  });

  it('is still admin-only', async () => {
    const counselor = await mk('counselor');
    const res = await request(app).post('/api/zest/documents').set(as(counselor))
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });
});
