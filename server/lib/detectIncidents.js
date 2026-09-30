// Threshold-based "threat analyst" detection rules over the platform's own
// data — there's no external threat intel here, so detection means: did this
// event, combined with recent history, cross a rate/frequency threshold that's
// worth an analyst's attention? Each rule is idempotent — it reuses an existing
// `open` incident for the same subject within the detection window instead of
// spamming a new incident per triggering event.

const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const { sendCriticalIncidentAlert } = require('./criticalAlert');
const { getIpIntel } = require('./ipIntel');

const BRUTE_FORCE_WINDOW_MS = 10 * 60 * 1000;
const BRUTE_FORCE_THRESHOLD = 5;
const SUSPICIOUS_IP_WINDOW_MS = 10 * 60 * 1000;
const SUSPICIOUS_IP_THRESHOLD = 10;
const PAYMENT_ANOMALY_WINDOW_MS = 15 * 60 * 1000;
const PAYMENT_ANOMALY_THRESHOLD = 3;
const PII_BULK_ACCESS_WINDOW_MS = 60 * 60 * 1000;
const PII_BULK_ACCESS_THRESHOLD = 30;
const SKYLOAD_BOT_WINDOW_MS = 10 * 60 * 1000;
const SKYLOAD_BOT_THRESHOLD = 5;
const IMPOSSIBLE_TRAVEL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
// Both guards must trip together: a large minimum distance alone would flag
// two nearby cities that geolocation just places on opposite sides of a
// regional boundary, and a high speed alone would flag short local hops
// where imprecise geolocation makes a small distance look sudden. Together
// they approximate "further apart than a flight covers, faster than a
// flight travels" — commercial jet cruise speed, not a hard physics limit.
const IMPOSSIBLE_TRAVEL_MIN_DISTANCE_KM = 300;
const IMPOSSIBLE_TRAVEL_MAX_PLAUSIBLE_KMH = 900;

function emitIncident(io, event, incident) {
  if (io) io.to('admin-room').emit(event, incident.toObject());
  // Only alert on brand-new critical incidents, not on every update to an
  // already-open one — otherwise a repeated attack pattern would re-email
  // admins on every single triggering event instead of once when it starts.
  if (event === 'incident_created' && incident.severity === 'critical') {
    sendCriticalIncidentAlert(incident).catch((err) => console.error('[criticalAlert] Failed:', err.message));
  }
}

async function findOrCreateOpenIncident(query, buildDoc) {
  const existing = await SecurityIncident.findOne({ ...query, status: 'open' }).sort({ createdAt: -1 });
  if (existing) return { incident: existing, created: false };
  const incident = await SecurityIncident.create(buildDoc());
  return { incident, created: true };
}

// Called after every `login_failure` SecurityEvent is persisted.
async function checkLoginFailureRules(event, io) {
  if (!event.ip) return;
  const since = new Date(Date.now() - BRUTE_FORCE_WINDOW_MS);
  const count = await SecurityEvent.countDocuments({ type: 'login_failure', ip: event.ip, createdAt: { $gte: since } });
  if (count < BRUTE_FORCE_THRESHOLD) return;

  const { incident, created } = await findOrCreateOpenIncident(
    { type: 'brute_force', relatedIp: event.ip },
    () => ({
      type: 'brute_force',
      severity: 'high',
      title: `${count} failed logins from ${event.ip}`,
      relatedIp: event.ip,
      relatedEmail: event.email,
      sourceEventIds: [event._id],
    }),
  );
  if (!created) {
    incident.sourceEventIds.push(event._id);
    incident.title = `${count} failed logins from ${event.ip}`;
    await incident.save();
  }
  emitIncident(io, created ? 'incident_created' : 'incident_updated', incident);
}

// Called after every `login_lockout` SecurityEvent is persisted — a lockout is
// already a meaningful signal on its own, no threshold needed.
async function checkLockoutRule(event, io) {
  const incident = await SecurityIncident.create({
    type: 'account_lockout',
    severity: 'high',
    title: `Account locked: ${event.email}`,
    relatedIp: event.ip,
    relatedUserId: event.userId,
    relatedEmail: event.email,
    sourceEventIds: [event._id],
  });
  emitIncident(io, 'incident_created', incident);
}

