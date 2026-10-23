// Uploaded documents: the review list, manual VirusTotal review and quarantine.
const express = require('express');
const { sendServerError } = require('../../lib/httpError');
const authMiddleware = require('../../middleware/auth');
const { logAnalystAction } = require('../../lib/logAnalystAction');
const attachUserEmail = require('../../middleware/attachUserEmail');
const UploadRecord = require('../../models/UploadRecord');
const quarantine = require('../../lib/quarantine');
const { adminOnly, isObjectId, searchRows, vtLink } = require('./shared');

const router = express.Router();

// ── Uploaded documents (manual VirusTotal review) ──────────────────────────────────────────

router.get('/uploads', authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    const { userId, risk, q } = req.query;
    const query = {};
    if (userId && isObjectId(userId)) query.userId = userId;
    if (risk === 'flagged') query['review.status'] = 'flagged';
    else if (risk === 'clean') query['review.status'] = 'clean';
    else if (risk === 'unreviewed') query['review.status'] = { $in: [null, 'unreviewed'] }; // null also matches records written before reviews existed
    else if (risk === 'review') query.$or = [{ 'inspection.risk': { $in: ['medium', 'high'] } }, { quarantined: true }];
    const searching = q && q.trim();
    const [rows, total, byStatus, needsReview] = await Promise.all([
      searching
        ? searchRows(UploadRecord, query, q, ['originalName', 'email', 'sha256']).then((m) => ({ m }))
        : UploadRecord.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      searching ? null : UploadRecord.countDocuments(query),
      UploadRecord.aggregate([{ $group: { _id: { $ifNull: ['$review.status', 'unreviewed'] }, count: { $sum: 1 } } }]),
      UploadRecord.countDocuments({ $or: [{ 'inspection.risk': { $in: ['medium', 'high'] } }, { quarantined: true }] }),
    ]);
    const list = searching ? rows.m.slice(skip, skip + limit) : rows;
    res.json({
      needsReview,
      uploads: list.map((u) => ({ ...u, vtLink: vtLink(u.sha256) })),
      total: searching ? rows.m.length : total, skip, limit, truncated: !!(searching && rows.m.truncated),
      summary: byStatus.reduce((acc, { _id, count }) => { acc[_id] = count; return acc; }, {}),
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Quarantine moves the stored file out of the served /uploads folder (so its link stops working);
// restore puts it back; purge deletes it for good. Files blocked at upload were never attached to a
// profile, so they can be purged but not restored.
router.post('/uploads/:id/quarantine', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Upload not found' });
    const action = req.body?.action;
    if (!['quarantine', 'restore', 'purge'].includes(action)) return res.status(400).json({ message: 'action must be quarantine, restore or purge' });
    const rec = await UploadRecord.findById(req.params.id);
    if (!rec) return res.status(404).json({ message: 'Upload not found' });

    let result;
    if (action === 'quarantine') {
      if (rec.quarantined) return res.status(409).json({ message: 'Already quarantined.' });
      result = quarantine.quarantineStored(rec.storedName);
      if (result.ok) { rec.quarantined = true; rec.quarantinedAt = new Date(); rec.quarantineReason = String(req.body?.reason || 'Quarantined by analyst').slice(0, 300); }
    } else if (action === 'restore') {
      if (!rec.quarantined) return res.status(409).json({ message: 'This file is not quarantined.' });
      if (rec.blocked) return res.status(409).json({ message: 'This file was blocked at upload and never attached to a profile, so it cannot be restored. Ask the user to upload a clean copy.' });
      result = quarantine.restoreStored(rec.storedName);
      if (result.ok) { rec.quarantined = false; rec.quarantinedAt = null; rec.quarantineReason = ''; }
    } else {
      if (!rec.quarantined) return res.status(409).json({ message: 'Quarantine the file first; only quarantined files can be deleted.' });
      result = quarantine.purgeQuarantined(rec.storedName);
      if (result.ok) rec.purgedAt = new Date();
    }
    if (!result.ok) return res.status(409).json({ message: result.reason });

    await rec.save();
    const io = req.app.get('io');
    io?.to('admin-room').emit('upload_updated', rec.toObject());
    logAnalystAction({ analyst: req.user, action: `${action}_upload`, targetType: 'upload', targetId: rec._id, reason: `${rec.originalName}${req.body?.reason ? ' — ' + String(req.body.reason).slice(0, 200) : ''}`, io });
    res.json({ ...rec.toObject(), vtLink: vtLink(rec.sha256) });
  } catch (err) {
    sendServerError(res, err);
  }
});

// The analyst opened this file's hash on virustotal.com and records what they found.
// Flagging opens an incident (once) so the finding is visible and tracked; it does not move the file —
// use Quarantine for that.
router.post('/uploads/:id/review', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Upload not found' });
    const status = req.body?.status;
    if (!['clean', 'flagged', 'unreviewed'].includes(status)) return res.status(400).json({ message: 'status must be clean, flagged or unreviewed' });
    const rec = await UploadRecord.findById(req.params.id);
    if (!rec) return res.status(404).json({ message: 'Upload not found' });

    const wasFlagged = rec.review?.status === 'flagged';
    rec.review = {
      status,
      by: status === 'unreviewed' ? '' : req.user.email || '',
      at: status === 'unreviewed' ? null : new Date(),
      note: status === 'unreviewed' ? '' : String(req.body?.note || '').slice(0, 500),
    };
    await rec.save();

    const io = req.app.get('io');
    io?.to('admin-room').emit('upload_updated', rec.toObject());
    logAnalystAction({ analyst: req.user, action: 'review_upload', targetType: 'upload', targetId: rec._id, reason: `${rec.originalName} → ${status}${rec.review.note ? ' — ' + rec.review.note : ''}`, io });
    if (status === 'flagged' && !wasFlagged) {
      require('../../lib/detectIncidents').raiseAnalystFlaggedUploadIncident(rec, req.user.email, io).catch((err) => console.error('[review_upload] incident failed:', err.message));
    }
    res.json({ ...rec.toObject(), vtLink: vtLink(rec.sha256) });
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
