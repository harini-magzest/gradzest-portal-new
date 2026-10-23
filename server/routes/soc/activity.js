// What people do in the app: feature usage and the page / button / file trail.
const express = require('express');
const { sendServerError } = require('../../lib/httpError');
const authMiddleware = require('../../middleware/auth');
const attachUserEmail = require('../../middleware/attachUserEmail');
const { sendCsv } = require('../../lib/csv');
const UiActivity = require('../../models/UiActivity');
const UploadRecord = require('../../models/UploadRecord');
const mongoose = require('mongoose');
const { adminOnly, escapeRegex, isObjectId, searchRows, logExport, PERIOD_MS } = require('./shared');

const router = express.Router();

// ── Feature usage (what people actually use, from the UI activity trail) ──────

router.get('/feature-usage', authMiddleware, adminOnly, async (req, res) => {
  try {
    const period = PERIOD_MS[req.query.period] ? req.query.period : '7d';
    const since = new Date(Date.now() - PERIOD_MS[period]);
    const base = { createdAt: { $gte: since } };
    if (req.query.userId && isObjectId(req.query.userId)) base.userId = new mongoose.Types.ObjectId(req.query.userId);
    // Feature usage counts what people DO in the app; sign-in/out rows are shown in the trail but aren't a feature.
    const uiBase = { ...base, kind: { $nin: ['login', 'logout'] } };

    const [pages, features, users, uploads, totals] = await Promise.all([
      UiActivity.aggregate([
        { $match: { ...base, kind: 'page_view' } },
        { $group: { _id: { $cond: [{ $ne: ['$file', ''] }, '$file', '$page'] }, views: { $sum: 1 }, users: { $addToSet: '$userId' }, example: { $first: '$page' } } },
        { $project: { views: 1, users: { $size: '$users' }, example: 1 } }, { $sort: { views: -1 } }, { $limit: 15 },
      ]),
      UiActivity.aggregate([
        { $match: { ...base, kind: { $in: ['click', 'download', 'form_submit'] }, 'element.label': { $ne: '' } } },
        { $group: { _id: { file: '$file', label: '$element.label', kind: '$kind' }, uses: { $sum: 1 }, users: { $addToSet: '$userId' } } },
        { $project: { uses: 1, users: { $size: '$users' } } }, { $sort: { uses: -1 } }, { $limit: 25 },
      ]),
      UiActivity.aggregate([
        { $match: uiBase },
        { $group: { _id: '$userId', email: { $first: '$email' }, role: { $first: '$role' }, actions: { $sum: 1 }, pages: { $addToSet: '$page' }, lastActive: { $max: '$createdAt' } } },
        { $project: { email: 1, role: 1, actions: 1, distinctPages: { $size: '$pages' }, lastActive: 1 } }, { $sort: { actions: -1 } }, { $limit: 25 },
      ]),
      UploadRecord.countDocuments(base),
      UiActivity.aggregate([{ $match: uiBase }, { $group: { _id: null, events: { $sum: 1 }, users: { $addToSet: '$userId' } } }]),
    ]);

    res.json({
      period,
      totals: { events: totals[0]?.events || 0, activeUsers: totals[0]?.users?.length || 0, uploads },
      pages: pages.map((p) => ({ file: p._id, views: p.views, users: p.users, example: p.example })),
      features: features.map((f) => ({ file: f._id.file, label: f._id.label, kind: f._id.kind, uses: f.uses, users: f.users })),
      users: users.map((u) => ({ userId: u._id, email: u.email, role: u.role, actions: u.actions, distinctPages: u.distinctPages, lastActive: u.lastActive })),
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

// ── UI activity (page / button / file trail) ─────────────────────────────────

// Free-text search over the UI trail runs in memory (several searched fields are stored encrypted).
const uiRowValues = (r) => [r.element?.label, r.element?.id, r.element?.href, r.file, r.page, r.context, ...(r.files || []).map((f) => f.name)];
const searchUi = (query, q) => searchRows(UiActivity, query, q, uiRowValues);

function buildUiQuery({ userId, email, kind, page, since }) {
  const query = {};
  if (userId && isObjectId(userId)) query.userId = userId;
  if (email && email.trim()) query.email = { $in: [email.trim().slice(0, 100), email.trim().slice(0, 100).toLowerCase()] }; // exact: stored encrypted
  if (kind && kind !== 'all') query.kind = kind;
  if (page && page.trim()) query.page = new RegExp(escapeRegex(page.trim().slice(0, 100)), 'i');
  if (since) { const d = new Date(since); if (!isNaN(d)) query.createdAt = { $gt: d }; }
  return query;
}

router.get('/ui-activity/export.csv', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const uq = buildUiQuery(req.query);
    const rows = req.query.q && req.query.q.trim() ? await searchUi(uq, req.query.q) : await UiActivity.find(uq).sort({ createdAt: -1 }).limit(5000).lean();
    logExport(req, 'ui-activity', rows.length);
    sendCsv(res, 'soc-ui-activity.csv', [
      { label: 'Time', key: 'createdAt' }, { label: 'Name', key: 'name' }, { label: 'User', key: 'email' }, { label: 'Role', key: 'role' },
      { label: 'Device', value: (r) => r.device?.label || '' }, { label: 'Action', key: 'kind' }, { label: 'Page', key: 'page' }, { label: 'Source file', key: 'file' },
      { label: 'Element', value: (r) => r.element?.label || r.element?.id || r.element?.tag || '' },
      { label: 'Context', key: 'context' }, { label: 'Link', value: (r) => r.element?.href || '' },
      { label: 'Files', value: (r) => (r.files || []).map((f) => f.name).join('; ') },
      { label: 'IP', key: 'ip' },
    ], rows);
  } catch (err) {
    sendServerError(res, err);
  }
});

router.get('/ui-activity', authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 300);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    const query = buildUiQuery(req.query);
    let rows; let total; let truncated = false;
    if (req.query.q && req.query.q.trim()) {
      const matched = await searchUi(query, req.query.q);
      total = matched.length; rows = matched.slice(skip, skip + limit); truncated = matched.truncated;
    } else {
      [rows, total] = await Promise.all([
        UiActivity.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        UiActivity.countDocuments(query),
      ]);
    }
    res.json({ activity: rows, total, skip, limit, truncated, trackedRoles: require('../uiTrail').trackedRoles() });
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
