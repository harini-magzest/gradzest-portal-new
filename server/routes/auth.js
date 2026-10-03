const express = require('express');
const { logError } = require('../lib/logError');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const University = require('../models/University');
const authMiddleware = require('../middleware/auth');
const notifyAdminsOfNewLead = require('../lib/notifyAdminsOfNewLead');
const { assignNextCounselor } = require('../lib/assignCounselor');
const { logSecurityEvent } = require('../middleware/logSecurityEvent');

function createMailer() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const router = express.Router();

function issueAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role, isAppTeam: !!user.isAppTeam }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

const MAX_SESSIONS = 5;

// Issues a new refresh token as its own session, independent of any other
// device the user is already logged in on (up to MAX_SESSIONS at a time —
// oldest is evicted first once the cap is hit).
async function issueRefreshToken(user, req) {
  const raw = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const now = new Date();

  const fresh = await User.findById(user._id).select('sessions');
  let sessions = (fresh?.sessions || []).filter((s) => s.expires > now);
  sessions.push({
    tokenHash: hash,
    expires,
    userAgent: req?.headers?.['user-agent'] || '',
    ip: req?.ip || '',
    createdAt: now,
    lastUsedAt: now,
  });
  if (sessions.length > MAX_SESSIONS) {
    sessions = sessions.sort((a, b) => a.createdAt - b.createdAt).slice(sessions.length - MAX_SESSIONS);
  }

  await User.findByIdAndUpdate(user._id, { sessions });
  return { raw, expires };
}

