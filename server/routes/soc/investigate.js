// Investigate a person or an IP: their timeline, and the account actions (sign out, reset, lock).
const express = require('express');
const { sendServerError } = require('../../lib/httpError');
const { getIpIntel } = require('../../lib/ipIntel');
const SecurityEvent = require('../../models/SecurityEvent');
const RequestLog = require('../../models/RequestLog');
const ActivityLog = require('../../models/ActivityLog');
const SecurityIncident = require('../../models/SecurityIncident');
const BlockedIp = require('../../models/BlockedIp');
const PiiAccessLog = require('../../models/PiiAccessLog');
const AnalystAction = require('../../models/AnalystAction');
const User = require('../../models/User');
const authMiddleware = require('../../middleware/auth');
const { revokeAllSessions } = require('../../lib/accountState');
const { logAnalystAction } = require('../../lib/logAnalystAction');
const attachUserEmail = require('../../middleware/attachUserEmail');
const { buildIpMatcher } = require('../../lib/ipMatch');
const UiActivity = require('../../models/UiActivity');
const UploadRecord = require('../../models/UploadRecord');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { adminOnly, LOCKED_BY_ADMIN_UNTIL, sendMailWithTimeout, isObjectId, SECURITY_TYPE_LABEL, vtLink } = require('./shared');

const router = express.Router();

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
    const user = await User.findById(req.params.id).select('email');
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Clearing the session list only stops new refreshes; the access token already issued would keep working for up to
    // 15 minutes. Moving sessionsRevokedAt makes every token issued before now refuse at once, and the live socket goes.
    await revokeAllSessions(user._id);
    req.app.get('io')?.in(`user:${user._id}`).disconnectSockets(true);
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
    // "Their current password stops working and every session is signed out" has to be true now, not in 15 minutes.
    await revokeAllSessions(user._id);
    req.app.get('io')?.in(`user:${user._id}`).disconnectSockets(true);

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
    require('../../lib/accountState').invalidate(user._id);
    if (locked) req.app.get('io')?.in(`user:${user._id}`).disconnectSockets(true);
    logAnalystAction({ analyst: req.user, action: locked ? 'lock_account' : 'unlock_account', targetType: 'user', targetId: user._id, reason: String(req.body?.reason || '').slice(0, 300) || (locked ? `Locked ${user.email}` : `Unlocked ${user.email}`), io: req.app.get('io') });
    res.json({ locked, message: locked ? 'Account locked and all sessions revoked.' : 'Account unlocked.' });
  } catch (err) {
    sendServerError(res, err);
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

module.exports = router;
