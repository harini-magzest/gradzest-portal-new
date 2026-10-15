const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const User = require('../models/User');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const ZestQueryLog = require('../models/ZestQueryLog');
const LeadAlert = require('../models/LeadAlert');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const { scanUploadedFile } = require('../middleware/scanUpload');
const { recordUpload } = require('../middleware/recordUpload');
const { uploadToS3IfConfigured } = require('../middleware/uploadToS3IfConfigured');
const { extractText, chunkText } = require('../lib/pdfText');
const { askZest, isZestConfigured } = require('../lib/zestModel');
const { buildAlertsWorkbook } = require('../lib/zestXlsx');
const { retrieveChunks } = require('../lib/zestRetrieval');
const { sanitizeHistory } = require('../lib/zestHistory');
const { createZestLimiter } = require('../lib/zestLimiter');
const { buildInsights, documentUsage } = require('../lib/zestInsights');
const { replaceDocument } = require('../lib/zestKnowledge');
const { createWebLead, readContact, text: cleanText, list } = require('../lib/createWebLead');

const NOT_CONFIGURED = 'Zest is not configured yet. Ask an admin to set ANTHROPIC_API_KEY or GEMINI_API_KEY.';
const UNAVAILABLE = "Zest's AI is unavailable right now. Please try again later.";

// The model failed and there was nothing to fall back to — routes turn this into a 503
class ZestUnavailable extends Error {}

// When the AI fails, answer with the knowledge-base passages retrieval already found rather than
// nothing — plain text, since the chat widget renders answers as-is.
function knowledgeBaseFallback(matches) {
  if (!matches.length) return null;
  const passages = matches.slice(0, 3).map(m => {
    const text = m.text.trim();
    return `From "${m.documentTitle}":\n${text.length > 600 ? `${text.slice(0, 600).trimEnd()}…` : text}`;
  });
  return `Zest's AI is unavailable right now, so here is what Gradzest's knowledge base says:\n\n${passages.join('\n\n')}`;
}

const router = express.Router();
const { validate, idParam } = require('../middleware/validate');
const { z, text } = require('../lib/schemas');

router.param('id', idParam); // knowledge documents and lead alerts: MongoDB ObjectIds (middleware/validate.js)
// Multipart form fields that come with an uploaded file
const knowledgeDocumentFields = z.object({ title: text(200).optional() }).strict();
// `history` is the conversation so far, as JSON text (the route parses and sanitises it)
const askWithFileFields = z.object({ question: z.string().max(20000).optional(), history: z.string().max(200000).optional() }).strict();

// Per-user cap (see lib/zestLimiter.js). Off in the test env, like the other limiters, so tests can ask freely;
// the limiter itself has its own test.
const askLimiter = process.env.NODE_ENV === 'test' ? (_req, _res, next) => next() : createZestLimiter();
// Signed-out visitors on the public site: keyed on IP and tighter, since anyone can call it.
const guestLimiter = process.env.NODE_ENV === 'test' ? (_req, _res, next) => next() : createZestLimiter({ max: 10, byIp: true });

// The signed token carries id/role/email but not the name; Zest uses the name to address the person.
async function callerFor(req) {
  const me = await User.findById(req.user.id).select('name').lean().catch(() => null);
  return { ...req.user, name: me?.name || '' };
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
}

/* ── Knowledge base management (admin only) ─────────────────────────────── */

// multer's shared fileFilter (middleware/upload.js) also allows doc/docx/images for other routes. Anything but a PDF is
// refused here, before the antivirus scan and before pdf-parse: otherwise it would fail later and leave a "failed"
// knowledge document and an orphaned upload behind. The frontend's accept="application/pdf" is easily bypassed, so
// this check is the one that counts.
function requirePdf(req, res, next) {
  if (!req.file) return next();
  if (req.file.mimetype !== 'application/pdf') {
    return fs.unlink(req.file.path, () => res.status(400).json({ message: 'Only PDF files are supported for the knowledge base.' }));
  }
  next();
}

