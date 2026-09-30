// Threshold-based "threat analyst" detection rules over the platform's own
// data — there's no external threat intel here, so detection means: did this
// event, combined with recent history, cross a rate/frequency threshold that's
// worth an analyst's attention? Each rule is idempotent — it reuses an existing
// `open` incident for the same subject within the detection window instead of
// spamming a new incident per triggering event.
//
// Every rule opens incidents through raiseIncident()/createIncident(), which
// consult the suppression allowlist first — so an allowlisted IP/email never
// produces an incident regardless of which rule fired.

const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const { routeIncidentAlert } = require('./alertRouting');
const { getIpIntel } = require('./ipIntel');
const { isSuppressed } = require('./suppression');

const BRUTE_FORCE_WINDOW_MS = 10 * 60 * 1000;
const BRUTE_FORCE_THRESHOLD = 5;
const CREDENTIAL_STUFFING_WINDOW_MS = 10 * 60 * 1000;
// Distinct accounts targeted from one IP. Brute force is many tries on one
// account; stuffing/spraying is a few tries on many accounts, which never
// trips the per-account lockout or the per-IP failure count on its own.
const CREDENTIAL_STUFFING_DISTINCT_EMAILS = 5;
const SUSPICIOUS_IP_WINDOW_MS = 10 * 60 * 1000;
const SUSPICIOUS_IP_THRESHOLD = 10;
const PAYMENT_ANOMALY_WINDOW_MS = 15 * 60 * 1000;
const PAYMENT_ANOMALY_THRESHOLD = 3;
const PII_BULK_ACCESS_WINDOW_MS = 60 * 60 * 1000;
const PII_BULK_ACCESS_THRESHOLD = 30;
const SKYLOAD_BOT_WINDOW_MS = 10 * 60 * 1000;
const SKYLOAD_BOT_THRESHOLD = 5;
const RESET_ABUSE_WINDOW_MS = 60 * 60 * 1000;
const RESET_ABUSE_PER_EMAIL = 5;
const RESET_ABUSE_DISTINCT_EMAILS_PER_IP = 5;
const MASS_EXPORT_WINDOW_MS = 60 * 60 * 1000;
const MASS_EXPORT_THRESHOLD = 5;
const NEW_DEVICE_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
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
  // Only alert on brand-new incidents, not on every update to an already-open
  // one — otherwise a repeated attack pattern would re-alert admins on every
  // single triggering event instead of once when it starts. Which channels
  // fire (in-app, email) is decided by severity in alertRouting.
  if (event === 'incident_created') {
    routeIncidentAlert(incident).catch((err) => console.error('[alertRouting] Failed:', err.message));
  }
}

// Creates a brand-new incident unless the subject is allowlisted. Returns the
// incident, or null if suppressed.
async function createIncident(io, doc) {
  if (await isSuppressed(doc.type, { ip: doc.relatedIp, email: doc.relatedEmail })) return null;
  const incident = await SecurityIncident.create(doc);
  emitIncident(io, 'incident_created', incident);
  return incident;
}

// Reuses the open incident matching `query` (refreshing its title and, if
// given, appending the triggering event ids), or creates one from `doc`.
async function raiseIncident(io, query, doc, eventIds = []) {
  const existing = await SecurityIncident.findOne({ ...query, status: 'open' }).sort({ createdAt: -1 });
  if (!existing) return createIncident(io, doc);
  if (eventIds.length) existing.sourceEventIds.push(...eventIds);
  existing.title = doc.title;
  await existing.save();
  emitIncident(io, 'incident_updated', existing);
  return existing;
}

// Called after every `login_failure` SecurityEvent is persisted.
async function checkLoginFailureRules(event, io) {
  if (!event.ip) return;
  const since = new Date(Date.now() - BRUTE_FORCE_WINDOW_MS);
  const count = await SecurityEvent.countDocuments({ type: 'login_failure', ip: event.ip, createdAt: { $gte: since } });
  if (count < BRUTE_FORCE_THRESHOLD) return;

  const title = `${count} failed logins from ${event.ip}`;
  await raiseIncident(
    io,
    { type: 'brute_force', relatedIp: event.ip },
    { type: 'brute_force', severity: 'high', title, relatedIp: event.ip, relatedEmail: event.email, sourceEventIds: [event._id] },
    [event._id],
  );
}

// Also called after every `login_failure`. Counts distinct accounts, not
// attempts — see CREDENTIAL_STUFFING_DISTINCT_EMAILS.
async function checkCredentialStuffingRule(event, io) {
  if (!event.ip) return;
  const since = new Date(Date.now() - CREDENTIAL_STUFFING_WINDOW_MS);
  const emails = await SecurityEvent.distinct('email', {
    type: 'login_failure', ip: event.ip, email: { $ne: '' }, createdAt: { $gte: since },
  });
  if (emails.length < CREDENTIAL_STUFFING_DISTINCT_EMAILS) return;

  const title = `Credential stuffing: ${emails.length} different accounts targeted from ${event.ip}`;
  await raiseIncident(
    io,
    { type: 'credential_stuffing', relatedIp: event.ip },
    { type: 'credential_stuffing', severity: 'high', title, relatedIp: event.ip, sourceEventIds: [event._id] },
    [event._id],
  );
}

