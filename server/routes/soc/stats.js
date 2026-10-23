// Overview numbers: the KPI cards, charts and insight cards, and where hostile traffic comes from.
const express = require('express');
const { sendServerError } = require('../../lib/httpError');
const { getIpIntel } = require('../../lib/ipIntel');
const SecurityEvent = require('../../models/SecurityEvent');
const RequestLog = require('../../models/RequestLog');
const SecurityIncident = require('../../models/SecurityIncident');
const User = require('../../models/User');
const authMiddleware = require('../../middleware/auth');
const { computeSla } = require('../../lib/sla');
const { adminOnly, PERIOD_MS } = require('./shared');

const router = express.Router();

// ── GET /api/soc/stats ───────────────────────────────────────────────────────
// Every hour (24h) or day (7d/30d) from `since` to now, zero where nothing happened. The aggregation only returns
// buckets that had events, so a quiet day drew a lone dot and a gap read as a straight line between busy hours.
// Keys match the $dateToString formats in /stats, which are UTC.
function fillSeries(rows, since, hourly) {
  const counts = new Map(rows.map(({ _id, count }) => [_id, count]));
  const key = (d) => (hourly ? `${d.toISOString().slice(0, 13)}:00:00` : d.toISOString().slice(0, 10));
  const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const start = new Date(since);
  if (hourly) start.setUTCMinutes(0, 0, 0); else start.setUTCHours(0, 0, 0, 0);
  const out = [];
  for (let t = start.getTime(); t <= Date.now(); t += step) {
    const bucket = key(new Date(t));
    out.push({ bucket, count: counts.get(bucket) || 0 });
  }
  return out;
}

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
      series: fillSeries(series, since, period === '24h'),
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

module.exports = router;
