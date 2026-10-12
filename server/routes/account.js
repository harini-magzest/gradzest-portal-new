const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { logSecurityEvent } = require('../middleware/logSecurityEvent');
const { logError } = require('../lib/logError');
const { validatePasswordStrength } = require('../lib/passwordPolicy');
const { lockMessage, registerFailedAttempt } = require('../lib/loginAttempts');
const twoFactor = require('../lib/twoFactor');
const { issueAccessToken, issueRefreshToken, setRefreshCookie } = require('../lib/sessionTokens');

// Self-service security for whoever is signed in: change password, two-factor sign-in, and (staff) their own profile.
const router = express.Router();
router.use(authMiddleware);

const who = (user, req) => ({
  userId: user._id, email: user.email || '', role: user.role,
  ip: req.ip, userAgent: req.headers['user-agent'] || '',
});

// Security changes ask for the current password again. Without that, a stolen access token (valid for 15 minutes) could be
// turned into a lasting takeover: a new password, or a second factor the owner does not control. Wrong answers count toward
// the same lockout as failed logins. Returns true if the password is right; otherwise it has already sent the response.
//
// A wrong answer is a 403, never a 401: on these routes the web client reads 401 as "your access token expired", refreshes
// and sends the request again, which would count every wrong guess twice.
async function confirmPassword(req, res, user, password) {
  if (!user.password) {
    res.status(400).json({ message: 'This account has no password yet. Use "Forgot password" to create one first.' });
    return false;
  }
  const locked = lockMessage(user);
  if (locked) { res.status(423).json({ message: locked }); return false; }
  if (typeof password === 'string' && password && await bcrypt.compare(password, user.password)) return true;
  const { locked: nowLocked, remaining } = await registerFailedAttempt(user, req, {
    message: 'Wrong password while confirming a security change', meta: { stage: 'reauth' },
  });
  res.status(nowLocked ? 423 : 403).json({
    message: nowLocked ? 'Account locked for 15 minutes after too many failed attempts.'
      : `Current password is incorrect. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`,
  });
  return false;
}

/* ── Password ──────────────────────────────────────────────────────────────── */