// Called by requestLogger after persisting a RequestLog row with status 401/403/429.
async function checkSuspiciousIpRule(requestLog, io) {
  if (!requestLog.ip) return;
  const since = new Date(Date.now() - SUSPICIOUS_IP_WINDOW_MS);
  const RequestLog = require('../models/RequestLog');
  const count = await RequestLog.countDocuments({
    ip: requestLog.ip,
    status: { $in: [401, 403, 429] },
    createdAt: { $gte: since },
  });
  if (count < SUSPICIOUS_IP_THRESHOLD) return;

  const { incident, created } = await findOrCreateOpenIncident(
    { type: 'suspicious_ip', relatedIp: requestLog.ip },
    () => ({
      type: 'suspicious_ip',
      severity: 'medium',
      title: `${count} blocked/unauthorized requests from ${requestLog.ip}`,
      relatedIp: requestLog.ip,
    }),
  );
  if (!created) {
    incident.title = `${count} blocked/unauthorized requests from ${requestLog.ip}`;
    await incident.save();
  }
  emitIncident(io, created ? 'incident_created' : 'incident_updated', incident);
}

// Called by logActivity after persisting a `payment`-type ActivityLog entry.
// ActivityLog has no amount field (confirmed against the schema), so this is
// frequency-based only — repeated payment entries for the same student in a
// short window, not amount-based fraud detection.
async function checkPaymentAnomalyRule(activityLogEntry, io) {
  if (!activityLogEntry.studentId) return;
  const since = new Date(Date.now() - PAYMENT_ANOMALY_WINDOW_MS);
  const ActivityLog = require('../models/ActivityLog');
  const count = await ActivityLog.countDocuments({
    type: 'payment', studentId: activityLogEntry.studentId, createdAt: { $gte: since },
  });
  if (count < PAYMENT_ANOMALY_THRESHOLD) return;

  const { incident, created } = await findOrCreateOpenIncident(
    { type: 'payment_anomaly', relatedUserId: activityLogEntry.studentId },
    () => ({
      type: 'payment_anomaly',
      severity: 'medium',
      title: `${count} payment events for ${activityLogEntry.studentName} in ${Math.round(PAYMENT_ANOMALY_WINDOW_MS / 60000)} min`,
      relatedUserId: activityLogEntry.studentId,
      relatedEmail: activityLogEntry.studentName,
    }),
  );
  if (!created) {
    incident.title = `${count} payment events for ${activityLogEntry.studentName} in ${Math.round(PAYMENT_ANOMALY_WINDOW_MS / 60000)} min`;
    await incident.save();
  }
  emitIncident(io, created ? 'incident_created' : 'incident_updated', incident);
}

// Called after every `waf_block` SecurityEvent is persisted. A single matched
// attack signature is already a meaningful signal (like a lockout, no
// threshold needed), but idempotent per IP so a burst of identical malicious
// requests from a scanner doesn't spam one incident per request.
async function checkWafBlockRule(event, io) {
  if (!event.ip) return;
  const category = event.meta?.category || 'malicious';
  const title = `Blocked ${category.replace('_', ' ')} request from ${event.ip}`;

  const { incident, created } = await findOrCreateOpenIncident(
    { type: 'waf_block', relatedIp: event.ip },
    () => ({
      type: 'waf_block',
      severity: event.severity === 'critical' ? 'critical' : 'high',
      title,
      relatedIp: event.ip,
      sourceEventIds: [event._id],
    }),
  );
  if (!created) {
    incident.sourceEventIds.push(event._id);
    incident.title = title;
    await incident.save();
  }
  emitIncident(io, created ? 'incident_created' : 'incident_updated', incident);
}

// Called after every PiiAccessLog entry is persisted. Threshold is on
// distinct applicants touched, not total row count, so re-viewing the same
// student repeatedly doesn't trip it — this is about breadth, not repetition.
async function checkBulkPiiAccessRule(entry, io) {
  if (!entry.accessorId) return;
  const since = new Date(Date.now() - PII_BULK_ACCESS_WINDOW_MS);
  const PiiAccessLog = require('../models/PiiAccessLog');
  const distinctApplicants = await PiiAccessLog.distinct('applicantId', {
    accessorId: entry.accessorId, createdAt: { $gte: since },
  });
  if (distinctApplicants.length < PII_BULK_ACCESS_THRESHOLD) return;

  const title = `${entry.accessorEmail || 'An analyst'} accessed PII for ${distinctApplicants.length} students in ${Math.round(PII_BULK_ACCESS_WINDOW_MS / 60000)} min`;
  const { incident, created } = await findOrCreateOpenIncident(
    { type: 'pii_bulk_access', relatedUserId: entry.accessorId },
    () => ({
      type: 'pii_bulk_access',
      severity: 'medium',
      title,
      relatedUserId: entry.accessorId,
      relatedEmail: entry.accessorEmail,
    }),
  );
  if (!created) {
    incident.title = title;
    await incident.save();
  }
  emitIncident(io, created ? 'incident_created' : 'incident_updated', incident);
}

