const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const { filterByRelativeScore } = require('../lib/zestRetrieval');
const { chunkText } = require('../lib/pdfText');
const { sanitizeHistory } = require('../lib/zestHistory');

let n = 0;
async function mk(role, extra = {}) {
  const email = `zest-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Zest ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('Zest knowledge base management is admin-only', () => {
  it('a counselor and a student are refused; an admin is allowed', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student');
    const admin = await mk('admin');

    expect((await request(app).get('/api/zest/documents').set(as(counselor))).status).toBe(403);
    expect((await request(app).get('/api/zest/documents').set(as(student))).status).toBe(403);
    expect((await request(app).get('/api/zest/documents').set(as(admin))).status).toBe(200);

    expect((await request(app).get('/api/zest/alerts').set(as(counselor))).status).toBe(403);
    expect((await request(app).get('/api/zest/alerts').set(as(admin))).status).toBe(200);

    expect((await request(app).post('/api/zest/documents').set(as(counselor)).field('title', 'x')).status).toBe(403);
  });

  it('an unauthenticated request is refused', async () => {
    expect((await request(app).get('/api/zest/documents')).status).toBe(401);
    expect((await request(app).get('/api/zest/alerts')).status).toBe(401);
  });
});

describe('Zest chat is available to any authenticated role', () => {
  it('counselor, student and admin can all reach /ask (though it 503s without an API key in tests)', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student');
    const admin = await mk('admin');

    for (const u of [counselor, student, admin]) {
      const res = await request(app).post('/api/zest/ask').set(as(u)).send({ question: 'What is the visa process?' });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    }
  });

  it('an empty question is rejected with 400, not forwarded to the model', async () => {
    const admin = await mk('admin');
    const res = await request(app).post('/api/zest/ask').set(as(admin)).send({ question: '   ' });
    expect(res.status).toBe(400);
  });

  it('a request carrying conversation history is accepted without crashing', async () => {
    const admin = await mk('admin');
    const res = await request(app).post('/api/zest/ask').set(as(admin)).send({
      question: 'And what about the other country?',
      history: [
        { role: 'user', text: 'What is the visa process for Canada?' },
        { role: 'assistant', text: 'Canada requires a study permit; apply after you have an offer letter.' },
      ],
    });
    // No ANTHROPIC_API_KEY in tests -> 503 from the config gate, same as any other /ask call;
    // the point here is that history parsing itself never produces a 500.
    expect(res.status).not.toBe(500);
  });
});

describe('Zest ad-hoc document analysis (not added to the knowledge base)', () => {
  const KnowledgeDocument = require('../models/KnowledgeDocument');

  it('requires auth and a file', async () => {
    const student = await mk('student');
    expect((await request(app).post('/api/zest/ask-with-file')).status).toBe(401);
    // No file attached: rejected before the scan/extraction pipeline even runs.
    expect((await request(app).post('/api/zest/ask-with-file').set(as(student)).field('question', 'hi')).status).toBe(400);
  });

  it('rejects a missing question once a file is attached (no ClamAV in this test env -> 503 from the scan gate, never a 400/401/403)', async () => {
    const student = await mk('student');
    const res = await request(app).post('/api/zest/ask-with-file').set(as(student))
      .attach('file', Buffer.from('%PDF-1.4 not a real pdf'), 'doc.pdf');
    // This environment has no clamd running, so scanUploadedFile fails closed with 503 before
    // the route's own "question is required" check ever runs — asserting that fail-closed
    // behavior here (rather than skipping) is itself the point: an unscannable file must never
    // reach extraction/Claude.
    expect(res.status).toBe(503);
  });

  it('is available to any authenticated role and never creates a KnowledgeDocument', async () => {
    const countBefore = await KnowledgeDocument.countDocuments();
    const student = await mk('student');
    const res = await request(app).post('/api/zest/ask-with-file').set(as(student))
      .field('question', 'What does this say?')
      .attach('file', Buffer.from('%PDF-1.4 not a real pdf'), 'doc.pdf');
    // No ANTHROPIC_API_KEY in tests -> 503 once a real pdf-parse call would happen, or 400 if
    // extraction itself fails on this fake buffer — either way it must never reach 401/403/500,
    // and it must never persist this one-off file into the shared knowledge base.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(500);
    expect(await KnowledgeDocument.countDocuments()).toBe(countBefore);
  });

  it('rejects a non-PDF/doc/image file type', async () => {
    const admin = await mk('admin');
    const res = await request(app).post('/api/zest/ask-with-file').set(as(admin))
      .field('question', 'hi')
      .attach('file', Buffer.from('#!/bin/sh\necho hi'), 'script.sh');
    expect(res.status).toBe(500); // multer's fileFilter error surfaces via the default error handler
  });
});

describe('Zest conversation history sanitization', () => {
  it('drops malformed input instead of throwing', () => {
    expect(sanitizeHistory(undefined)).toEqual([]);
    expect(sanitizeHistory(null)).toEqual([]);
    expect(sanitizeHistory('not an array')).toEqual([]);
    expect(sanitizeHistory([{ role: 'admin', text: 'hi' }, { role: 'user' }, { text: 'no role' }])).toEqual([]);
  });

  it('keeps well-formed alternating turns as-is', () => {
    const history = [
      { role: 'user', text: 'What is the visa process for the UK?' },
      { role: 'assistant', text: 'It takes three to four weeks after biometrics.' },
    ];
    expect(sanitizeHistory(history)).toEqual(history);
  });

  it('merges consecutive same-role turns instead of sending invalid alternation to Claude', () => {
    const result = sanitizeHistory([
      { role: 'user', text: 'First question' },
      { role: 'user', text: 'Second question right after (e.g. a client bug)' },
      { role: 'assistant', text: 'An answer' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].text).toContain('First question');
    expect(result[0].text).toContain('Second question');
  });

  it('trims to start with user and end with assistant', () => {
    const result = sanitizeHistory([
      { role: 'assistant', text: 'orphaned reply with no question' },
      { role: 'user', text: 'a real question' },
      { role: 'assistant', text: 'a real answer' },
      { role: 'user', text: 'a dangling unanswered question' },
    ]);
    expect(result[0].role).toBe('user');
    expect(result[result.length - 1].role).toBe('assistant');
    expect(result.map(r => r.text)).toEqual(['a real question', 'a real answer']);
  });

  it('caps to the most recent exchanges and caps each message length', () => {
    const long = Array.from({ length: 20 }, (_, i) => [
      { role: 'user', text: `question ${i}` },
      { role: 'assistant', text: `answer ${i}` },
    ]).flat();
    const result = sanitizeHistory(long);
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result[result.length - 1].text).toBe('answer 19'); // most recent, not oldest, survives

    const hugeText = 'x'.repeat(5000);
    const capped = sanitizeHistory([{ role: 'user', text: hugeText }, { role: 'assistant', text: 'ok' }]);
    expect(capped[0].text.length).toBeLessThanOrEqual(1000);
  });
});

describe('Zest retrieval chunk index', () => {
  it('a text search over KnowledgeChunk finds a relevant chunk by keyword', async () => {
    const mongoose = require('mongoose');
    await KnowledgeChunk.init(); // ensure the text index exists before relying on $text below
    const docId = new mongoose.Types.ObjectId();
    await KnowledgeChunk.create({
      documentId: docId, documentTitle: 'Visa Guide',
      text: 'The student visa processing time for the UK is typically three to four weeks after biometrics.',
      order: 0,
    });
    const matches = await KnowledgeChunk.find({ $text: { $search: 'visa processing time UK' } });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].documentTitle).toBe('Visa Guide');
  });

  it('a weakly-matching off-topic chunk is filtered out when a strong match exists (the exact pollution scenario admin uploads can cause)', async () => {
    const mongoose = require('mongoose');
    await KnowledgeChunk.init();
    const visaDocId = new mongoose.Types.ObjectId();
    const mlDocId = new mongoose.Types.ObjectId();
    await KnowledgeChunk.create({
      documentId: visaDocId, documentTitle: 'UK Visa Guide',
      text: 'UK student visa processing time is typically three to four weeks after biometrics are submitted for the visa application.',
      order: 0,
    });
    // An unrelated ML paper that happens to share exactly one weak keyword ("time") with the question.
    await KnowledgeChunk.create({
      documentId: mlDocId, documentTitle: 'Data Preprocessing for AI Models',
      text: 'Efficient training reduces computational costs and training time, facilitating faster iterations for data scientists.',
      order: 0,
    });

    const ranked = await KnowledgeChunk.find(
      { $text: { $search: 'how long does UK visa processing take' } },
      { score: { $meta: 'textScore' } },
    ).sort({ score: { $meta: 'textScore' } }).limit(5).lean();

    const kept = filterByRelativeScore(ranked);
    expect(kept.map(k => k.documentTitle)).toContain('UK Visa Guide');
    expect(kept.map(k => k.documentTitle)).not.toContain('Data Preprocessing for AI Models');
  });

  it('no matches at all yields an empty kept list, not an error', () => {
    expect(filterByRelativeScore([])).toEqual([]);
  });
});

describe('Zest PDF chunking', () => {
  it('splits long text into overlapping chunks so boundary sentences keep context', () => {
    const longText = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}. `.repeat(30)).join('\n\n');
    const chunks = chunkText(longText);
    expect(chunks.length).toBeGreaterThan(1);
    // the tail of one chunk should reappear at the head of the next (the overlap)
    const tail = chunks[0].slice(-80);
    expect(chunks[1]).toContain(tail.slice(-40));
  });

  it('strips lone page-number lines left behind by PDF extraction', () => {
    const chunks = chunkText('Intro paragraph here.\n\n42\n\nBody paragraph continues after the page break.');
    const joined = chunks.join('\n');
    expect(joined).not.toMatch(/^42$/m);
  });
});
