const express = require('express');
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

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
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
};

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

    res.json({
      period, failedLogins, activeLockouts, blockedRequests, unauthorizedRequests, uniqueIps,
      severityBreakdown: toMap(severityBreakdown),
      typeBreakdown: toMap(typeBreakdown),
      topIps: topIps.map(({ _id, count }) => ({ ip: _id, count })),
      series: series.map(({ _id, count }) => ({ bucket: _id, count })),
      incidentsByStatus: toMap(incidentsByStatus),
      openIncidentsBySeverity: toMap(incidentsBySeverity),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── GET /api/soc/events ──────────────────────────────────────────────────────
router.get('/events', authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { since, type, severity } = req.query;
    const query = {};
    if (since) query.createdAt = { $gt: new Date(since) };
    if (type && type !== 'all') query.type = type;
    if (severity && severity !== 'all') query.severity = severity;

    const events = await SecurityEvent.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    const rawCounts = await SecurityEvent.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]);
    const counts = rawCounts.reduce((acc, { _id, count }) => { acc[_id] = count; return acc; }, {});

    res.json({ events, counts });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── Incidents ─────────────────────────────────────────────────────────────────

router.get('/incidents', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status, severity } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (severity && severity !== 'all') query.severity = severity;

    const incidents = await SecurityIncident.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ incidents });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.patch('/incidents/:id', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const { status, assignedTo } = req.body || {};
    const update = {};
    if (status) update.status = status;
    if (assignedTo !== undefined) update.assignedTo = assignedTo || null;

    const before = await SecurityIncident.findById(req.params.id).select('status assignedTo').lean();
    const incident = await SecurityIncident.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    const io = req.app.get('io');
    if (status && before && status !== before.status) {
      logAnalystAction({ analyst: req.user, action: 'incident_status_change', targetType: 'incident', targetId: incident._id, reason: `${before.status} → ${status}`, io });
    }
    if (assignedTo !== undefined && String(before?.assignedTo || '') !== String(assignedTo || '')) {
      logAnalystAction({ analyst: req.user, action: 'incident_assigned', targetType: 'incident', targetId: incident._id, reason: assignedTo ? `Assigned to ${assignedTo}` : 'Unassigned', io });
    }

    io?.to('admin-room').emit('incident_updated', incident.toObject());
    res.json(incident);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.post('/incidents/:id/notes', authMiddleware, adminOnly, async (req, res) => {
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ message: 'Note text required' });
  try {
    const incident = await SecurityIncident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    const poster = await User.findById(req.user.id).select('name role');
    incident.notes.push({ author: poster?.name || 'Admin', authorRole: poster?.role || 'admin', text: text.trim() });
    await incident.save();

    req.app.get('io')?.to('admin-room').emit('incident_updated', incident.toObject());
    res.json(incident);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
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
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.get('/investigate/user/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [events, activity, requests] = await Promise.all([
      SecurityEvent.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
      ActivityLog.find({ $or: [{ studentId: userId }, { counsellorId: userId }] }).sort({ createdAt: -1 }).limit(100).lean(),
      RequestLog.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);

    const timeline = [
      ...events.map(normalizeSecurityEvent),
      ...activity.map(normalizeActivity),
      ...requests.map(normalizeRequest),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 200);

    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role, activeSessions: (user.sessions || []).length },
      timeline,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.post('/investigate/user/:id/logout-everywhere', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.sessions = [];
    await user.save();
    logAnalystAction({ analyst: req.user, action: 'revoke_user_sessions', targetType: 'user', targetId: user._id, reason: `Sessions revoked for ${user.email}`, io: req.app.get('io') });
    res.json({ message: 'All sessions revoked for this user.' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.get('/investigate/ip/:ip', authMiddleware, adminOnly, async (req, res) => {
  try {
    const ip = req.params.ip;
    const [events, requests, intel] = await Promise.all([
      SecurityEvent.find({ ip }).sort({ createdAt: -1 }).limit(150).lean(),
      RequestLog.find({ ip }).sort({ createdAt: -1 }).limit(150).lean(),
      getIpIntel(ip),
    ]);

    const timeline = [
      ...events.map(normalizeSecurityEvent),
      ...requests.map(normalizeRequest),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 200);

    const isBlocked = !!(await BlockedIp.findOne({ ip }).lean());
    res.json({ ip, isBlocked, timeline, intel });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── Blocked IPs ───────────────────────────────────────────────────────────────

router.get('/blocked-ips', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await BlockedIp.find().sort({ createdAt: -1 }).populate('blockedBy', 'name email').lean();
    res.json({ blockedIps: rows });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.post('/blocked-ips', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  const { ip, reason } = req.body || {};
  if (!ip) return res.status(400).json({ message: 'IP address is required' });
  try {
    const row = await BlockedIp.findOneAndUpdate(
      { ip },
      { ip, reason: reason || '', blockedBy: req.user.id },
      { upsert: true, new: true },
    );
    await refreshBlockedIps();
    logAnalystAction({ analyst: req.user, action: 'block_ip', targetType: 'ip', targetId: ip, reason: reason || '', io: req.app.get('io') });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.delete('/blocked-ips/:ip', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    await BlockedIp.deleteOne({ ip: req.params.ip });
    await refreshBlockedIps();
    logAnalystAction({ analyst: req.user, action: 'unblock_ip', targetType: 'ip', targetId: req.params.ip, io: req.app.get('io') });
    res.json({ message: 'IP unblocked' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
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
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── Analyst audit trail ───────────────────────────────────────────────────────

router.get('/audit-trail', authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const actions = await AnalystAction.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
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

// Static facts about hardening already present in this codebase — hand-maintained,
// not dynamically inspected, so it can silently go stale if the code changes
// without this list being updated too.
const HARDENING_CHECKLIST = [
  { label: 'Rate limiting on auth endpoints', enabled: true },
  { label: 'Helmet security headers + CSP', enabled: true },
  { label: 'NoSQL injection sanitization (express-mongo-sanitize)', enabled: true },
  { label: 'trust proxy set (correct IP resolution behind a reverse proxy)', enabled: true },
  { label: 'GitHub OAuth CSRF state parameter', enabled: true },
  { label: 'Per-device session isolation (multi-session support)', enabled: true },
  { label: 'Account lockout after repeated failed logins', enabled: true },
  { label: 'Password reset invalidates all existing sessions', enabled: true },
  { label: 'Password strength policy enforced (8+ chars, upper/number/special)', enabled: true },
  { label: 'httpOnly + sameSite refresh-token cookie', enabled: true },
];

// Known-incomplete work — hand-maintained deliberately, same as the checklist
// above, so it's visible on the dashboard itself rather than only living in
// chat history. Update/remove an item here the moment it's actually closed
// out — a stale "known gap" that's secretly fixed is as misleading as a
// hardening claim that's gone stale the other way.
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
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Real PDF export of the old hand-maintained checklist — archived here as a
// static snapshot rather than shown live, since the live Posture tab now
// shows genuinely dynamic, code-derived data instead (activeFeatures +
// codeAnalysis above), which doesn't have the same staleness risk.
router.get('/posture/checklist-pdf', authMiddleware, adminOnly, (req, res) => {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="gradzest-hardening-checklist.pdf"');
  doc.pipe(res);

  doc.fontSize(18).text('Gradzest — Hardening Checklist', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#555').text(
    'Snapshot of hand-verified security facts about this app\'s configuration, archived as a PDF. ' +
    'This list is NOT dynamically re-checked — see the live Posture tab in the SOC dashboard for ' +
    'genuinely code-derived, up-to-date status instead.',
  );
  doc.moveDown(1);
  doc.fillColor('#000');

  HARDENING_CHECKLIST.forEach((item, i) => {
    doc.fontSize(12).text(`${i + 1}. ${item.label}`, { continued: false });
    doc.moveDown(0.3);
  });

  doc.moveDown(1);
  doc.fontSize(9).fillColor('#888').text(`Generated ${new Date().toISOString()}`);

  doc.end();
});

module.exports = router;