// Called after every `skyload_bot_flag` SecurityEvent is persisted. Several
// flags from the same IP within the window (not just one — a single flag is
// often a false positive, like a legit health-checker) indicates sustained
// bot-like behavior worth an analyst's attention.
async function checkSkyloadBotRule(event, io) {
  if (!event.ip) return;
  const since = new Date(Date.now() - SKYLOAD_BOT_WINDOW_MS);
  const count = await SecurityEvent.countDocuments({ type: 'skyload_bot_flag', ip: event.ip, createdAt: { $gte: since } });
  if (count < SKYLOAD_BOT_THRESHOLD) return;

  const title = `Skyload flagged ${count} bot-like requests from ${event.ip}`;
  const { incident, created } = await findOrCreateOpenIncident(
    { type: 'skyload_bot_activity', relatedIp: event.ip },
    () => ({
      type: 'skyload_bot_activity',
      severity: 'medium',
      title,
      relatedIp: event.ip,
      sourceEventIds: [event._id],
    }),
  );
  if (!created) {
    incident.sourceEventIds.push(event._id);
    incident.title = title;
    await incident.save();
  }
  emitIncident(io, created ? 'incident_created' : 'incident_updated', incident);
}

// Great-circle distance between two lat/lon points, in km. Exported
// separately so the threshold math can be unit-tested with known city
// coordinates without depending on a live geolocation lookup.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Called after every `login_success` SecurityEvent is persisted. Compares
// against the same user's most recent prior login from a *different* IP
// within the lookback window — if the two locations are further apart than
// a flight could plausibly cover in the time between them, that's a strong
// account-takeover signal (shared/stolen credentials used from two places
// at once), not normal travel. `intelFn` defaults to the real getIpIntel
// but is overridable so tests can supply fixed coordinates instead of
// depending on a live network lookup, mirroring how criticalAlert.js takes
// an injectable mailer.
async function checkImpossibleTravelRule(event, io, intelFn = getIpIntel) {
  if (!event.userId || !event.ip) return;
  const since = new Date(Date.now() - IMPOSSIBLE_TRAVEL_LOOKBACK_MS);
  const prior = await SecurityEvent.findOne({
    type: 'login_success',
    userId: event.userId,
    ip: { $ne: event.ip, $ne: '' },
    createdAt: { $gte: since, $lt: event.createdAt },
  }).sort({ createdAt: -1 });
  if (!prior) return;

  const [currentIntel, priorIntel] = await Promise.all([intelFn(event.ip), intelFn(prior.ip)]);
  if (!currentIntel.available || !priorIntel.available) return;
  if (typeof currentIntel.lat !== 'number' || typeof priorIntel.lat !== 'number') return;

  const distanceKm = haversineKm(priorIntel.lat, priorIntel.lon, currentIntel.lat, currentIntel.lon);
  const hoursElapsed = (event.createdAt - prior.createdAt) / (1000 * 60 * 60);
  if (hoursElapsed <= 0) return;
  const speedKmh = distanceKm / hoursElapsed;
  if (distanceKm < IMPOSSIBLE_TRAVEL_MIN_DISTANCE_KM || speedKmh < IMPOSSIBLE_TRAVEL_MAX_PLAUSIBLE_KMH) return;

  const fromLabel = priorIntel.city || priorIntel.country || prior.ip;
  const toLabel = currentIntel.city || currentIntel.country || event.ip;
  const durationLabel = hoursElapsed < 1 ? `${Math.round(hoursElapsed * 60)} min` : `${hoursElapsed.toFixed(1)} h`;
  const title = `Impossible travel: ${event.email || 'account'} — ${fromLabel} to ${toLabel} in ${durationLabel}`;

  const { incident, created } = await findOrCreateOpenIncident(
    { type: 'impossible_travel', relatedUserId: event.userId },
    () => ({
      type: 'impossible_travel',
      severity: 'high',
      title,
      relatedIp: event.ip,
      relatedUserId: event.userId,
      relatedEmail: event.email,
      sourceEventIds: [prior._id, event._id],
    }),
  );
  if (!created) {
    incident.sourceEventIds.push(event._id);
    incident.title = title;
    await incident.save();
  }
  emitIncident(io, created ? 'incident_created' : 'incident_updated', incident);
}

module.exports = {
  checkLoginFailureRules, checkLockoutRule, checkSuspiciousIpRule, checkPaymentAnomalyRule,
  checkBulkPiiAccessRule, checkWafBlockRule, checkSkyloadBotRule, checkImpossibleTravelRule, haversineKm,
};