// Reads and chunks the PDF while it's still on local disk — must run before
// uploadToS3IfConfigured, which deletes the local copy once S3 is configured.
async function extractAndChunk(req, res, next) {
  if (!req.file) return next();
  try {
    const text = await extractText(req.file.path);
    const chunks = chunkText(text);
    if (!chunks.length) throw new Error('No extractable text found in this PDF (it may be a scanned image)');
    req.zestChunks = chunks;
  } catch (err) {
    req.zestExtractError = err.message || 'Processing failed';
  }
  next();
}

router.post('/documents', authMiddleware, adminOnly, upload.single('file'), requirePdf, validate({ body: knowledgeDocumentFields }), scanUploadedFile, recordUpload('zest_kb'), extractAndChunk, uploadToS3IfConfigured, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'A PDF file is required' });
  const storagePath = `/uploads/${req.file.filename}`;
  const title = (req.body.title || req.file.originalname || 'Document').trim();

  const doc = await KnowledgeDocument.create({
    title, originalFilename: req.file.originalname, storagePath,
    uploadedBy: req.user.id, mimeType: req.file.mimetype, fileSize: req.file.size,
    status: req.zestChunks ? 'ready' : 'failed',
    error: req.zestExtractError || '',
    chunkCount: req.zestChunks?.length || 0,
  });

  if (req.zestChunks) {
    await KnowledgeChunk.insertMany(req.zestChunks.map((text, order) => ({
      documentId: doc._id, documentTitle: doc.title, text, order,
    })));
  }

  res.status(201).json(doc.toObject());
});

// Replace the PDF behind an existing document and keep its title. The document is looked up first so a wrong id costs no
// upload, then the new file goes through the same scan / inspect / read pipeline as a new upload. A PDF that cannot be
// read is refused before anything is stored, so the existing document keeps working.
async function loadKbDocument(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found' });
  const doc = await KnowledgeDocument.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Not found' });
  req.kbDoc = doc;
  next();
}

function requireReadable(req, res, next) {
  if (!req.zestExtractError) return next();
  if (req.file) fs.unlink(req.file.path, () => {});
  res.status(400).json({ message: `${req.zestExtractError}. The existing document was left as it was.` });
}

router.post('/documents/:id/replace', authMiddleware, adminOnly, loadKbDocument, upload.single('file'), requirePdf, scanUploadedFile, recordUpload('zest_kb'), extractAndChunk, requireReadable, uploadToS3IfConfigured, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'A PDF file is required' });
  const updated = await replaceDocument(req.kbDoc, {
    storagePath: `/uploads/${req.file.filename}`,
    originalFilename: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
  }, req.zestChunks);
  res.json(updated);
});

// How far back "used as a source" looks.
const USAGE_DAYS = 90;

router.get('/documents', authMiddleware, adminOnly, async (req, res) => {
  const [docs, usage] = await Promise.all([KnowledgeDocument.find().sort({ createdAt: -1 }).lean(), documentUsage(USAGE_DAYS)]);
  res.json(docs.map(d => ({ ...d, timesUsed: usage.get(String(d._id)) || 0 })));
});

router.put('/documents/:id', authMiddleware, adminOnly, async (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ message: 'title is required' });
  const doc = await KnowledgeDocument.findByIdAndUpdate(req.params.id, { title }, { new: true });
  if (!doc) return res.status(404).json({ message: 'Not found' });
  await KnowledgeChunk.updateMany({ documentId: doc._id }, { documentTitle: title });
  res.json(doc.toObject());
});

router.delete('/documents/:id', authMiddleware, adminOnly, async (req, res) => {
  const doc = await KnowledgeDocument.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Not found' });
  await KnowledgeChunk.deleteMany({ documentId: doc._id });
  res.json({ message: 'Deleted' });
});

/* ── Chat (any authenticated role, plus signed-out visitors as 'guest') ───── */

