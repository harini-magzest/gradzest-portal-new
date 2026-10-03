const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const { adminOnly } = require('./soc'); // the one owner gate every SOC route uses
const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const RequestLog = require('../models/RequestLog');
const AnalystAction = require('../models/AnalystAction');
const UploadRecord = require('../models/UploadRecord');
const BlockedIp = require('../models/BlockedIp');
const User = require('../models/User');
const { computeSla, SLA_POLICY } = require('../lib/sla');
const { buildIpMatcher, parseIpEntry } = require('../lib/ipMatch');

const DAY = 24 * 60 * 60 * 1000;
const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''));
const ADMIN_LOCK_FROM_YEAR = 2090;

async function activeBlocklistMatcher() {
  const rows = await BlockedIp.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }, 'ip').lean();
  return { matches: buildIpMatcher(rows.map((r) => r.ip)), count: rows.length };
}

// ── GET /api/soc/attention ────────────────────────────────────────────────────
// "What needs a human right now": the incidents nobody has picked up, the accounts and IPs behaving worst in the last
// 24 hours, locked accounts, and uploads waiting for a verdict. Drives the Overview's "Needs attention" card and the
// Investigate tab's starting point (so it never opens as an empty search box).
router.get('/attention', authMiddleware, adminOnly, async (req, res) => {
  try {
    const now = Date.now();
    const since = new Date(now - DAY);
    const noisyTypes = ['login_failure', 'login_lockout', 'waf_block', 'skyload_bot_flag', 'token_invalid', 'privilege_change', 'data_export', 'malware_upload'];

    const [openIncidents, userEvents, ipEvents, ipRequests, locked, flaggedUploads, needReview, unreviewed, blocklist] = await Promise.all([
      SecurityIncident.find({ status: { $in: ['open', 'investigating'] } }).sort({ createdAt: -1 }).limit(500)
        .select('type severity status title relatedIp relatedEmail relatedUserId createdAt acknowledgedAt assignedTo').lean(),
      SecurityEvent.aggregate([
        { $match: { createdAt: { $gte: since }, userId: { $ne: null }, type: { $in: noisyTypes } } },
        { $group: { _id: '$userId', events: { $sum: 1 }, failedLogins: { $sum: { $cond: [{ $eq: ['$type', 'login_failure'] }, 1, 0] } }, last: { $max: '$createdAt' } } },
        { $sort: { events: -1 } }, { $limit: 25 },
      ]),
      SecurityEvent.aggregate([
        { $match: { createdAt: { $gte: since }, ip: { $ne: '' }, type: { $in: noisyTypes } } },
        { $group: { _id: '$ip', events: { $sum: 1 }, last: { $max: '$createdAt' } } },
        { $sort: { events: -1 } }, { $limit: 25 },
      ]),
      RequestLog.aggregate([
        { $match: { createdAt: { $gte: since }, ip: { $ne: '' }, status: { $in: [401, 403, 429] } } },
        { $group: { _id: '$ip', requests: { $sum: 1 } } }, { $sort: { requests: -1 } }, { $limit: 25 },
      ]),
      User.find({ lockedUntil: { $gt: new Date() } }).select('name email role lockedUntil').limit(10).lean(),
      UploadRecord.countDocuments({ 'review.status': 'flagged' }),
      UploadRecord.countDocuments({ $or: [{ 'inspection.risk': { $in: ['medium', 'high'] } }, { quarantined: true }] }),
      UploadRecord.countDocuments({ 'review.status': { $in: [null, 'unreviewed'] } }),
      activeBlocklistMatcher(),
    ]);

    // incidents
    const slaOf = (i) => computeSla(i, now);
    const openList = openIncidents.filter((i) => i.status === 'open' || i.status === 'investigating');
    const unacked = openList
      .filter((i) => i.status === 'open' && !i.acknowledgedAt && SEV_RANK[i.severity] >= SEV_RANK.high)
      .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || new Date(a.createdAt) - new Date(b.createdAt));
    const incidentsByUser = new Map(); const incidentsByIp = new Map();
    for (const i of openList) {
      if (i.relatedUserId) incidentsByUser.set(String(i.relatedUserId), (incidentsByUser.get(String(i.relatedUserId)) || 0) + 1);
      if (i.relatedIp) incidentsByIp.set(i.relatedIp, (incidentsByIp.get(i.relatedIp) || 0) + 1);
    }

    // accounts: ranked by recent bad activity, with open incidents weighted heavily
    const userIds = new Set([...userEvents.map((u) => String(u._id)), ...incidentsByUser.keys()]);
    const userDocs = await User.find({ _id: { $in: [...userIds].filter(isObjectId) } }).select('name email role lockedUntil').lean();
    const userById = new Map(userDocs.map((u) => [String(u._id), u]));
    const evByUser = new Map(userEvents.map((u) => [String(u._id), u]));
    const accounts = [...userIds].map((id) => {
      const u = userById.get(id); const ev = evByUser.get(id);
      if (!u) return null;
      const events = ev?.events || 0; const open = incidentsByUser.get(id) || 0;
      return { userId: id, name: u.name, email: u.email, role: u.role, events24h: events, failedLogins24h: ev?.failedLogins || 0, openIncidents: open, lastSeen: ev?.last || null, score: events + 5 * open };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 6);

    // IPs: security events + rejected requests + open incidents
    const ipScore = new Map();
    const bump = (ip, k, n) => { const e = ipScore.get(ip) || { ip, events24h: 0, rejected24h: 0, openIncidents: 0, lastSeen: null }; e[k] = n; ipScore.set(ip, e); return e; };
    for (const e of ipEvents) { const x = bump(e._id, 'events24h', e.events); x.lastSeen = e.last; }
    for (const r of ipRequests) bump(r._id, 'rejected24h', r.requests);
    for (const [ip, n] of incidentsByIp) bump(ip, 'openIncidents', n);
    const ips = [...ipScore.values()]
      .map((e) => ({ ...e, blocked: blocklist.matches(e.ip), score: e.events24h + e.rejected24h + 5 * e.openIncidents }))
      .sort((a, b) => b.score - a.score).slice(0, 6);

    res.json({
      generatedAt: new Date(now).toISOString(),
      counts: {
        openCritical: openList.filter((i) => i.severity === 'critical').length,
        openTotal: openList.length,
        unacknowledged: unacked.length,
        slaBreached: openList.filter((i) => { const s = slaOf(i); return s.ackBreached || s.resolveBreached; }).length,
        flaggedUploads, uploadsNeedReview: needReview, uploadsUnreviewed: unreviewed,
        lockedAccounts: locked.length, blockedIps: blocklist.count,
      },
      unacknowledged: unacked.slice(0, 6).map((i) => ({
        _id: i._id, title: i.title, severity: i.severity, type: i.type, createdAt: i.createdAt, relatedIp: i.relatedIp || '', relatedEmail: i.relatedEmail || '',
        ackDue: slaOf(i).ackDue, ackBreached: slaOf(i).ackBreached,
      })),
      accounts, ips,
      locked: locked.map((u) => ({ userId: String(u._id), name: u.name, email: u.email, role: u.role, lockedUntil: u.lockedUntil, byAdmin: new Date(u.lockedUntil).getFullYear() >= ADMIN_LOCK_FROM_YEAR })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── GET /api/soc/incidents/:id/detail ─────────────────────────────────────────
// Everything an analyst wants on one screen: the incident with its SLA, the evidence behind it, who/what it concerns,
// the other incidents involving the same IP or account, and every action already taken on it.
router.get('/incidents/:id/detail', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Incident not found' });
    const incident = await SecurityIncident.findById(req.params.id).populate('assignedTo', 'name email').lean();
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    const created = new Date(incident.createdAt).getTime();
    const recorded = incident.sourceEventIds?.length
      ? await SecurityEvent.find({ _id: { $in: incident.sourceEventIds } }).sort({ createdAt: -1 }).limit(25).lean() : [];
    // Some rules don't record their triggering events; show what the same IP / account did around the time instead.
    const around = { createdAt: { $gte: new Date(created - 6 * 3600e3), $lte: new Date(created + 6 * 3600e3) } };
    const ors = [incident.relatedIp && { ip: incident.relatedIp }, incident.relatedUserId && { userId: incident.relatedUserId }].filter(Boolean);
    const matched = recorded.length || !ors.length ? [] : await SecurityEvent.find({ ...around, $or: ors }).sort({ createdAt: -1 }).limit(25).lean();

    const relatedOr = [incident.relatedIp && { relatedIp: incident.relatedIp }, incident.relatedUserId && { relatedUserId: incident.relatedUserId }].filter(Boolean);
    const [actions, related, subject, blocklist] = await Promise.all([
      AnalystAction.find({ targetType: 'incident', targetId: String(incident._id) }).sort({ createdAt: -1 }).limit(30).lean(),
      relatedOr.length ? SecurityIncident.find({ _id: { $ne: incident._id }, $or: relatedOr }).sort({ createdAt: -1 }).limit(6).select('title severity status type createdAt').lean() : [],
      incident.relatedUserId ? User.findById(incident.relatedUserId).select('name email role phone').lean() : null,
      activeBlocklistMatcher(),
    ]);

    res.json({
      incident,
      sla: { ...computeSla(incident), policy: SLA_POLICY[incident.severity] || SLA_POLICY.medium },
      evidence: { kind: recorded.length ? 'recorded' : matched.length ? 'matched' : 'none', events: recorded.length ? recorded : matched },
      subject: subject ? { id: String(subject._id), name: subject.name, email: subject.email, role: subject.role, phone: subject.phone || '' } : null,
      ipBlocked: incident.relatedIp ? blocklist.matches(incident.relatedIp) : false,
      related,
      actions: actions.map((a) => ({ _id: a._id, action: a.action, analystEmail: a.analystEmail, reason: a.reason, createdAt: a.createdAt })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── GET /api/soc/search?q= ────────────────────────────────────────────────────
// One box for everything: people, IPs, incidents and uploads. Fields stored encrypted can't be substring-searched in the
// database, so the newest few hundred incidents/uploads are loaded (decrypted by the model hooks) and filtered here.
const SCAN = 600;
router.get('/search', authMiddleware, adminOnly, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.json({ users: [], ips: [], incidents: [], uploads: [] });
    const term = q.toLowerCase();
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const has = (...vals) => vals.some((v) => String(v ?? '').toLowerCase().includes(term));

    const [users, incidentRows, uploadRows] = await Promise.all([
      User.find({ $or: [{ name: rx }, { email: rx }] }).select('name email role').limit(6).lean(),
      SecurityIncident.find().sort({ createdAt: -1 }).limit(SCAN).select('title type severity status relatedIp relatedEmail createdAt').lean(),
      UploadRecord.find().sort({ createdAt: -1 }).limit(SCAN).select('originalName email sha256 role review createdAt').lean(),
    ]);

    // An IP is looked up exactly (it is stored encrypted); show it if it is valid, so any address can be investigated.
    const ips = [];
    if (parseIpEntry(q).ok) {
      const ip = parseIpEntry(q).value;
      const [events, blocklist] = await Promise.all([SecurityEvent.countDocuments({ ip }), activeBlocklistMatcher()]);
      ips.push({ ip, events, blocked: blocklist.matches(ip) });
    }

    res.json({
      users: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role })),
      ips,
      incidents: incidentRows.filter((i) => has(i.title, i.relatedIp, i.relatedEmail, i.type?.replace(/_/g, ' '))).slice(0, 6)
        .map((i) => ({ _id: i._id, title: i.title, severity: i.severity, status: i.status, createdAt: i.createdAt })),
      uploads: uploadRows.filter((u) => has(u.originalName, u.email, u.sha256)).slice(0, 6)
        .map((u) => ({ _id: u._id, originalName: u.originalName, email: u.email, role: u.role, review: u.review?.status || 'unreviewed', createdAt: u.createdAt })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