// Called after every `login_lockout` SecurityEvent is persisted — a lockout is
// already a meaningful signal on its own, no threshold needed.
async function checkLockoutRule(event, io) {
  await createIncident(io, {
    type: 'account_lockout',
    severity: 'high',
    title: `Account locked: ${event.email}`,
    relatedIp: event.ip,
    relatedUserId: event.userId,
    relatedEmail: event.email,
    sourceEventIds: [event._id],
  });
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

  const title = `${count} blocked/unauthorized requests from ${requestLog.ip}`;
  await raiseIncident(
    io,
    { type: 'suspicious_ip', relatedIp: requestLog.ip },
    { type: 'suspicious_ip', severity: 'medium', title, relatedIp: requestLog.ip },
  );
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

  const title = `${count} payment events for ${activityLogEntry.studentName} in ${Math.round(PAYMENT_ANOMALY_WINDOW_MS / 60000)} min`;
  await raiseIncident(
    io,
    { type: 'payment_anomaly', relatedUserId: activityLogEntry.studentId },
    {
      type: 'payment_anomaly', severity: 'medium', title,
      relatedUserId: activityLogEntry.studentId, relatedEmail: activityLogEntry.studentName,
    },
  );
}

// Called after every `waf_block` SecurityEvent is persisted. A single matched
// attack signature is already a meaningful signal (like a lockout, no
// threshold needed), but idempotent per IP so a burst of identical malicious
// requests from a scanner doesn't spam one incident per request.
async function checkWafBlockRule(event, io) {
  if (!event.ip) return;
  const category = event.meta?.category || 'malicious';
  const title = `Blocked ${category.replace('_', ' ')} request from ${event.ip}`;

  await raiseIncident(
    io,
    { type: 'waf_block', relatedIp: event.ip },
    {
      type: 'waf_block', severity: event.severity === 'critical' ? 'critical' : 'high', title,
      relatedIp: event.ip, sourceEventIds: [event._id],
    },
    [event._id],
  );
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
  await raiseIncident(
    io,
    { type: 'pii_bulk_access', relatedUserId: entry.accessorId },
    { type: 'pii_bulk_access', severity: 'medium', title, relatedUserId: entry.accessorId, relatedEmail: entry.accessorEmail },
  );
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
  await raiseIncident(
    io,
    { type: 'skyload_bot_activity', relatedIp: event.ip },
    { type: 'skyload_bot_activity', severity: 'medium', title, relatedIp: event.ip, sourceEventIds: [event._id] },
    [event._id],
  );
}

// Called after every `password_reset_request` SecurityEvent (logged by
// /auth/forgot-password, including for unknown emails, so enumeration is
// visible too). Two independent signals: many requests for one account
// (someone trying to lock a victim's inbox / hijack the flow), and one IP
// requesting resets for many different accounts (enumeration / mass takeover).
async function checkPasswordResetAbuseRule(event, io) {
  const since = new Date(Date.now() - RESET_ABUSE_WINDOW_MS);

  if (event.email) {
    const perEmail = await SecurityEvent.countDocuments({
      type: 'password_reset_request', email: event.email, createdAt: { $gte: since },
    });
    if (perEmail >= RESET_ABUSE_PER_EMAIL) {
      await raiseIncident(
        io,
        { type: 'password_reset_abuse', relatedEmail: event.email, relatedIp: '' },
        {
          type: 'password_reset_abuse', severity: 'medium',
          title: `${perEmail} password reset requests for ${event.email} in ${Math.round(RESET_ABUSE_WINDOW_MS / 60000)} min`,
          relatedEmail: event.email, sourceEventIds: [event._id],
        },
        [event._id],
      );
    }
  }

  if (event.ip) {
    const emails = await SecurityEvent.distinct('email', {
      type: 'password_reset_request', ip: event.ip, email: { $ne: '' }, createdAt: { $gte: since },
    });
    if (emails.length >= RESET_ABUSE_DISTINCT_EMAILS_PER_IP) {
      await raiseIncident(
        io,
        { type: 'password_reset_abuse', relatedIp: event.ip, relatedEmail: '' },
        {
          type: 'password_reset_abuse', severity: 'medium',
          title: `Password resets requested for ${emails.length} different accounts from ${event.ip}`,
          relatedIp: event.ip, sourceEventIds: [event._id],
        },
        [event._id],
      );
    }
  }
}