// req.user is absent on the public route: the caller is then a 'guest' with no tools beyond the catalogue.
async function answerQuestion(req, question, history, onText, onStatus) {
  const userId = req.user?.id;
  const role = req.user ? req.user.role : 'guest';
  const matches = await retrieveChunks(question, history);

  const sourceDocIds = [...new Set(matches.map(m => String(m.documentId)))];
  const sources = [...new Map(matches.map(m => [String(m.documentId), { documentId: m.documentId, title: m.documentTitle }])).values()];

  let answer, toolsUsed, usage;
  try {
    ({ text: answer, toolsUsed, usage } = await askZest(
      question, matches.map(m => ({ title: m.documentTitle, text: m.text })), history, role, '', req.user ? await callerFor(req) : null, onText, { ip: req.ip, io: req.app.get('io'), onStatus },
    ));
  } catch (err) {
    const fallback = knowledgeBaseFallback(matches);
    if (!fallback) throw new ZestUnavailable(err.message);
    const log = await ZestQueryLog.create({ userId, userRole: role, question, answer: fallback, sourceDocIds, toolsUsed: [], degraded: true });
    return { answer: fallback, sources, degraded: true, ...(userId ? { logId: String(log._id) } : {}) };
  }

  const log = await ZestQueryLog.create({ userId, userRole: role, question, answer, sourceDocIds, toolsUsed, usage });
  // No logId for guests: feedback needs a signed-in owner, so there is nothing for them to rate against.
  return { answer, sources, ...(userId ? { logId: String(log._id) } : {}) };
}

router.post('/ask', authMiddleware, askLimiter, async (req, res) => {
  const question = (req.body.question || '').trim().slice(0, 1000);
  if (!question) return res.status(400).json({ message: 'question is required' });
  if (!isZestConfigured()) return res.status(503).json({ message: NOT_CONFIGURED });

  try {
    res.json(await answerQuestion(req, question, sanitizeHistory(req.body.history)));
  } catch (err) {
    console.error('[zest/ask]', err.message);
    res.status(502).json({ message: 'Zest could not answer right now. Please try again.' });
  }
});

// Same answer as /ask, delivered as server-sent events so the first words appear while the rest
// is still being generated. Events: {type:'status',text} when a live lookup starts (plain words such as "Checking your
// students…"), {type:'delta',text} repeatedly, then {type:'done',answer,sources} or {type:'error',message}. Pre-stream validation still returns plain JSON errors.
async function streamAnswer(req, res) {
  const question = (req.body.question || '').trim().slice(0, 1000);
  if (!question) return res.status(400).json({ message: 'question is required' });
  if (!isZestConfigured()) return res.status(503).json({ message: NOT_CONFIGURED });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
    const { answer, sources, degraded, logId } = await answerQuestion(req, question, sanitizeHistory(req.body.history), (text) => send({ type: 'delta', text }), (text) => send({ type: 'status', text }));
    send({ type: 'done', answer, sources, logId, ...(degraded ? { degraded } : {}) });
  } catch (err) {
    console.error('[zest/ask-stream]', err.message);
    send({ type: 'error', message: 'Zest could not answer right now. Please try again.' });
  } finally {
    res.end();
  }
}

router.post('/ask-stream', authMiddleware, askLimiter, streamAnswer);

// The same stream for signed-out visitors on the public site (landing page etc.): no auth, IP-limited,
// knowledge base + catalogue search only. No file upload or feedback — those stay signed-in.
// Per IP first, then the overall daily cap for all signed-out visitors (lib/zestGuestCap.js)
router.post('/public/ask-stream', guestLimiter, require('../lib/zestGuestCap').guestDailyCap, streamAnswer);

// The "Talk to a counselor" form inside the guest chat. Zest itself never saves anything (its tools are read-only),
// so the widget collects the details in a real form and they go through the same lead path as a marketing form:
// saved once (a repeat email/mobile is never stored twice), counselor assigned, admins alerted. `wantsHuman` makes
// the alert urgent so someone calls back. Same reply either way, so the chat can't reveal who is already a student.
const ZEST_LEAD_THANKS = 'Thank you! A Gradzest counselor will contact you shortly.';
router.post('/public/lead', async (req, res) => {
  const b = req.body || {};
  if (cleanText(b.website)) return res.status(201).json({ message: ZEST_LEAD_THANKS }); // bot trap, as on the forms
  const contact = readContact(b);
  if (contact.error) return res.status(400).json({ message: contact.error });
  try {
    await createWebLead(req.app, {
      ...contact, source: 'zest_chat', wantsHuman: !!b.wantsHuman,
      preferredCountries: list(b.preferredCountries),
    });
    res.status(201).json({ message: ZEST_LEAD_THANKS });
  } catch (err) {
    console.error('[zest/public/lead]', err);
    res.status(500).json({ message: 'Could not send your details. Please try again.' });
  }
});

