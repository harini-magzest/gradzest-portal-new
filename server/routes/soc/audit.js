// Who saw student data, alert channels, and the tamper-checked analyst audit trail.
const express = require('express');
const { sendServerError } = require('../../lib/httpError');
const SecurityIncident = require('../../models/SecurityIncident');
const PiiAccessLog = require('../../models/PiiAccessLog');
const AnalystAction = require('../../models/AnalystAction');
const User = require('../../models/User');
const authMiddleware = require('../../middleware/auth');
const { logAnalystAction } = require('../../lib/logAnalystAction');
const attachUserEmail = require('../../middleware/attachUserEmail');
const { verifyAuditChain } = require('../../lib/logAnalystAction');
const { sendCsv } = require('../../lib/csv');
const SuppressionRule = require('../../models/SuppressionRule');
const UploadRecord = require('../../models/UploadRecord');
const { ownerEmails } = require('../../lib/socOwners');
const { adminOnly, isObjectId, logExport } = require('./shared');

const router = express.Router();

// ── PII access audit ─────────────────────────────────────────────────────────

router.get('/pii-audit', authMiddleware, adminOnly, async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [topAccessors, recentAccesses] = await Promise.all([
      PiiAccessLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
            _id: '$accessorId',
            accessorEmail: { $first: '$accessorEmail' },
            accessorRole: { $first: '$accessorRole' },
            totalAccesses: { $sum: 1 },
            uniqueApplicants: { $addToSet: '$applicantId' },
          } },
        { $project: { accessorEmail: 1, accessorRole: 1, totalAccesses: 1, uniqueApplicants: { $size: '$uniqueApplicants' } } },
        { $sort: { uniqueApplicants: -1 } },
        { $limit: 10 },
      ]),
      PiiAccessLog.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    res.json({ period: '24h', topAccessors, recentAccesses });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// ── Alert channels ───────────────────────────────────────────────────────────

// Which out-of-band channels are configured (never the URLs or tokens) so the owner can see what will actually fire.
router.get('/alerts/status', authMiddleware, adminOnly, async (req, res) => {
  const { channelStatus } = require('../../lib/alertChannels');
  res.json({ ...channelStatus(), email: !!req.app.get('mailer') && !!(process.env.SMTP_PASS), recipients: ownerEmails().length });
});

// Sends a harmless test message to every configured channel and reports each result, so setup mistakes show up now
// and not during a real incident.
router.post('/alerts/test', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  const { notifyChannels } = require('../../lib/alertChannels');
  const result = await notifyChannels({ severity: 'critical', type: 'test' }, { kind: 'test', force: true });
  logAnalystAction({ analyst: req.user, action: 'alert_test', targetType: 'user', targetId: req.user.id, reason: 'Sent a test alert', io: req.app.get('io') });
  res.json(result);
});

// ── Analyst audit trail ───────────────────────────────────────────────────────

// Walks the whole hash chain; { ok: false, brokenAt } means a row was edited or removed.
router.get('/audit-trail/verify', authMiddleware, adminOnly, async (req, res) => {
  try {
    res.json(await verifyAuditChain());
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// Adds the analyst's name and a human-readable description of each action's target. The trail stores bare ids (an
// incident id, a user id…), which tell a reader nothing; this resolves them in a handful of batched lookups.
async function enrichAudit(actions) {
  const idsOf = (t) => [...new Set(actions.filter((a) => a.targetType === t && isObjectId(a.targetId)).map((a) => a.targetId))];
  const analystIds = [...new Set(actions.map((a) => String(a.analystId)).filter(isObjectId))];
  const [users, incidents, uploads, suppressions, analysts] = await Promise.all([
    User.find({ _id: { $in: idsOf('user') } }).select('name email').lean(),
    SecurityIncident.find({ _id: { $in: idsOf('incident') } }).select('title').lean(),
    UploadRecord.find({ _id: { $in: idsOf('upload') } }).select('originalName').lean(),
    SuppressionRule.find({ _id: { $in: idsOf('suppression') } }).select('kind value').lean(),
    User.find({ _id: { $in: analystIds } }).select('name').lean(),
  ]);
  const by = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  const U = by(users); const I = by(incidents); const F = by(uploads); const S = by(suppressions); const A = by(analysts);
  return actions.map((a) => {
    const t = String(a.targetId);
    let targetLabel = t;
    if (a.targetType === 'user') { const u = U.get(t); targetLabel = u ? `${u.name} (${u.email})` : 'a deleted account'; }
    else if (a.targetType === 'incident') targetLabel = I.get(t)?.title || 'a deleted incident';
    else if (a.targetType === 'upload') targetLabel = F.get(t)?.originalName || 'a deleted upload';
    else if (a.targetType === 'suppression') { const s = S.get(t); targetLabel = s ? `${s.kind} ${s.value}` : 'a removed suppression rule'; }
    else if (a.targetType === 'session') targetLabel = 'one signed-in device';
    return { ...a, analystName: A.get(String(a.analystId))?.name || '', targetLabel };
  });
}

router.get('/audit-trail/export.csv', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const actions = await enrichAudit(await AnalystAction.find().sort({ createdAt: -1 }).limit(5000).lean());
    logExport(req, 'audit-trail', actions.length);
    sendCsv(res, 'soc-audit-trail.csv', [
      { label: 'Time', key: 'createdAt' }, { label: 'Analyst', key: 'analystName' }, { label: 'Analyst email', key: 'analystEmail' }, { label: 'Action', key: 'action' },
      { label: 'Target type', key: 'targetType' }, { label: 'Target', key: 'targetLabel' }, { label: 'Target id', key: 'targetId' }, { label: 'Reason', key: 'reason' },
      { label: 'Hash', key: 'hash' },
    ], actions);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.get('/audit-trail', authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const actions = await enrichAudit(await AnalystAction.find().sort({ createdAt: -1 }).limit(limit).lean());
    res.json({ actions });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

module.exports = router;