function setRefreshCookie(res, token, expires) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires,
    path: '/api/auth',
  });
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Logged too (with no userId) so spraying across accounts that don't exist
      // is still visible to the credential-stuffing rule and the SOC feed.
      logSecurityEvent('login_failure', {
        severity: 'low',
        email: String(email).toLowerCase().slice(0, 254),
        ip: req.ip, userAgent: req.headers['user-agent'] || '',
        message: 'Failed login attempt for unknown account',
      }).catch(() => {});
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(423).json({
        message: `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`,
      });
    }

    const valid = await bcrypt.compare(password, user.password || '');
    if (!valid) {
      const attempts = (user.loginAttempts || 0) + 1;
      const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;
      await User.findByIdAndUpdate(user._id, {
        loginAttempts: attempts,
        ...(shouldLock && { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) }),
      });
      const remaining = MAX_LOGIN_ATTEMPTS - attempts;
      const ip = req.ip;
      const userAgent = req.headers['user-agent'] || '';
      logSecurityEvent('login_failure', {
        severity: shouldLock ? 'high' : 'medium',
        userId: user._id, email: user.email, role: user.role,
        ip, userAgent,
        message: `Failed login attempt ${attempts}/${MAX_LOGIN_ATTEMPTS}`,
        meta: { attemptsRemaining: Math.max(remaining, 0) },
      }).catch(() => {});
      if (shouldLock) {
        logSecurityEvent('login_lockout', {
          severity: 'high',
          userId: user._id, email: user.email, role: user.role,
          ip, userAgent,
          message: 'Account locked for 15 minutes after too many failed login attempts',
        }).catch(() => {});
        return res.status(423).json({ message: 'Account locked for 15 minutes after too many failed attempts.' });
      }
      return res.status(401).json({
        message: `Invalid email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`,
      });
    }

    // Block login if email is not verified (only for self-registered students with pending token)
    if (user.emailVerified === false && user.emailVerifyToken) {
      return res.status(403).json({
        message: 'Please verify your email before logging in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Success — reset lockout counters
    await User.findByIdAndUpdate(user._id, { loginAttempts: 0, lockedUntil: null });

    const accessToken = issueAccessToken(user);
    const { raw: refreshRaw, expires: refreshExpires } = await issueRefreshToken(user, req);
    setRefreshCookie(res, refreshRaw, refreshExpires);

    logSecurityEvent('login_success', {
      userId: user._id, email: user.email, role: user.role,
      ip: req.ip, userAgent: req.headers['user-agent'] || '',
      message: 'Login successful',
    }).catch(() => {});

    const userObj = user.toJSON();
    delete userObj.password;

    res.json({ token: accessToken, user: userObj });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const userObj = user.toJSON();

    // Enrich student applications that are missing universityName/courseName
    if (userObj.role === 'student' && Array.isArray(userObj.applications)) {
      const missingIds = [...new Set(
        userObj.applications
          .filter(a => !a.universityName && a.universityId)
          .map(a => a.universityId)
      )];

      if (missingIds.length > 0) {
        const unis = await University.find({
          $or: [{ _id: { $in: missingIds } }, { id: { $in: missingIds } }]
        }).select('_id id name courses');
        const uniMap = {};
        unis.forEach(u => {
          uniMap[u._id.toString()] = u;
          if (u.id) uniMap[u.id] = u;
        });

        userObj.applications = userObj.applications.map(app => {
          if (!app.universityName && app.universityId) {
            const uni = uniMap[app.universityId.toString()] || uniMap[app.universityId];
            if (uni) {
              app.universityName = uni.name;
              if (!app.courseName && app.courseId) {
                const course = (uni.courses || []).find(c =>
                  c._id?.toString() === app.courseId?.toString() || c.id === app.courseId
                );
                if (course) {
                  app.courseName = course.name;
                  if (!app.intake && course.intake?.length) app.intake = course.intake[0];
                }
              }
            }
          }
          return app;
        });
      }
    }

    res.json(userObj);
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

function validatePasswordStrength(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
  return null;
}

async function sendVerificationEmail(user, mailer, frontendUrl) {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await User.findByIdAndUpdate(user._id, { emailVerifyToken: hash, emailVerifyExpires: expires });
  if (mailer) {
    const verifyUrl = `${frontendUrl}/verify-email?token=${raw}`;
    mailer.sendMail({
      from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Verify your Gradzest email address',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
          <div style="background:#0d1b4b;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
          </div>
          <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <p style="font-size:16px;">Hi ${user.name},</p>
            <p style="font-size:15px;">Please verify your email address to activate your account:</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${verifyUrl}" style="background:#0d1b4b;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">Verify Email Address</a>
            </div>
            <p style="font-size:13px;color:#6b7280;">This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>
          </div>
        </div>`,
    }).catch(err => console.error('[mailer] verification email failed:', err.message));
  }
}

router.post('/register', async (req, res) => {
  const { name, email, password, phone, nationality } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  const pwError = validatePasswordStrength(password);
  if (pwError) return res.status(400).json({ message: pwError });
  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      name, email: email.toLowerCase(), password: hashed, role: 'student',
      phone: phone || '', nationality: nationality || '',
      status: 'active', joinedDate: new Date().toISOString().split('T')[0],
      emailVerified: false,
      source: 'self_signup',
      leadStatus: 'new',
    });
    await user.save();
    const assignedCounselor = await assignNextCounselor(user);
    if (assignedCounselor) await user.save();
    notifyAdminsOfNewLead(req.app, user, assignedCounselor); // fire-and-forget; never blocks or fails sign-up
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await sendVerificationEmail(user, createMailer(), frontendUrl);
    const accessToken = issueAccessToken(user);
    const { raw, expires } = await issueRefreshToken(user, req);
    setRefreshCookie(res, raw, expires);
    const userObj = user.toJSON();
    delete userObj.password;
    res.status(201).json({ token: accessToken, user: userObj });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// GET /auth/verify-email?token=...
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: 'Token required' });
  try {
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const user = await User.findOne({ emailVerifyToken: hash, emailVerifyExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ message: 'Invalid or expired verification link.' });
    await User.findByIdAndUpdate(user._id, { emailVerified: true, emailVerifyToken: undefined, emailVerifyExpires: undefined });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?verified=1`);
  } catch (err) {
    logError('auth', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email required' });
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.emailVerified) return res.json({ message: 'If that email exists and is unverified, a new link has been sent.' });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await sendVerificationEmail(user, createMailer(), frontendUrl);
    res.json({ message: 'Verification email sent.' });
  } catch (err) {
    logError('auth', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email is required' });
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    // Logged whether or not the account exists (the response is identical either
    // way) so the reset-abuse rule sees enumeration attempts as well.
    logSecurityEvent('password_reset_request', {
      severity: 'info',
      userId: user?._id, email: String(email).toLowerCase().slice(0, 254), role: user?.role || '',
      ip: req.ip, userAgent: req.headers['user-agent'] || '',
      message: 'Password reset link requested',
    }).catch(() => {});
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordToken = hashed;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    try {
      await createMailer().sendMail({
        from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Reset your Gradzest password',
        html: `<p>Hi ${user.name},</p><p>Click the link below to reset your password (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, ignore this email.</p><p>— The Gradzest Team</p>`,
      });
    } catch (mailErr) {
      console.error('[auth/forgot-password] mail error:', mailErr.message);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ message: 'Token and password are required' });
  const pwError = validatePasswordStrength(password);
  if (pwError) return res.status(400).json({ message: pwError });
  try {
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ resetPasswordToken: hashed, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link. Please request a new one.' });

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    // Invalidate every active session, on every device — a stolen refresh
    // token must not survive a password change.
    user.sessions = [];
    await user.save();

    logSecurityEvent('password_reset', {
      severity: 'medium',
      userId: user._id, email: user.email, role: user.role,
      ip: req.ip, userAgent: req.headers['user-agent'] || '',
      message: 'Password reset via reset link',
    }).catch(() => {});

    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /auth/refresh — exchange refresh token cookie for a new access token.
// Rotates only the ONE session matching this cookie — every other device's
// session is left untouched, which is the actual multi-session fix.
router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (!raw) return res.status(401).json({ message: 'No refresh token' });
  try {
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const user = await User.findOne({
      sessions: { $elemMatch: { tokenHash: hash, expires: { $gt: new Date() } } },
    });
    if (!user) return res.status(401).json({ message: 'Invalid or expired refresh token. Please log in again.' });

    const session = user.sessions.find((s) => s.tokenHash === hash);

    // Rotate this session's token on every use (prevents token reuse attacks)
    const newRaw = crypto.randomBytes(40).toString('hex');
    const newHash = crypto.createHash('sha256').update(newRaw).digest('hex');
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    session.tokenHash = newHash;
    session.expires = newExpires;
    session.lastUsedAt = new Date();
    await user.save();

    setRefreshCookie(res, newRaw, newExpires);
    res.json({ token: issueAccessToken(user) });
  } catch (err) {
    console.error('[auth/refresh]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /auth/logout — revoke just this device's session and clear its cookie
router.post('/logout', async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (raw) {
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const user = await User.findOne({ 'sessions.tokenHash': hash }).catch(() => null);
    if (user) {
      user.sessions.pull({ tokenHash: hash });
      await user.save().catch(() => {});
      logSecurityEvent('logout', {
        userId: user._id, email: user.email, role: user.role,
        ip: req.ip, userAgent: req.headers['user-agent'] || '',
      }).catch(() => {});
    }
  }
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Logged out' });
});

// GET /auth/sessions — list this user's own active sessions (device/IP/last-used)
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('sessions');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const currentRaw = req.cookies?.refreshToken;
    const currentHash = currentRaw ? crypto.createHash('sha256').update(currentRaw).digest('hex') : null;

    const sessions = user.sessions
      .slice()
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .map((s) => ({
        id: s._id,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        isCurrent: !!currentHash && s.tokenHash === currentHash,
      }));

    res.json({ sessions });
  } catch (err) {
    console.error('[auth/sessions]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /auth/sessions/:sessionId — revoke one specific session ("log out that device")
router.delete('/sessions/:sessionId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const before = user.sessions.length;
    user.sessions.pull({ _id: req.params.sessionId });
    if (user.sessions.length === before) {
      return res.status(404).json({ message: 'Session not found' });
    }
    await user.save();

    res.json({ message: 'Session revoked' });
  } catch (err) {
    console.error('[auth/sessions delete]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