// A user handing Zest a document for one question — not added to the shared knowledge base.
// Reuses the exact same security pipeline as a KB upload (ClamAV scan + deep inspection/audit
// via recordUpload), but skips S3 and never creates a KnowledgeDocument/KnowledgeChunk, and the
// local copy is deleted right after extraction since nothing should persist past this request.
router.post('/ask-with-file', authMiddleware, askLimiter, upload.single('file'), validate({ body: askWithFileFields }), scanUploadedFile, recordUpload('zest_chat'), async (req, res) => {
  const question = (req.body.question || '').trim().slice(0, 1000);
  if (!req.file) return res.status(400).json({ message: 'A file is required' });
  if (!question) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ message: 'question is required' }); }
  if (!isZestConfigured()) { fs.unlink(req.file.path, () => {}); return res.status(503).json({ message: NOT_CONFIGURED }); }

  // multipart fields arrive as strings, not JSON — the KB-less /ask route gets a real array.
  let rawHistory = req.body.history;
  if (typeof rawHistory === 'string') {
    try { rawHistory = JSON.parse(rawHistory); } catch { rawHistory = []; }
  }
  const history = sanitizeHistory(rawHistory);

  try {
    let attachedDocText;
    try {
      attachedDocText = (await extractText(req.file.path)).slice(0, 12000);
    } catch (err) {
      return res.status(400).json({ message: err.message || 'Could not read that file' });
    }
    if (!attachedDocText.trim()) return res.status(400).json({ message: 'No extractable text found in this file (it may be a scanned image)' });

    let answer, toolsUsed, usage;
    try {
      ({ text: answer, toolsUsed, usage } = await askZest(question, [], history, req.user.role, attachedDocText, await callerFor(req), null, { ip: req.ip, io: req.app.get('io') }));
    } catch (err) {
      return res.status(503).json({ message: UNAVAILABLE });
    }
    const log = await ZestQueryLog.create({
      userId: req.user.id, userRole: req.user.role,
      question: `[attached: ${req.file.originalname}] ${question}`, answer, sourceDocIds: [], toolsUsed, usage,
    });
    res.json({ answer, sources: [], logId: String(log._id) });
  } catch (err) {
    console.error('[zest/ask-with-file]', err.message);
    res.status(502).json({ message: 'Zest could not answer right now. Please try again.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

/* ── Answer feedback + analytics ─────────────────────────────────────────── */

// The person who was answered rates that answer. Only their own log row can be rated, and re-rating replaces
// the earlier rating, so a mis-click can be corrected.
router.post('/feedback', authMiddleware, async (req, res) => {
  const { logId, rating } = req.body || {};
  if (!mongoose.isValidObjectId(logId)) return res.status(400).json({ message: 'logId is required' });
  if (rating !== 'up' && rating !== 'down') return res.status(400).json({ message: "rating must be 'up' or 'down'" });
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 500) : '';
  const updated = await ZestQueryLog.findOneAndUpdate(
    { _id: logId, userId: req.user.id },
    { $set: { 'feedback.rating': rating, 'feedback.comment': comment, 'feedback.at': new Date() } },
    { new: true },
  ).select('_id');
  if (!updated) return res.status(404).json({ message: 'Answer not found' });
  res.json({ ok: true });
});

// Admin turns a weak answer, or a question Zest had nothing to ground, into knowledge: the question and the corrected
// answer become a small knowledge-base entry that retrieval can find next time. No file is stored for these.
router.post('/documents/from-answer', authMiddleware, adminOnly, async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 1000) : '';
  const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim().slice(0, 4000) : '';
  if (!question || !answer) return res.status(400).json({ message: 'question and answer are required' });
  const title = (typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim() : question).slice(0, 120);

  const chunks = chunkText(`Question: ${question}\n\nAnswer: ${answer}`);
  const doc = await KnowledgeDocument.create({
    title, originalFilename: '', storagePath: 'manual-entry', uploadedBy: req.user.id, mimeType: 'text/plain',
    fileSize: question.length + answer.length, status: 'ready', chunkCount: chunks.length,
  });
  await KnowledgeChunk.insertMany(chunks.map((text, order) => ({ documentId: doc._id, documentTitle: doc.title, text, order })));
  res.status(201).json(doc.toObject());
});