// Called after every `privilege_change` SecurityEvent (an admin account being
// created or an existing one being granted Application Team access). These
// are rare and high-impact, so each one is an incident on its own — an
// unexpected one is exactly what a compromised admin account would produce.
async function checkPrivilegeChangeRule(event, io) {
  await createIncident(io, {
    type: 'privilege_escalation',
    severity: 'high',
    title: `Privilege change by ${event.email || 'unknown'}: ${event.message}`,
    relatedIp: event.ip,
    relatedUserId: event.userId,
    relatedEmail: event.email,
    sourceEventIds: [event._id],
  });
}

// Called after every `data_export` SecurityEvent (an analyst downloading a CSV
// from the SOC). Exports are routine one at a time; a burst from one account
// is what bulk data theft through a compromised admin session looks like.
async function checkMassExportRule(event, io) {
  if (!event.userId) return;
  const since = new Date(Date.now() - MASS_EXPORT_WINDOW_MS);
  const count = await SecurityEvent.countDocuments({ type: 'data_export', userId: event.userId, createdAt: { $gte: since } });
  if (count < MASS_EXPORT_THRESHOLD) return;

  await raiseIncident(
    io,
    { type: 'mass_export', relatedUserId: event.userId },
    {
      type: 'mass_export', severity: 'medium',
      title: `${event.email || 'An analyst'} exported data ${count} times in ${Math.round(MASS_EXPORT_WINDOW_MS / 60000)} min`,
      relatedIp: event.ip, relatedUserId: event.userId, relatedEmail: event.email, sourceEventIds: [event._id],
    },
    [event._id],
  );
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

  await raiseIncident(
    io,
    { type: 'impossible_travel', relatedUserId: event.userId },
    {
      type: 'impossible_travel', severity: 'high', title,
      relatedIp: event.ip, relatedUserId: event.userId, relatedEmail: event.email,
      sourceEventIds: [prior._id, event._id],
    },
    [event._id],
  );
}

// Hour of day (0-23) in the configured business timezone.
function hourInBusinessTz(date) {
  const tz = process.env.SOC_BUSINESS_TZ || 'Asia/Kolkata';
  const hour = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(date);
  return parseInt(hour, 10);
}

// Called after every `login_success`. An admin signing in outside business
// hours (SOC_BUSINESS_HOURS_START..END, default 07-21 in SOC_BUSINESS_TZ) is
// low-severity on its own — plenty of legitimate reasons — but it's a useful
// pivot when it lines up with another signal on the same account.
async function checkOffHoursAdminRule(event, io) {
  if (event.role !== 'admin' || !event.userId) return;
  const start = parseInt(process.env.SOC_BUSINESS_HOURS_START ?? '7', 10);
  const end = parseInt(process.env.SOC_BUSINESS_HOURS_END ?? '21', 10);
  const hour = hourInBusinessTz(new Date(event.createdAt || Date.now()));
  if (hour >= start && hour < end) return;

  await raiseIncident(
    io,
    { type: 'off_hours_admin', relatedUserId: event.userId },
    {
      type: 'off_hours_admin', severity: 'low',
      title: `Off-hours admin login: ${event.email} at ${String(hour).padStart(2, '0')}:00 local`,
      relatedIp: event.ip, relatedUserId: event.userId, relatedEmail: event.email, sourceEventIds: [event._id],
    },
    [event._id],
  );
}

// Called after every `login_success`. A privileged account (admin/counselor)
// signing in from a browser/device signature it has never used in the
// lookback window. Skipped for an account's first-ever login (no baseline)
// and when the user agent is missing.
async function checkNewDevicePrivilegedRule(event, io) {
  if (!['admin', 'counselor'].includes(event.role) || !event.userId || !event.userAgent) return;
  const since = new Date(Date.now() - NEW_DEVICE_LOOKBACK_MS);
  const before = { type: 'login_success', userId: event.userId, createdAt: { $gte: since, $lt: event.createdAt } };
  if (!(await SecurityEvent.exists(before))) return;
  if (await SecurityEvent.exists({ ...before, userAgent: event.userAgent })) return;

  await raiseIncident(
    io,
    { type: 'new_device_privileged', relatedUserId: event.userId },
    {
      type: 'new_device_privileged', severity: event.role === 'admin' ? 'medium' : 'low',
      title: `New device for ${event.role} ${event.email}`,
      relatedIp: event.ip, relatedUserId: event.userId, relatedEmail: event.email, sourceEventIds: [event._id],
    },
    [event._id],
  );
}

module.exports = {
  checkLoginFailureRules, checkCredentialStuffingRule, checkLockoutRule, checkSuspiciousIpRule,
  checkPaymentAnomalyRule, checkBulkPiiAccessRule, checkWafBlockRule, checkSkyloadBotRule,
  checkPasswordResetAbuseRule, checkPrivilegeChangeRule, checkMassExportRule, checkImpossibleTravelRule,
  checkOffHoursAdminRule, checkNewDevicePrivilegedRule, haversineKm,
};
