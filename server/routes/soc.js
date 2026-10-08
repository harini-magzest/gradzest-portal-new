const express = require('express');
const { sendServerError } = require('../lib/httpError');
const { execFile } = require('child_process');
const path = require('path');
const PDFDocument = require('pdfkit');
const { getCodeAnalysis } = require('../lib/codeScan');
const { getActiveFeatures } = require('../lib/activeFeatures');
const { getIpIntel } = require('../lib/ipIntel');
const router = express.Router();

const SecurityEvent = require('../models/SecurityEvent');
const RequestLog = require('../models/RequestLog');
const ActivityLog = require('../models/ActivityLog');
const SecurityIncident = require('../models/SecurityIncident');
const BlockedIp = require('../models/BlockedIp');
const PiiAccessLog = require('../models/PiiAccessLog');
const AnalystAction = require('../models/AnalystAction');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { refreshBlockedIps } = require('../middleware/ipBlock');
const { logAnalystAction } = require('../lib/logAnalystAction');
const attachUserEmail = require('../middleware/attachUserEmail');
const { logSecurityEvent } = require('../middleware/logSecurityEvent');
const { verifyAuditChain } = require('../lib/logAnalystAction');
const { sendCsv } = require('../lib/csv');
const { SLA_POLICY, CLOSED, computeSla } = require('../lib/sla');
const { parseIpEntry, buildIpMatcher } = require('../lib/ipMatch');
const { refreshSuppressions } = require('../lib/suppression');
const SuppressionRule = require('../models/SuppressionRule');
const UiActivity = require('../models/UiActivity');
const UploadRecord = require('../models/UploadRecord');
// Manual check only: a link to the file's page on virustotal.com, built from its SHA-256. Nothing is sent automatically.
const vtLink = (sha256) => `https://www.virustotal.com/gui/file/${sha256}`;
const quarantine = require('../lib/quarantine');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const mongoose = require('mongoose');
const LOCKED_BY_ADMIN_UNTIL = new Date('2099-01-01T00:00:00Z');
// An unreachable or hanging SMTP server must not hang an analyst's request: give up after a bounded wait.
const sendMailWithTimeout = (mailer, options, ms = 8000) => Promise.race([
  mailer.sendMail(options),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Mail server did not respond in time')), ms).unref?.()),
]);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''));

// The SOC exposes PII, account locks and IP blocking, so it is limited to the owner account(s) listed in
// SOC_OWNER_EMAILS (comma separated, default hameed@magzest.in) — being an admin is not enough. Application Team
// accounts have role 'admin' but are deliberately blocked from admin-level functions elsewhere (see blockAppTeam
// in admin.js), and stay blocked here too.
const { isSocOwnerEmail, ownerEmails } = require('../lib/socOwners');

