// The security event feed and its CSV export.
const express = require('express');
const { sendServerError } = require('../../lib/httpError');
const SecurityEvent = require('../../models/SecurityEvent');
const authMiddleware = require('../../middleware/auth');
const attachUserEmail = require('../../middleware/attachUserEmail');
const { sendCsv } = require('../../lib/csv');
const { adminOnly, searchRows, logExport } = require('./shared');

const router = express.Router();

// ── GET /api/soc/events ──────────────────────────────────────────────────────
const EVENT_SEARCH_FIELDS = ['email', 'ip', 'message'];
// Free-text `q` is not part of the query: email/ip/message are stored encrypted, so it is applied in memory (searchRows).
function buildEventQuery({ since, type, severity }) {
  const query = {};
  if (since) query.createdAt = { $gt: new Date(since) };
  if (type && type !== 'all') query.type = type;
  if (severity && severity !== 'all') query.severity = severity;
  return query;
}

router.get('/events/export.csv', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const eq = buildEventQuery(req.query);
    const events = req.query.q && req.query.q.trim()
      ? await searchRows(SecurityEvent, eq, req.query.q, EVENT_SEARCH_FIELDS)
      : await SecurityEvent.find(eq).sort({ createdAt: -1 }).limit(5000).lean();
    logExport(req, 'events', events.length);
    sendCsv(res, 'soc-events.csv', [
      { label: 'Time', key: 'createdAt' }, { label: 'Type', key: 'type' }, { label: 'Severity', key: 'severity' },
      { label: 'Email', key: 'email' }, { label: 'Role', key: 'role' }, { label: 'IP', key: 'ip' },
      { label: 'User agent', key: 'userAgent' }, { label: 'Message', key: 'message' },
    ], events);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.get('/events', authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    const query = buildEventQuery(req.query);

    const searching = req.query.q && req.query.q.trim();
    // The per-type totals cover the whole collection (up to six months of events) and nothing in the dashboard reads them,
    // yet they were computed again for every page of the feed and every keystroke in its filters. Opt in with ?counts=1.
    const wantCounts = req.query.counts === '1';
    const [events, total, rawCounts] = await Promise.all([
      searching
        ? searchRows(SecurityEvent, query, req.query.q, EVENT_SEARCH_FIELDS).then((m) => ({ m }))
        : SecurityEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      searching ? null : SecurityEvent.countDocuments(query),
      wantCounts ? SecurityEvent.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]) : null,
    ]);

    const body = { events: searching ? events.m.slice(skip, skip + limit) : events, total: searching ? events.m.length : total, skip, limit, truncated: !!(searching && events.m.truncated) };
    if (rawCounts) body.counts = rawCounts.reduce((acc, { _id, count }) => { acc[_id] = count; return acc; }, {});
    res.json(body);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

module.exports = router;