// What to improve in Zest (see lib/zestInsights.js). Shown on the Insights tab of the Zest panel, and available to
// admins in chat through the get_zest_insights tool.
router.get('/analytics', authMiddleware, adminOnly, async (req, res) => {
  res.json(await buildInsights(req.query.days));
});

/* ── Daily lead alerts (admin only) ──────────────────────────────────────── */

// Every question asked of Zest and its answer, so admin can audit what the assistant told
// staff, students and signed-out guests. Backs the query log panel on /admin/zest.
router.get('/query-logs', authMiddleware, adminOnly, async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const [logs, total] = await Promise.all([
    ZestQueryLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('userId', 'name email').lean(),
    ZestQueryLog.countDocuments(),
  ]);
  res.json({
    logs: logs.map(l => ({
      id: l._id, question: l.question, answer: l.answer, userRole: l.userRole,
      userName: l.userId?.name || (l.userRole === 'guest' ? 'Guest' : 'Unknown'), userEmail: l.userId?.email || '',
      sourceDocCount: (l.sourceDocIds || []).length, createdAt: l.createdAt,
    })),
    total,
  });
});

router.get('/alerts', authMiddleware, adminOnly, async (req, res) => {
  const alerts = await LeadAlert.find({ resolved: false }).sort({ flaggedOn: -1, severity: 1 }).limit(500).lean();
  const leadIds = [...new Set(alerts.map(a => String(a.userId)))];
  const leads = await User.find({ _id: { $in: leadIds } }).select('name email counselorId').lean();
  const leadById = new Map(leads.map(l => [String(l._id), l]));
  const counselorIds = [...new Set(leads.map(l => l.counselorId).filter(Boolean))];
  const counselors = await User.find({ _id: { $in: counselorIds } }).select('name').lean();
  const counselorById = new Map(counselors.map(c => [String(c._id), c.name]));

  res.json(alerts.map(a => {
    const lead = leadById.get(String(a.userId));
    return {
      id: a._id, alertType: a.alertType, severity: a.severity, detail: a.detail,
      flaggedOn: a.flaggedOn, resolved: a.resolved,
      leadName: lead?.name || 'Unknown', leadEmail: lead?.email || '',
      counselorName: counselorById.get(lead?.counselorId) || '',
    };
  }));
});

router.put('/alerts/:id/resolve', authMiddleware, adminOnly, async (req, res) => {
  const alert = await LeadAlert.findByIdAndUpdate(req.params.id, { resolved: true }, { new: true });
  if (!alert) return res.status(404).json({ message: 'Not found' });
  res.json(alert.toObject());
});

router.get('/alerts/export', authMiddleware, adminOnly, async (req, res) => {
  const alerts = await LeadAlert.find({ resolved: false }).sort({ flaggedOn: -1 }).lean();
  const leadIds = [...new Set(alerts.map(a => String(a.userId)))];
  const leads = await User.find({ _id: { $in: leadIds } }).select('name email counselorId').lean();
  const leadById = new Map(leads.map(l => [String(l._id), l]));
  const counselorIds = [...new Set(leads.map(l => l.counselorId).filter(Boolean))];
  const counselors = await User.find({ _id: { $in: counselorIds } }).select('name').lean();
  const counselorById = new Map(counselors.map(c => [String(c._id), c.name]));

  const rows = alerts.map(a => {
    const lead = leadById.get(String(a.userId));
    return {
      leadName: lead?.name || 'Unknown', leadEmail: lead?.email || '',
      counselorName: counselorById.get(lead?.counselorId) || '',
      alertType: a.alertType, severity: a.severity, detail: a.detail, flaggedOn: a.flaggedOn,
    };
  });

  const buffer = await buildAlertsWorkbook(rows);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="zest-lead-alerts-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(Buffer.from(buffer));
});

module.exports = router;