// POST /account/change-password { currentPassword, newPassword }
// Every session is revoked (a stolen refresh token must not survive a password change) and this device is given a fresh
// one. The refresh cookie only travels to /api/auth, so this route cannot tell which session is "this one"; replacing all of
// them, and setting a new cookie in the response, does not need to.
router.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new password are required.' });
  const policy = validatePasswordStrength(String(newPassword));
  if (policy) return res.status(400).json({ message: policy });
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!(await confirmPassword(req, res, user, currentPassword))) return;
    if (await bcrypt.compare(String(newPassword), user.password)) {
      return res.status(400).json({ message: 'The new password must be different from the current one.' });
    }

    await User.updateOne({ _id: user._id }, { $set: { password: await bcrypt.hash(String(newPassword), 10), sessions: [] } });
    const { raw, expires } = await issueRefreshToken(user, req);
    setRefreshCookie(res, raw, expires);

    logSecurityEvent('password_change', { ...who(user, req), severity: 'info', message: 'Password changed from Settings; other devices signed out' }).catch(() => {});
    res.json({ message: 'Password updated. Other devices have been signed out.', token: issueAccessToken(user) });
  } catch (err) {
    logError('account', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ── Two-factor sign-in ────────────────────────────────────────────────────── */

const loadWithSecrets = (id) => User.findById(id).select(twoFactor.SECRET_FIELDS);

router.get('/2fa', async (req, res) => {
  try {
    const user = await loadWithSecrets(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const tf = user.twoFactor || {};
    res.json({
      enabled: !!tf.enabled,
      enabledAt: tf.enabledAt || null,
      recoveryCodesRemaining: tf.enabled ? (tf.recoveryCodes || []).length : 0,
      hasPassword: !!user.password,
    });
  } catch (err) {
    logError('account', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /account/2fa/setup { password } — step 1: make a secret for the authenticator app. Nothing is switched on yet.
router.post('/2fa/setup', async (req, res) => {
  try {
    const user = await loadWithSecrets(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.twoFactor?.enabled) return res.status(409).json({ message: 'Two-factor sign-in is already on. Turn it off first to set it up again.' });
    if (!(await confirmPassword(req, res, user, req.body?.password))) return;
    const setup = await twoFactor.beginSetup(user._id, user.email || user.name);
    res.json(setup);
  } catch (err) {
    logError('account', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /account/2fa/enable { code } — step 2: the code from the app proves it has the secret; 2FA turns on and the
// recovery codes are shown, once.
router.post('/2fa/enable', async (req, res) => {
  try {
    const user = await loadWithSecrets(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.twoFactor?.enabled) return res.status(409).json({ message: 'Two-factor sign-in is already on.' });
    const result = await twoFactor.confirmSetup(user, req.body?.code);
    if (!result.ok) {
      return res.status(400).json({
        message: result.reason === 'no_setup' ? 'Start the setup again to get a new key.' : 'That code is not right. Check the code in your app and try again.',
      });
    }
    logSecurityEvent('two_factor_change', {
      ...who(user, req), severity: 'low', message: 'Two-factor sign-in turned on', meta: { action: 'enabled' },
    }).catch(() => {});
    res.json({ enabled: true, recoveryCodes: result.recoveryCodes });
  } catch (err) {
    logError('account', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Turning 2FA off or re-issuing its recovery codes needs the password and a current code: a stolen session alone is not enough.
async function requireFullProof(req, res) {
  const user = await loadWithSecrets(req.user.id);
  if (!user) { res.status(404).json({ message: 'User not found' }); return null; }
  if (!user.twoFactor?.enabled) { res.status(400).json({ message: 'Two-factor sign-in is not turned on.' }); return null; }
  if (!(await confirmPassword(req, res, user, req.body?.password))) return null;
  const result = await twoFactor.consumeSecondFactor(user, req.body?.code);
  if (!result.ok) {
    const { locked, remaining } = await registerFailedAttempt(user, req, {
      message: 'Wrong two-factor code while confirming a security change', meta: { stage: 'reauth-2fa', reason: result.reason },
    });
    res.status(locked ? 423 : 403).json({
      message: locked ? 'Account locked for 15 minutes after too many failed attempts.'
        : `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`,
    });
    return null;
  }
  return user;
}

// POST /account/2fa/disable { password, code }
router.post('/2fa/disable', async (req, res) => {
  try {
    const user = await requireFullProof(req, res);
    if (!user) return;
    await twoFactor.turnOff(user._id);
    logSecurityEvent('two_factor_change', {
      ...who(user, req), severity: 'medium', message: 'Two-factor sign-in turned off', meta: { action: 'disabled' },
    }).catch(() => {});
    res.json({ enabled: false });
  } catch (err) {
    logError('account', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /account/2fa/recovery-codes { password, code } — replaces the whole set; the old codes stop working.
router.post('/2fa/recovery-codes', async (req, res) => {
  try {
    const user = await requireFullProof(req, res);
    if (!user) return;
    const recoveryCodes = await twoFactor.replaceRecoveryCodes(user._id);
    logSecurityEvent('two_factor_change', {
      ...who(user, req), severity: 'low', message: 'Recovery codes regenerated', meta: { action: 'codes_regenerated' },
    }).catch(() => {});
    res.json({ recoveryCodes });
  } catch (err) {
    logError('account', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ── Staff profile ─────────────────────────────────────────────────────────── */

// PUT /account/profile { name, phone, bio } — a staff member's own details. Email, role and everything else about the account
// stay out of reach here (email is a sign-in identity and is changed by an administrator).
router.put('/profile', async (req, res) => {
  if (req.user.role === 'student') return res.status(403).json({ message: 'Forbidden' });
  const body = req.body || {};
  const set = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 100);
    if (!name) return res.status(400).json({ message: 'Name is required' });
    set.name = name;
  }
  if (body.phone !== undefined) set.phone = String(body.phone).trim().slice(0, 30);
  if (body.bio !== undefined) set.bio = String(body.bio).trim().slice(0, 1000);
  if (!Object.keys(set).length) return res.status(400).json({ message: 'Nothing to update' });
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Settings → Users stores first and last name separately; keep them in step with the display name.
    if (set.name && user.lastName) {
      const parts = set.name.split(/\s+/);
      set.lastName = parts.length > 1 ? parts[parts.length - 1] : set.name;
      set.firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    }
    const updated = await User.findByIdAndUpdate(user._id, { $set: set }, { new: true }).select('-password');
    res.json(updated.toJSON());
  } catch (err) {
    logError('account', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
