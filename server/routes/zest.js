const express = require('express');
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
const { askZest, isZestConfigured } = require('../lib/anthropicClient');
const { buildAlertsWorkbook } = require('../lib/zestXlsx');
const { filterByRelativeScore } = require('../lib/zestRetrieval');
const { sanitizeHistory } = require('../lib/zestHistory');

const router = express.Router();

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
}

/* ── Knowledge base management (admin only) ─────────────────────────────── */

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

router.post('/documents', authMiddleware, adminOnly, upload.single('file'), scanUploadedFile, recordUpload('zest_kb'), extractAndChunk, uploadToS3IfConfigured, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'A PDF file is required' });
  const storagePath = req.file.s3Url || `/uploads/${req.file.filename}`;
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

router.get('/documents', authMiddleware, adminOnly, async (req, res) => {
  const docs = await KnowledgeDocument.find().sort({ createdAt: -1 }).lean();
  res.json(docs);
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

/* ── Chat (any authenticated role) ───────────────────────────────────────── */

router.post('/ask', authMiddleware, async (req, res) => {
  const question = (req.body.question || '').trim().slice(0, 1000);
  if (!question) return res.status(400).json({ message: 'question is required' });
  if (!isZestConfigured()) return res.status(503).json({ message: 'Zest is not configured yet. Ask an admin to set ANTHROPIC_API_KEY.' });

  const history = sanitizeHistory(req.body.history);

  try {
    // A short follow-up reply ("UK", "the second one") won't $text-match anything on its own —
    // fold in the previous user turn so retrieval still has real keywords to work with.
    const priorUserText = [...history].reverse().find(h => h.role === 'user')?.text;
    const searchQuery = priorUserText ? `${priorUserText} ${question}` : question;

    const TOP_K = 5;
    const ranked = await KnowledgeChunk.find(
      { $text: { $search: searchQuery } },
      { score: { $meta: 'textScore' } },
    ).sort({ score: { $meta: 'textScore' } }).limit(TOP_K).lean();
    const matches = filterByRelativeScore(ranked);

    const answer = await askZest(question, matches.map(m => ({ title: m.documentTitle, text: m.text })), history, req.user.role);
    const sourceDocIds = [...new Set(matches.map(m => String(m.documentId)))];

    await ZestQueryLog.create({ userId: req.user.id, userRole: req.user.role, question, answer, sourceDocIds });

    const sources = [...new Map(matches.map(m => [String(m.documentId), { documentId: m.documentId, title: m.documentTitle }])).values()];
    res.json({ answer, sources });
  } catch (err) {
    console.error('[zest/ask]', err.message);
    res.status(502).json({ message: 'Zest could not answer right now. Please try again.' });
  }
});

// A user handing Zest a document for one question — not added to the shared knowledge base.
// Reuses the exact same security pipeline as a KB upload (ClamAV scan + deep inspection/audit
// via recordUpload), but skips S3 and never creates a KnowledgeDocument/KnowledgeChunk, and the
// local copy is deleted right after extraction since nothing should persist past this request.
router.post('/ask-with-file', authMiddleware, upload.single('file'), scanUploadedFile, recordUpload('zest_chat'), async (req, res) => {
  const question = (req.body.question || '').trim().slice(0, 1000);
  if (!req.file) return res.status(400).json({ message: 'A file is required' });
  if (!question) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ message: 'question is required' }); }
  if (!isZestConfigured()) { fs.unlink(req.file.path, () => {}); return res.status(503).json({ message: 'Zest is not configured yet. Ask an admin to set ANTHROPIC_API_KEY.' }); }

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

    const answer = await askZest(question, [], history, req.user.role, attachedDocText);
    await ZestQueryLog.create({ userId: req.user.id, userRole: req.user.role, question: `[attached: ${req.file.originalname}] ${question}`, answer, sourceDocIds: [] });
    res.json({ answer, sources: [] });
  } catch (err) {
    console.error('[zest/ask-with-file]', err.message);
    res.status(502).json({ message: 'Zest could not answer right now. Please try again.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

/* ── Daily lead alerts (admin only) ──────────────────────────────────────── */

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