async function adminOnly(req, res, next) {
  try {
    if (req.user.role !== 'admin' || req.user.isAppTeam) return res.status(403).json({ message: 'Admin only' });
    if (!req.user.email) {
      const u = await User.findById(req.user.id).select('email name').lean();
      if (u) { req.user.email = u.email; req.user.name = req.user.name || u.name; }
    }
    const email = String(req.user.email || '').toLowerCase();
    if (!isSocOwnerEmail(email)) {
      return res.status(403).json({ message: 'Not authorised for the SOC' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// Substring search over encrypted fields cannot run in MongoDB, so for the lists where it matters the newest rows
// matching the structured filters are loaded (decrypted by the model hooks) and filtered here.
const SEARCH_SCAN_CAP = 5000;
// `pick` is a list of row keys, or a function returning the values of a row to search.
function matchesText(row, q, pick) {
  const term = q.trim().slice(0, 100).toLowerCase();
  const values = typeof pick === 'function' ? pick(row) : pick.map((f) => row[f]);
  return values.some((v) => String(v ?? '').toLowerCase().includes(term));
}
async function searchRows(Model, query, q, pick) {
  const rows = await Model.find(query).sort({ createdAt: -1 }).limit(SEARCH_SCAN_CAP).lean();
  const matched = rows.filter((r) => matchesText(r, q, pick));
  // Hitting the cap means older rows were never looked at: callers pass this on so the UI can say so.
  matched.truncated = rows.length >= SEARCH_SCAN_CAP;
  return matched;
}

const SECURITY_TYPE_LABEL = {
  login_success: 'Login',
  login_failure: 'Failed login',
  login_lockout: 'Lockout',
  logout: 'Logout',
  token_invalid: 'Invalid token',
  token_expired: 'Expired token',
  password_reset: 'Password reset',
  malware_upload: 'Malware upload blocked',
  waf_block: 'WAF block',
  skyload_bot_flag: 'Skyload bot flag',
  skyload_throttle: 'Skyload throttle',
  password_reset_request: 'Password reset requested',
  privilege_change: 'Privilege change',
  data_export: 'Data export',
  bulk_delete: 'Bulk data deletion',
};

// Every CSV download from the SOC is itself a security event, so a burst of
// exports by one account can raise a mass_export incident.
function logExport(req, what, rows) {
  logSecurityEvent('data_export', {
    severity: 'info', userId: req.user.id, email: req.user.email || '', role: req.user.role,
    ip: req.ip, userAgent: req.headers['user-agent'] || '',
    message: `Exported ${rows} ${what} row${rows === 1 ? '' : 's'} as CSV`, meta: { export: what, rows },
  }).catch(() => {});
}

const PERIOD_MS = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };

// ── GET /api/soc/stats ───────────────────────────────────────────────────────
router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const period = PERIOD_MS[req.query.period] ? req.query.period : '24h';
    const since = new Date(Date.now() - PERIOD_MS[period]);

    const [
      failedLogins, activeLockouts, blockedRequests, unauthorizedRequests,
      uniqueEventIps, uniqueRequestIps, severityBreakdown, typeBreakdown, topIps, series,
      incidentsByStatus, incidentsBySeverity,
    ] = await Promise.all([
      SecurityEvent.countDocuments({ type: 'login_failure', createdAt: { $gte: since } }),
      User.countDocuments({ lockedUntil: { $gt: new Date() } }),
      RequestLog.countDocuments({ status: 429, createdAt: { $gte: since } }),
      RequestLog.countDocuments({ status: { $in: [401, 403] }, createdAt: { $gte: since } }),
      SecurityEvent.distinct('ip', { createdAt: { $gte: since }, ip: { $ne: '' } }),
      RequestLog.distinct('ip', { createdAt: { $gte: since }, ip: { $ne: '' } }),
      SecurityEvent.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      SecurityEvent.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      RequestLog.aggregate([
        { $match: { createdAt: { $gte: since }, status: { $in: [401, 403, 429] } } },
        { $group: { _id: '$ip', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 10 },
      ]),
      SecurityEvent.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: period === '24h' ? '%Y-%m-%dT%H:00:00' : '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      SecurityIncident.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      SecurityIncident.aggregate([{ $match: { status: { $in: ['open', 'investigating'] } } }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
    ]);

    const uniqueIps = new Set([...uniqueEventIps, ...uniqueRequestIps]).size;
    const toMap = (rows) => rows.reduce((acc, { _id, count }) => { acc[_id] = count; return acc; }, {});

    // Second batch: comparison against the immediately preceding window of the
    // same length, response-time metrics, backlog age, SLA breaches, most
    // targeted accounts, and which detection rules earn their keep.
    const prevSince = new Date(since.getTime() - PERIOD_MS[period]);
    const prevRange = { $gte: prevSince, $lt: since };
    const [
      prevFailedLogins, prevBlockedRequests, prevUnauthorizedRequests, incidentsCreated, prevIncidentsCreated,
      responseTimes, openIncidents, targetedAccounts, ruleRows,
    ] = await Promise.all([
      SecurityEvent.countDocuments({ type: 'login_failure', createdAt: prevRange }),
      RequestLog.countDocuments({ status: 429, createdAt: prevRange }),
      RequestLog.countDocuments({ status: { $in: [401, 403] }, createdAt: prevRange }),
      SecurityIncident.countDocuments({ createdAt: { $gte: since } }),
      SecurityIncident.countDocuments({ createdAt: prevRange }),
      SecurityIncident.find({ createdAt: { $gte: since } }).select('createdAt acknowledgedAt resolvedAt').lean(),
      SecurityIncident.find({ status: { $in: ['open', 'investigating'] } }).select('severity status createdAt acknowledgedAt').lean(),
      SecurityEvent.aggregate([
        { $match: { type: 'login_failure', email: { $ne: '' }, createdAt: { $gte: since } } },
        { $group: { _id: '$email', count: { $sum: 1 }, ips: { $addToSet: '$ip' } } },
        { $sort: { count: -1 } }, { $limit: 10 },
        { $project: { count: 1, distinctIps: { $size: '$ips' } } },
      ]),
      SecurityIncident.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { type: '$type', status: '$status' }, count: { $sum: 1 } } },
      ]),
    ]);

    const avgMs = (rows, field) => {
      const deltas = rows.filter((r) => r[field]).map((r) => new Date(r[field]) - new Date(r.createdAt));
      return deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;
    };
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const openByAge = { lt1d: 0, d1to3: 0, d3to7: 0, gt7d: 0 };
    let slaBreached = 0;
    for (const inc of openIncidents) {
      const age = now - new Date(inc.createdAt).getTime();
      if (age < dayMs) openByAge.lt1d += 1;
      else if (age < 3 * dayMs) openByAge.d1to3 += 1;
      else if (age < 7 * dayMs) openByAge.d3to7 += 1;
      else openByAge.gt7d += 1;
      const sla = computeSla(inc, now);
      if (sla.ackBreached || sla.resolveBreached) slaBreached += 1;
    }

    const rules = {};
    for (const { _id, count } of ruleRows) {
      const r = (rules[_id.type] ||= { type: _id.type, total: 0, falsePositive: 0, resolved: 0, open: 0 });
      r.total += count;
      if (_id.status === 'false_positive') r.falsePositive += count;
      else if (_id.status === 'resolved') r.resolved += count;
      else r.open += count;
    }
    const ruleEffectiveness = Object.values(rules)
      .map((r) => ({ ...r, falsePositiveRate: r.falsePositive + r.resolved ? r.falsePositive / (r.falsePositive + r.resolved) : null }))
      .sort((a, b) => b.total - a.total);

    res.json({
      period, failedLogins, activeLockouts, blockedRequests, unauthorizedRequests, uniqueIps,
      previous: {
        failedLogins: prevFailedLogins, blockedRequests: prevBlockedRequests,
        unauthorizedRequests: prevUnauthorizedRequests, incidentsCreated: prevIncidentsCreated,
      },
      incidentsCreated,
      mttaMs: avgMs(responseTimes, 'acknowledgedAt'),
      mttrMs: avgMs(responseTimes, 'resolvedAt'),
      openByAge, slaBreached,
      targetedAccounts: targetedAccounts.map((t) => ({ email: t._id, count: t.count, distinctIps: t.distinctIps })),
      ruleEffectiveness,
      severityBreakdown: toMap(severityBreakdown),
      typeBreakdown: toMap(typeBreakdown),
      topIps: topIps.map(({ _id, count }) => ({ ip: _id, count })),
      series: series.map(({ _id, count }) => ({ bucket: _id, count })),
      incidentsByStatus: toMap(incidentsByStatus),
      openIncidentsBySeverity: toMap(incidentsBySeverity),
    });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// ── GET /api/soc/stats/geo ───────────────────────────────────────────────────
// Where hostile traffic comes from. Split out of /stats because it does live
// geolocation lookups (cached an hour per IP, free-tier rate limited) and
// shouldn't slow the rest of the Overview down.
router.get('/stats/geo', authMiddleware, adminOnly, async (req, res) => {
  try {
    const period = PERIOD_MS[req.query.period] ? req.query.period : '24h';
    const since = new Date(Date.now() - PERIOD_MS[period]);
    const [failedByIp, blockedByIp] = await Promise.all([
      SecurityEvent.aggregate([
        { $match: { type: 'login_failure', ip: { $ne: '' }, createdAt: { $gte: since } } },
        { $group: { _id: '$ip', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 },
      ]),
      RequestLog.aggregate([
        { $match: { status: { $in: [401, 403, 429] }, ip: { $ne: '' }, createdAt: { $gte: since } } },
        { $group: { _id: '$ip', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 },
      ]),
    ]);
    const perIp = new Map();
    for (const { _id, count } of [...failedByIp, ...blockedByIp]) perIp.set(_id, (perIp.get(_id) || 0) + count);

    const lookups = await Promise.all([...perIp.keys()].slice(0, 20).map(async (ip) => ({ ip, intel: await getIpIntel(ip) })));
    const byCountry = new Map();
    let unresolved = 0;
    for (const { ip, intel } of lookups) {
      if (!intel.available) { unresolved += perIp.get(ip); continue; }
      const row = byCountry.get(intel.country) || { country: intel.country, countryCode: intel.countryCode, count: 0, ips: 0 };
      row.count += perIp.get(ip);
      row.ips += 1;
      byCountry.set(intel.country, row);
    }
    res.json({ period, countries: [...byCountry.values()].sort((a, b) => b.count - a.count), unresolved });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

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
    const [events, total, rawCounts] = await Promise.all([
      searching
        ? searchRows(SecurityEvent, query, req.query.q, EVENT_SEARCH_FIELDS).then((m) => ({ m }))
        : SecurityEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      searching ? null : SecurityEvent.countDocuments(query),
      SecurityEvent.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
    ]);
    const counts = rawCounts.reduce((acc, { _id, count }) => { acc[_id] = count; return acc; }, {});

    res.json({ events: searching ? events.m.slice(skip, skip + limit) : events, total: searching ? events.m.length : total, skip, limit, counts, truncated: !!(searching && events.m.truncated) });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// ── Incidents ─────────────────────────────────────────────────────────────────

const INCIDENT_SEARCH_FIELDS = ['title', 'relatedIp', 'relatedEmail'];
// assignedTo: 'me' and 'unassigned' are resolved against the caller before this runs,
// since this function has no access to req.user — see the two routes below.
function buildIncidentQuery({ status, severity, type, q, assignedTo }) {
  const query = {};
  if (status && status !== 'all') query.status = status;
  if (severity && severity !== 'all') query.severity = severity;
  if (type && type !== 'all') query.type = type;
  if (assignedTo === null) query.assignedTo = null;
  else if (assignedTo && isObjectId(assignedTo)) query.assignedTo = assignedTo;
  return query;
}
// 'me' -> the caller's id, 'unassigned' -> null (matches the query above), anything
// else passes through untouched (a specific analyst id, or undefined for "all").
function resolveAssignedTo(raw, req) {
  if (raw === 'me') return req.user.id;
  if (raw === 'unassigned') return null;
  return raw;
}

router.get('/incidents', authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    const query = buildIncidentQuery({ ...req.query, assignedTo: resolveAssignedTo(req.query.assignedTo, req) });

    let incidents; let total; let truncated = false;
    if (req.query.q && req.query.q.trim()) {
      const matched = await searchRows(SecurityIncident, query, req.query.q, INCIDENT_SEARCH_FIELDS);
      total = matched.length; truncated = matched.truncated;
      incidents = await SecurityIncident.populate(matched.slice(skip, skip + limit), { path: 'assignedTo', select: 'name email' });
    } else {
      [incidents, total] = await Promise.all([
        SecurityIncident.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
          .populate('assignedTo', 'name email').lean(),
        SecurityIncident.countDocuments(query),
      ]);
    }
    // The policy travels with the list so the client can mirror computeSla()
    // for incidents that change live over the socket, without duplicating targets.
    res.json({ incidents, total, skip, limit, slaPolicy: SLA_POLICY, truncated });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.get('/incidents/export.csv', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const iq = buildIncidentQuery({ ...req.query, assignedTo: resolveAssignedTo(req.query.assignedTo, req) });
    const base = req.query.q && req.query.q.trim()
      ? await searchRows(SecurityIncident, iq, req.query.q, INCIDENT_SEARCH_FIELDS)
      : await SecurityIncident.find(iq).sort({ createdAt: -1 }).limit(5000).lean();
    const incidents = await SecurityIncident.populate(base, { path: 'assignedTo', select: 'name email' });
    logExport(req, 'incidents', incidents.length);
    sendCsv(res, 'soc-incidents.csv', [
      { label: 'Created', key: 'createdAt' }, { label: 'Type', key: 'type' }, { label: 'Severity', key: 'severity' },
      { label: 'Status', key: 'status' }, { label: 'Title', key: 'title' }, { label: 'IP', key: 'relatedIp' },
      { label: 'Email', key: 'relatedEmail' }, { label: 'Assigned to', value: (i) => i.assignedTo?.name || '' },
      { label: 'Acknowledged', key: 'acknowledgedAt' }, { label: 'Resolved', key: 'resolvedAt' },
      { label: 'Resolution reason', key: 'resolutionReason' }, { label: 'Resolution comment', key: 'resolutionComment' },
      { label: 'SLA ack breached', value: (i) => (computeSla(i).ackBreached ? 'yes' : 'no') },
      { label: 'SLA resolve breached', value: (i) => (computeSla(i).resolveBreached ? 'yes' : 'no') },
    ], incidents);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// A single incident by id — lets the client deep-link to one (e.g. from a shared URL)
// even when it isn't on the currently loaded page of the list above. Must stay after
// the literal '/incidents/export.csv' route, or ':id' would shadow it.
router.get('/incidents/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Incident not found' });
    const incident = await SecurityIncident.findById(req.params.id).populate('assignedTo', 'name email').lean();
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    res.json({ incident, slaPolicy: SLA_POLICY });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// One-incident report: summary, SLA, the source events that triggered it,
// analyst notes, and every recorded analyst action taken on it.
router.get('/incidents/:id/report.pdf', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Incident not found' });
    const incident = await SecurityIncident.findById(req.params.id).populate('assignedTo', 'name email').lean();
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    const [events, actions] = await Promise.all([
      SecurityEvent.find({ _id: { $in: incident.sourceEventIds || [] } }).sort({ createdAt: 1 }).limit(100).lean(),
      AnalystAction.find({ targetType: 'incident', targetId: String(incident._id) }).sort({ createdAt: 1 }).lean(),
    ]);
    const sla = computeSla(incident);
    const fmt = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—');

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="incident-${incident._id}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('Security Incident Report', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(13).text(incident.title);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#333');
    [
      ['ID', String(incident._id)], ['Type', incident.type], ['Severity', incident.severity], ['Status', incident.status],
      ['Assigned to', incident.assignedTo ? `${incident.assignedTo.name} <${incident.assignedTo.email}>` : 'Unassigned'],
      ['Related IP', incident.relatedIp || '—'], ['Related account', incident.relatedEmail || '—'],
      ['Created', fmt(incident.createdAt)], ['Acknowledged', fmt(incident.acknowledgedAt)], ['Resolved', fmt(incident.resolvedAt)],
      ['Ack target', `${fmt(sla.ackDue)}${sla.ackBreached ? ' (BREACHED)' : ''}`],
      ['Resolve target', `${fmt(sla.resolveDue)}${sla.resolveBreached ? ' (BREACHED)' : ''}`],
      ['Resolution', [incident.resolutionReason, incident.resolutionComment].filter(Boolean).join(' — ') || '—'],
    ].forEach(([k, v]) => doc.text(`${k}: ${v}`));

    const section = (heading, lines) => {
      doc.moveDown(1).fontSize(13).fillColor('#000').text(heading);
      doc.moveDown(0.3).fontSize(9).fillColor('#333');
      if (!lines.length) doc.text('None recorded.');
      lines.forEach((l) => doc.text(l));
    };
    section('Triggering events', events.map((e) => `${fmt(e.createdAt)}  ${e.type}  ${e.ip || ''}  ${e.email || ''}  ${e.message || ''}`));
    section('Analyst notes', (incident.notes || []).map((n) => `${fmt(n.createdAt)}  ${n.author}: ${n.text}`));
    section('Analyst actions', actions.map((a) => `${fmt(a.createdAt)}  ${a.analystEmail}  ${a.action}  ${a.reason || ''}`));

    doc.moveDown(1).fontSize(8).fillColor('#888').text(`Generated ${new Date().toISOString()}`);
    doc.end();
  } catch (err) {
    if (!res.headersSent) sendServerError(res, err, 'Server error');
  }
});

// GET /api/soc/analysts — admins eligible to be assigned an incident.
router.get('/analysts', authMiddleware, adminOnly, async (req, res) => {
  try {
    const analysts = await User.find({ role: 'admin' }).select('name email').sort({ name: 1 }).lean();
    res.json({ analysts });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

const INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'false_positive'];
const RESOLUTION_REASONS = ['fixed', 'benign_activity', 'expected_behavior', 'testing', 'duplicate', 'other'];

// Applies a status / assignment / resolution change to ONE incident, keeping the SLA clock honest: the first analyst touch
// acknowledges, closing stamps resolvedAt, reopening clears it and the previous outcome. Shared by PATCH /incidents/:id
// and PATCH /incidents/bulk so both behave identically. Returns { error: { status, message } } or { incident }.
async function applyIncidentUpdate(id, body, actor, io) {
  if (!isObjectId(id)) return { error: { status: 404, message: 'Incident not found' } };
  const { status, assignedTo, resolutionReason, resolutionComment } = body || {};
  if (status && !INCIDENT_STATUSES.includes(status)) return { error: { status: 400, message: 'Invalid status' } };
  if (resolutionReason && !RESOLUTION_REASONS.includes(resolutionReason)) return { error: { status: 400, message: 'Invalid resolution reason' } };

  const before = await SecurityIncident.findById(id).select('status assignedTo acknowledgedAt').lean();
  if (!before) return { error: { status: 404, message: 'Incident not found' } };

  const update = {};
  if (status) update.status = status;
  if (assignedTo !== undefined) update.assignedTo = assignedTo || null;

  const now = new Date();
  const touched = (status && status !== 'open') || (assignedTo !== undefined && assignedTo);
  if (touched && !before.acknowledgedAt) update.acknowledgedAt = now;
  if (status) {
    if (CLOSED.includes(status)) {
      update.resolvedAt = CLOSED.includes(before.status) ? undefined : now;
      if (resolutionReason !== undefined) update.resolutionReason = resolutionReason;
      if (resolutionComment !== undefined) update.resolutionComment = String(resolutionComment).slice(0, 1000);
    } else {
      update.resolvedAt = null;
      update.resolutionReason = '';
      update.resolutionComment = '';
    }
    if (update.resolvedAt === undefined) delete update.resolvedAt;
  }

  const incident = await SecurityIncident.findByIdAndUpdate(id, update, { new: true }).populate('assignedTo', 'name email');

  if (status && status !== before.status) {
    const outcome = CLOSED.includes(status) && resolutionReason ? ` (${resolutionReason})` : '';
    logAnalystAction({ analyst: actor, action: 'incident_status_change', targetType: 'incident', targetId: incident._id, reason: `${before.status} → ${status}${outcome}`, io });
  }
  if (assignedTo !== undefined && String(before.assignedTo || '') !== String(assignedTo || '')) {
    logAnalystAction({ analyst: actor, action: 'incident_assigned', targetType: 'incident', targetId: incident._id, reason: assignedTo ? `Assigned to ${incident.assignedTo?.name || assignedTo}` : 'Unassigned', io });
  }
  io?.to('admin-room').emit('incident_updated', incident.toObject());
  return { incident };
}

// PATCH /api/soc/incidents/bulk { ids: [...], status?, assignedTo?, resolutionReason?, resolutionComment? } — up to 100
// incidents at once (e.g. clearing a noisy rule's false positives). Must be registered BEFORE /incidents/:id.
router.patch('/incidents/bulk', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const { ids, ...changes } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids must be a non-empty array' });
    if (ids.length > 100) return res.status(400).json({ message: 'At most 100 incidents per request' });
    if (changes.status === undefined && changes.assignedTo === undefined) return res.status(400).json({ message: 'Nothing to change: provide status and/or assignedTo' });
    const io = req.app.get('io');
    const updated = [];
    const failed = [];
    for (const id of [...new Set(ids.map(String))]) {
      const r = await applyIncidentUpdate(id, changes, req.user, io);
      if (r.error) failed.push({ id, message: r.error.message }); else updated.push(String(r.incident._id));
    }
    res.json({ updated, failed });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.patch('/incidents/:id', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const r = await applyIncidentUpdate(req.params.id, req.body, req.user, req.app.get('io'));
    if (r.error) return res.status(r.error.status).json({ message: r.error.message });
    res.json(r.incident);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.post('/incidents/:id/notes', authMiddleware, adminOnly, async (req, res) => {
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ message: 'Note text required' });
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Incident not found' });
    const incident = await SecurityIncident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    if (!incident.acknowledgedAt) incident.acknowledgedAt = new Date();

    const poster = await User.findById(req.user.id).select('name role');
    incident.notes.push({ author: poster?.name || 'Admin', authorRole: poster?.role || 'admin', text: text.trim() });
    await incident.save();
    await incident.populate('assignedTo', 'name email');

    req.app.get('io')?.to('admin-room').emit('incident_updated', incident.toObject());
    res.json(incident);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// ── Investigate ───────────────────────────────────────────────────────────────

function normalizeSecurityEvent(e) {
  return { source: 'security', type: e.type, severityOrLevel: e.severity, title: SECURITY_TYPE_LABEL[e.type] || e.type, detail: e.message || '', ip: e.ip || '', createdAt: e.createdAt };
}
function normalizeActivity(a) {
  return { source: 'activity', type: a.type, severityOrLevel: null, title: a.action, detail: a.detail || '', ip: '', createdAt: a.createdAt };
}
function normalizeRequest(r) {
  const severityOrLevel = r.status >= 500 ? 'high' : [401, 403, 429].includes(r.status) ? 'medium' : null;
  return { source: 'request', type: `${r.method}`, severityOrLevel, title: `${r.method} ${r.path} → ${r.status}`, detail: `${r.latencyMs}ms`, ip: r.ip || '', createdAt: r.createdAt };
}
// A PII read, seen from either side: the analyst who did it or the applicant it was about.
function normalizePii(p, userId) {
  const asAccessor = String(p.accessorId) === String(userId);
  return {
    source: 'pii', type: p.accessType, severityOrLevel: null,
    title: asAccessor ? `Viewed PII of ${p.applicantEmail || 'an applicant'}` : `PII viewed by ${p.accessorEmail || 'staff'}`,
    detail: (p.fieldsAccessed || []).join(', '), ip: p.ip || '', createdAt: p.createdAt,
  };
}
function normalizeAnalystAction(a) {
  return { source: 'analyst', type: a.action, severityOrLevel: null, title: `SOC action: ${a.action.replace(/_/g, ' ')}`, detail: [a.analystEmail, a.reason].filter(Boolean).join(' — '), ip: '', createdAt: a.createdAt };
}
function normalizeUi(u) {
  const where = u.file ? `${u.page} (${u.file})` : u.page;
  const what = u.kind === 'login' ? `Signed in${u.name ? ' as ' + u.name : ''}`
    : u.kind === 'logout' ? 'Signed out'
    : u.kind === 'page_view' ? 'Opened page'
    : u.kind === 'click' ? `Clicked ${u.element?.label ? '"' + u.element.label + '"' : (u.element?.tag || 'element')}`
    : u.kind === 'download' ? `Downloaded ${u.element?.label || u.element?.href || 'file'}`
    : u.kind === 'file_select' ? `Selected ${(u.files || []).map((f) => f.name).join(', ') || 'file'}`
    : `Submitted form ${u.element?.label || u.element?.id || ''}`.trim();
  const detail = (u.kind === 'login' || u.kind === 'logout') && u.device?.label ? u.device.label : where;
  return { source: 'ui', type: u.kind, severityOrLevel: null, title: what, detail, ip: u.ip || '', createdAt: u.createdAt };
}
function normalizeUpload(u) {
  const kb = Math.max(1, Math.round((u.size || 0) / 1024));
  return { source: 'upload', type: u.source, severityOrLevel: u.review?.status === 'flagged' ? 'high' : null, title: `Uploaded "${u.originalName}"`, detail: `${kb} KB · review: ${u.review?.status || 'unreviewed'}`, ip: u.ip || '', createdAt: u.createdAt };
}
function normalizeIncident(i) {
  return { source: 'incident', type: i.type, severityOrLevel: i.severity, title: `Incident opened: ${i.title}`, detail: `status: ${i.status}`, ip: i.relatedIp || '', createdAt: i.createdAt };
}

// GET /api/soc/investigate/search-users?q= — find a user by name/email to investigate.
router.get('/investigate/search-users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ users: [] });
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({ $or: [{ name: regex }, { email: regex }] })
      .select('name email role').limit(10).lean();
    res.json({ users: users.map(u => ({ id: u._id, name: u.name, email: u.email, role: u.role })) });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// One chronological view across every data source that mentions this user:
// security events, activity, API requests, PII reads (as reader or subject),
// SOC actions taken on/by them, and incidents raised about them.
router.get('/investigate/user/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    if (!isObjectId(userId)) return res.status(404).json({ message: 'User not found' });
    const user = await User.findById(userId).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [events, activity, requests, pii, actions, relatedIncidents, uiRows, uploads, uploadsCount, lastLoginRow] = await Promise.all([
      SecurityEvent.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
      ActivityLog.find({ $or: [{ studentId: userId }, { counsellorId: userId }] }).sort({ createdAt: -1 }).limit(100).lean(),
      RequestLog.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
      PiiAccessLog.find({ $or: [{ accessorId: userId }, { applicantId: userId }] }).sort({ createdAt: -1 }).limit(100).lean(),
      AnalystAction.find({ $or: [{ analystId: userId }, { targetType: 'user', targetId: String(userId) }] }).sort({ createdAt: -1 }).limit(50).lean(),
      SecurityIncident.find({ relatedUserId: userId }).sort({ createdAt: -1 }).limit(20).populate('assignedTo', 'name email').lean(),
      UiActivity.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
      UploadRecord.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
      UploadRecord.countDocuments({ userId }),
      UiActivity.findOne({ userId, kind: 'login' }).sort({ createdAt: -1 }).lean(),
    ]);

    const timeline = [
      ...events.map(normalizeSecurityEvent),
      ...uiRows.map(normalizeUi),
      ...uploads.map(normalizeUpload),
      ...activity.map(normalizeActivity),
      ...requests.map(normalizeRequest),
      ...pii.map((p) => normalizePii(p, userId)),
      ...actions.map(normalizeAnalystAction),
      ...relatedIncidents.map(normalizeIncident),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 300);

    // Never expose tokenHash — only what an analyst needs to recognise a device.
    const sessions = (user.sessions || []).map((s) => ({
      id: s._id, ip: s.ip || '', userAgent: s.userAgent || '', createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, expires: s.expires,
    }));

    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role, activeSessions: sessions.length },
      // Everything needed to contact and act on this person without leaving the page.
      profile: {
        phone: user.phone || '', status: user.status || '', isAppTeam: !!user.isAppTeam,
        joined: user.createdAt || user.joinedDate || null,
        locked: !!(user.lockedUntil && new Date(user.lockedUntil) > new Date()),
        lockedUntil: user.lockedUntil || null,
        lastLogin: (() => { const e = events.find((x) => x.type === 'login_success'); return e ? { at: e.createdAt, ip: e.ip, userAgent: e.userAgent, device: lastLoginRow?.device?.label ? lastLoginRow.device : null } : null; })(),
        lastActive: uiRows[0]?.createdAt || null,
        uploadsCount,
      },
      recentUploads: uploads.slice(0, 5).map((u) => ({ ...u, vtLink: vtLink(u.sha256) })),
      sessions,
      timeline,
      relatedIncidents,
    });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.post('/investigate/user/:id/logout-everywhere', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'User not found' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.sessions = [];
    await user.save();
    logAnalystAction({ analyst: req.user, action: 'revoke_user_sessions', targetType: 'user', targetId: user._id, reason: `Sessions revoked for ${user.email}`, io: req.app.get('io') });
    res.json({ message: 'All sessions revoked for this user.' });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// Revoke one device/session without touching the user's others.
router.delete('/investigate/user/:id/sessions/:sessionId', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    if (!isObjectId(req.params.id) || !isObjectId(req.params.sessionId)) return res.status(404).json({ message: 'Session not found' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const session = user.sessions.id(req.params.sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    const label = `${session.ip || 'unknown IP'} · ${(session.userAgent || 'unknown device').slice(0, 60)}`;
    session.deleteOne();
    await user.save();
    logAnalystAction({ analyst: req.user, action: 'revoke_session', targetType: 'session', targetId: req.params.sessionId, reason: `Revoked session for ${user.email} (${label})`, metadata: { userId: String(user._id) }, io: req.app.get('io') });
    res.json({ message: 'Session revoked.', activeSessions: user.sessions.length });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// Locks the account out of its current credentials: the password is replaced
// with an unguessable random one, every session is revoked, and the user is
// emailed a one-hour reset link (same token mechanism as "forgot password").
router.post('/investigate/user/:id/force-password-reset', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'User not found' });
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot force a reset on your own account from here — use Forgot password.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    user.sessions = [];
    await user.save();

    let emailSent = false;
    const mailer = req.app.get('mailer');
    if (mailer) {
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
      try {
        await sendMailWithTimeout(mailer, {
          from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: user.email,
          subject: 'Reset your Gradzest password',
          html: `<p>Hi ${user.name},</p><p>As a security precaution, your Gradzest password has been reset and you have been signed out everywhere. Use the link below to choose a new password (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>— The Gradzest Team</p>`,
        });
        emailSent = true;
      } catch (mailErr) {
        console.error('[soc/force-password-reset] mail error:', mailErr.message);
      }
    }
    logAnalystAction({ analyst: req.user, action: 'force_password_reset', targetType: 'user', targetId: user._id, reason: `Password reset forced for ${user.email}${emailSent ? '' : ' (reset email NOT sent)'}`, io: req.app.get('io') });
    res.json({
      emailSent,
      message: emailSent
        ? 'Password invalidated, sessions revoked, reset link emailed.'
        : 'Password invalidated and sessions revoked, but the reset email could not be sent. The user can use "Forgot password" to set a new one.',
    });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// Locks an account out immediately: sign-in is refused with a clear message and every
// session is revoked. Already-issued access tokens stay valid until they expire (15 min).
router.post('/investigate/user/:id/lock', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'User not found' });
    if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ message: 'You cannot lock your own account.' });
    const locked = req.body?.locked !== false;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.lockedUntil = locked ? LOCKED_BY_ADMIN_UNTIL : null;
    user.loginAttempts = 0;
    if (locked) user.sessions = [];
    await user.save();
    require('../lib/accountState').invalidate(user._id);
    if (locked) req.app.get('io')?.in(`user:${user._id}`).disconnectSockets(true);
    logAnalystAction({ analyst: req.user, action: locked ? 'lock_account' : 'unlock_account', targetType: 'user', targetId: user._id, reason: String(req.body?.reason || '').slice(0, 300) || (locked ? `Locked ${user.email}` : `Unlocked ${user.email}`), io: req.app.get('io') });
    res.json({ locked, message: locked ? 'Account locked and all sessions revoked.' : 'Account unlocked.' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.get('/investigate/ip/:ip', authMiddleware, adminOnly, async (req, res) => {
  try {
    const ip = req.params.ip;
    const [events, requests, intel, relatedIncidents, actions] = await Promise.all([
      SecurityEvent.find({ ip }).sort({ createdAt: -1 }).limit(150).lean(),
      RequestLog.find({ ip }).sort({ createdAt: -1 }).limit(150).lean(),
      getIpIntel(ip),
      SecurityIncident.find({ relatedIp: ip }).sort({ createdAt: -1 }).limit(20).populate('assignedTo', 'name email').lean(),
      AnalystAction.find({ targetType: 'ip', targetId: ip }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    const timeline = [
      ...events.map(normalizeSecurityEvent),
      ...requests.map(normalizeRequest),
      ...actions.map(normalizeAnalystAction),
      ...relatedIncidents.map(normalizeIncident),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 300);

    const blockRows = await BlockedIp.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }, 'ip').lean();
    const isBlocked = buildIpMatcher(blockRows.map((r) => r.ip))(ip);
    res.json({ ip, isBlocked, timeline, intel, relatedIncidents });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

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
    res.status(500).json({ message: err.message || 'Server error' });
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
    res.status(500).json({ message: err.message || 'Server error' });
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
      require('../lib/detectIncidents').raiseAnalystFlaggedUploadIncident(rec, req.user.email, io).catch((err) => console.error('[review_upload] incident failed:', err.message));
    }
    res.json({ ...rec.toObject(), vtLink: vtLink(rec.sha256) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

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
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── UI activity (page / button / file trail) ─────────────────────────────────

// Free-text search over the UI trail runs in memory (several searched fields are stored encrypted).
const uiRowValues = (r) => [r.element?.label, r.element?.id, r.element?.href, r.file, r.page, r.context, ...(r.files || []).map((f) => f.name)];
const searchUi = (query, q) => searchRows(UiActivity, query, q, uiRowValues);

function buildUiQuery({ userId, email, kind, q, page, since }) {
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
    res.status(500).json({ message: err.message || 'Server error' });
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
    res.json({ activity: rows, total, skip, limit, truncated, trackedRoles: require('./uiTrail').trackedRoles() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── Blocked IPs ───────────────────────────────────────────────────────────────

const MIN_IPV4_PREFIX = 8;   // refuse ranges wider than a /8 — that's a self-inflicted outage
const MIN_IPV6_PREFIX = 32;

// Validates one block target (single IP or CIDR). Returns { value } or { error }.
function checkBlockTarget(raw, req) {
  const p = parseIpEntry(raw);
  if (!p.ok) return { error: 'Not a valid IP address or CIDR range' };
  if (p.prefix !== null && p.prefix < (p.family === 4 ? MIN_IPV4_PREFIX : MIN_IPV6_PREFIX)) {
    return { error: `Range too wide (minimum /${p.family === 4 ? MIN_IPV4_PREFIX : MIN_IPV6_PREFIX})` };
  }
  // Locking yourself out of the SOC dashboard is never intended.
  if (buildIpMatcher([p.value])(req.ip)) return { error: 'This would block your own IP address' };
  return { value: p.value };
}

function expiryFromHours(hours) {
  const h = Number(hours);
  return Number.isFinite(h) && h > 0 ? new Date(Date.now() + Math.min(h, 24 * 365) * 3600 * 1000) : null;
}

router.get('/blocked-ips', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await BlockedIp.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
      .sort({ createdAt: -1 }).populate('blockedBy', 'name email').lean();
    res.json({ blockedIps: rows });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.post('/blocked-ips', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  const { ip, reason, expiresInHours } = req.body || {};
  if (!ip) return res.status(400).json({ message: 'IP address is required' });
  const target = checkBlockTarget(ip, req);
  if (target.error) return res.status(400).json({ message: target.error });
  try {
    const expiresAt = expiryFromHours(expiresInHours);
    const row = await BlockedIp.findOneAndUpdate(
      { ip: target.value },
      { ip: target.value, reason: reason || '', blockedBy: req.user.id, expiresAt },
      { upsert: true, new: true },
    );
    await refreshBlockedIps();
    logAnalystAction({ analyst: req.user, action: 'block_ip', targetType: 'ip', targetId: target.value, reason: [reason, expiresAt && `until ${expiresAt.toISOString()}`].filter(Boolean).join(' — '), io: req.app.get('io') });
    res.json(row);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// Block many addresses/ranges in one go (pasted list). Invalid or unsafe
// entries are reported back individually; the rest are still applied.
router.post('/blocked-ips/bulk', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  const { ips, reason, expiresInHours } = req.body || {};
  if (!Array.isArray(ips) || !ips.length) return res.status(400).json({ message: 'Provide a non-empty list of IPs' });
  if (ips.length > 200) return res.status(400).json({ message: 'At most 200 entries per request' });
  try {
    const expiresAt = expiryFromHours(expiresInHours);
    const blocked = [];
    const rejected = [];
    for (const raw of [...new Set(ips.map((v) => String(v).trim()).filter(Boolean))]) {
      const target = checkBlockTarget(raw, req);
      if (target.error) { rejected.push({ ip: raw, reason: target.error }); continue; }
      await BlockedIp.findOneAndUpdate(
        { ip: target.value },
        { ip: target.value, reason: reason || '', blockedBy: req.user.id, expiresAt },
        { upsert: true },
      );
      blocked.push(target.value);
    }
    await refreshBlockedIps();
    if (blocked.length) {
      logAnalystAction({ analyst: req.user, action: 'bulk_block_ip', targetType: 'ip', targetId: blocked.length === 1 ? blocked[0] : `${blocked.length} entries`, reason: reason || '', metadata: { blocked, expiresAt }, io: req.app.get('io') });
    }
    res.json({ blocked, rejected });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.delete('/blocked-ips/:ip', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    await BlockedIp.deleteOne({ ip: req.params.ip });
    await refreshBlockedIps();
    logAnalystAction({ analyst: req.user, action: 'unblock_ip', targetType: 'ip', targetId: req.params.ip, io: req.app.get('io') });
    res.json({ message: 'IP unblocked' });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// ── Suppression rules (incident allowlist) ───────────────────────────────────

router.get('/suppressions', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await SuppressionRule.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
      .sort({ createdAt: -1 }).populate('createdBy', 'name email').lean();
    res.json({ suppressions: rows });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.post('/suppressions', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  const { kind, value, incidentTypes, reason, expiresInHours } = req.body || {};
  if (!['ip', 'email'].includes(kind)) return res.status(400).json({ message: 'kind must be "ip" or "email"' });
  if (incidentTypes !== undefined && (!Array.isArray(incidentTypes) || incidentTypes.some((t) => typeof t !== 'string'))) {
    return res.status(400).json({ message: 'incidentTypes must be an array of strings' });
  }
  let normalized;
  if (kind === 'ip') {
    const p = parseIpEntry(value);
    if (!p.ok) return res.status(400).json({ message: 'Not a valid IP address or CIDR range' });
    normalized = p.value;
  } else {
    normalized = String(value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return res.status(400).json({ message: 'Not a valid email address' });
  }
  try {
    const rule = await SuppressionRule.create({
      kind, value: normalized, incidentTypes: incidentTypes || [], reason: String(reason || '').slice(0, 300),
      createdBy: req.user.id, expiresAt: expiryFromHours(expiresInHours),
    });
    await refreshSuppressions();
    logAnalystAction({ analyst: req.user, action: 'add_suppression', targetType: 'suppression', targetId: rule._id, reason: `${kind} ${normalized}${incidentTypes?.length ? ` for ${incidentTypes.join(', ')}` : ''}${reason ? ` — ${reason}` : ''}`, io: req.app.get('io') });
    res.status(201).json(rule);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.delete('/suppressions/:id', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Suppression rule not found' });
    const rule = await SuppressionRule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ message: 'Suppression rule not found' });
    await refreshSuppressions();
    logAnalystAction({ analyst: req.user, action: 'remove_suppression', targetType: 'suppression', targetId: rule._id, reason: `${rule.kind} ${rule.value}`, io: req.app.get('io') });
    res.json({ message: 'Suppression removed' });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

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
  const { channelStatus } = require('../lib/alertChannels');
  res.json({ ...channelStatus(), email: !!req.app.get('mailer') && !!(process.env.SMTP_PASS), recipients: ownerEmails().length });
});

// Sends a harmless test message to every configured channel and reports each result, so setup mistakes show up now
// and not during a real incident.
router.post('/alerts/test', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  const { notifyChannels } = require('../lib/alertChannels');
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

// ── Posture ───────────────────────────────────────────────────────────────────

let postureCache = null;
let postureCacheAt = 0;
const POSTURE_CACHE_MS = 60 * 60 * 1000; // 1 hour — npm audit is slow and hits the network

function runNpmAudit(cwd) {
  return new Promise((resolve) => {
    // shell: true — on Windows `npm` resolves to npm.cmd, which execFile can't
    // launch directly without going through a shell (fails with ENOENT otherwise).
    execFile('npm', ['audit', '--json'], { cwd, timeout: 30000, maxBuffer: 10 * 1024 * 1024, shell: true }, (err, stdout) => {
      // npm audit exits non-zero when vulnerabilities are found — that's not a
      // failure, the JSON is still on stdout. Only a genuinely empty stdout is a failure.
      if (!stdout) return resolve({ error: err?.message || 'npm audit produced no output' });
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ error: 'Failed to parse npm audit output' });
      }
    });
  });
}

// Known-incomplete work — hand-maintained deliberately, so it's visible on the
// dashboard itself rather than only living in
// chat history. Update/remove an item here the moment it's actually closed
// out — a stale "known gap" that's secretly fixed is misleading.
const KNOWN_GAPS = [
  {
    label: 'Malware scanning: live-fire detection unverified',
    detail: 'ClamAV engine + clamd daemon are real and verified fast (~60ms/scan), and the block/log/quarantine response path is proven against a simulated detection. Actually catching a real malicious file on this dev machine is still unconfirmed — Windows Defender intercepts the EICAR test file before ClamAV can read it, and a Defender exclusion to work around that hasn’t taken effect yet.',
  },
  {
    label: 'clamd persistence on this dev machine is a workaround, not a real service',
    detail: 'The app auto-spawns clamd on boot if it isn’t already running, since installing it as a real Windows service needs admin rights this environment doesn’t have. Fine for local dev; a real deployment (e.g. Linux/EC2 with root) should run it as a proper supervised systemd service instead.',
  },
  {
    label: 'No edge WAF / DDoS protection (still impossible without real network-edge infra)',
    detail: 'The in-app WAF (server/middleware/wafRules.js) plus Skyload (server/middleware/skyload.js — adaptive connection throttling, bot/anomaly scoring, IP reputation) cover payload-level attacks and application-layer abuse, verified live. Neither can defend against volumetric/DDoS traffic — that requires absorbing attack traffic across distributed network-edge infrastructure before it reaches this single server, which no application code running on that same server can do. Real edge protection (e.g. Cloudflare) still isn’t set up; a domain was deliberately not purchased for this, so it stays deferred until a real server (EC2) exists to protect.',
  },
  {
    label: 'S3 upload support is built but untested against a real bucket',
    detail: 'server/lib/uploadToS3.js and server/middleware/uploadToS3IfConfigured.js are real, wired into all three upload routes (students, counselors, chat), and activate automatically once AWS_REGION + AWS_S3_BUCKET are set. Until then it’s a verified no-op — uploads stay on local disk exactly as before. The S3 path itself hasn’t been exercised against a real bucket since no AWS credentials are available in this environment.',
  },
];

router.get('/posture', authMiddleware, adminOnly, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    if (!forceRefresh && postureCache && Date.now() - postureCacheAt < POSTURE_CACHE_MS) {
      return res.json({ ...postureCache, cached: true });
    }

    const [rootAudit, serverAudit] = await Promise.all([
      runNpmAudit(path.join(__dirname, '..', '..')),
      runNpmAudit(path.join(__dirname, '..')),
    ]);

    postureCache = {
      checkedAt: new Date().toISOString(),
      dependencyAudit: {
        frontend: rootAudit.metadata?.vulnerabilities || rootAudit.error || {},
        backend: serverAudit.metadata?.vulnerabilities || serverAudit.error || {},
      },
      knownGaps: KNOWN_GAPS,
      activeFeatures: getActiveFeatures(),
      codeAnalysis: getCodeAnalysis(forceRefresh),
    };
    postureCacheAt = Date.now();

    res.json({ ...postureCache, cached: false });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

module.exports = router;
module.exports.adminOnly = adminOnly; // reused by routes/socExtras.js so every SOC route shares one gate
