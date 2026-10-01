const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

const authMiddleware = require('../middleware/auth');
const attachUserEmail = require('../middleware/attachUserEmail');
const { logSecurityEvent } = require('../middleware/logSecurityEvent');
const User = require('../models/User');
const SocMfa = require('../models/SocMfa');
const totp = require('../lib/totp');
const socMfa = require('../lib/socMfa');
const { isSocOwnerEmail } = require('../lib/socOwners');

// Enrolment and verification of the SOC owner's authenticator app. Reachable only by the owner (signed in, full admin,
// listed in SOC_OWNER_EMAILS) but, unlike the SOC itself, NOT behind the step-up token — this is where it is obtained.
const router = express.Router();

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const ISSUER = 'Gradzest SOC';

async function ownerOnly(req, res, next) {
  if (req.user.role !== 'admin' || req.user.isAppTeam || !isSocOwnerEmail(req.user.email)) {
    return res.status(403).json({ message: 'Not authorised for the SOC' });
  }
  next();
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? String(req.user.id) : ipKeyGenerator(req.ip)),
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many attempts. Try again later.' },
});

router.use(authMiddleware, attachUserEmail, ownerOnly, limiter);

const event = (req, type, severity, message) => logSecurityEvent(type, {
  severity, userId: req.user.id, email: req.user.email || '', role: req.user.role,
  ip: req.ip, userAgent: req.headers['user-agent'] || '', message,
}).catch(() => {});

const normalizeRecovery = (c) => String(c || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
const hashRecovery = (c) => crypto.createHash('sha256').update(normalizeRecovery(c)).digest('hex');
function newRecoveryCodes(count = 10) {
  const codes = Array.from({ length: count }, () => {
    const raw = totp.base32Encode(crypto.randomBytes(7)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashRecovery) };
}

const lockedResponse = (res, mfa) => res.status(429).json({
  message: `Too many wrong codes. Locked until ${new Date(mfa.lockedUntil).toLocaleTimeString('en-IN')}.`,
  code: 'SOC_MFA_LOCKED', lockedUntil: mfa.lockedUntil,
});

// Counts a failure; at MAX_FAILURES the owner is locked out for 15 minutes, every open SOC session is voided, and an
// incident is raised (someone who has the owner's password is guessing codes).
async function registerFailure(req, res, mfa, what) {
  mfa.failedAttempts += 1;
  const locked = mfa.failedAttempts >= MAX_FAILURES;
  if (locked) {
    mfa.lockedUntil = new Date(Date.now() + LOCK_MS);
    mfa.failedAttempts = 0;
    mfa.revokedBefore = new Date();
    socMfa.clearLive(req.user.id, req.app.get('io'));
  }
  await mfa.save();
  socMfa.invalidate(req.user.id);
  event(req, 'soc_mfa_failure', 'high', `${what}${locked ? ` — locked for 15 minutes after ${MAX_FAILURES} failures` : ''}`);
  if (locked) {
    require('../lib/detectIncidents').raiseSocMfaLockoutIncident({ email: req.user.email, ip: req.ip, userId: req.user.id }, req.app.get('io'))
      .catch((err) => console.error('[socAuth] incident failed:', err.message));
    return lockedResponse(res, mfa);
  }
  return res.status(401).json({ message: 'That code is not valid.', attemptsLeft: MAX_FAILURES - mfa.failedAttempts });
}

// GET /api/soc-auth/status — what the SOC page needs to decide which screen to show.
router.get('/status', async (req, res) => {
  try {
    const required = socMfa.required();
    const mfa = await SocMfa.findOne({ userId: req.user.id }).lean();
    const verified = !required || socMfa.tokenIsValid(req.headers['x-soc-token'], req.user.id, mfa, req);
    res.json({
      required, enrolled: !!mfa?.enabled, verified,
      lockedUntil: mfa?.lockedUntil && new Date(mfa.lockedUntil) > new Date() ? mfa.lockedUntil : null,
      ttlMinutes: socMfa.ttlMinutes(), recoveryCodesLeft: mfa?.enabled ? mfa.recoveryHashes.length : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/soc-auth/setup { password } — starts enrolment. Re-asks for the password so a hijacked session alone
// can't enrol an attacker's authenticator. Refused once MFA is on (turning it off or re-enrolling needs server access:
// scripts/resetSocMfa.js).
router.post('/setup', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('password');
    if (!user || !(await bcrypt.compare(String(req.body?.password || ''), user.password || ''))) {
      event(req, 'soc_mfa_failure', 'high', 'Wrong password while starting SOC two-factor enrolment');
      return res.status(401).json({ message: 'Password is incorrect.' });
    }
    const existing = await SocMfa.findOne({ userId: req.user.id });
    if (existing?.enabled) return res.status(409).json({ message: 'Two-factor authentication is already set up. To change it, use the server reset script.' });

    const secret = totp.generateSecret();
    await SocMfa.findOneAndUpdate({ userId: req.user.id }, { userId: req.user.id, secret, enabled: false, failedAttempts: 0 }, { upsert: true });
    socMfa.invalidate(req.user.id);
    res.json({ secret, otpauthUrl: totp.otpauthUrl({ secret, account: req.user.email, issuer: ISSUER }) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/soc-auth/confirm { code } — proves the app was set up correctly, turns MFA on and returns the one-time
// recovery codes plus an SOC token (the owner just proved possession, so no second prompt).
router.post('/confirm', async (req, res) => {
  try {
    const mfa = await SocMfa.findOne({ userId: req.user.id });
    if (!mfa || mfa.enabled || !mfa.secret) return res.status(409).json({ message: 'Start setup first.' });
    if (mfa.lockedUntil && mfa.lockedUntil > new Date()) return lockedResponse(res, mfa);

    const step = totp.verifyTotp(mfa.secret, req.body?.code);
    if (step === null) return registerFailure(req, res, mfa, 'Wrong code while confirming SOC two-factor enrolment');

    const { codes, hashes } = newRecoveryCodes();
    mfa.enabled = true; mfa.enrolledAt = new Date(); mfa.lastUsedStep = step;
    mfa.recoveryHashes = hashes; mfa.failedAttempts = 0; mfa.lockedUntil = null;
    await mfa.save();
    socMfa.invalidate(req.user.id);
    event(req, 'soc_mfa_enrolled', 'medium', 'SOC two-factor authentication enabled');

    const { token, expiresAt } = socMfa.issueToken(req.user.id, mfa, req);
    socMfa.grantLive(req.user.id, req.app.get('io'));
    res.json({ recoveryCodes: codes, socToken: token, expiresAt });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/soc-auth/verify { code } or { recoveryCode } — exchanges a valid code for an SOC token.
router.post('/verify', async (req, res) => {
  try {
    const mfa = await SocMfa.findOne({ userId: req.user.id });
    if (!mfa?.enabled) return res.status(409).json({ message: 'Two-factor authentication is not set up.', code: 'SOC_MFA_SETUP_REQUIRED' });
    if (mfa.lockedUntil && mfa.lockedUntil > new Date()) return lockedResponse(res, mfa);

    if (req.body?.recoveryCode) {
      const h = hashRecovery(req.body.recoveryCode);
      if (!mfa.recoveryHashes.includes(h)) return registerFailure(req, res, mfa, 'Invalid SOC recovery code');
      mfa.recoveryHashes = mfa.recoveryHashes.filter((x) => x !== h); // single use
      event(req, 'soc_mfa_success', 'medium', `SOC opened with a recovery code (${mfa.recoveryHashes.length} left)`);
    } else {
      const step = totp.verifyTotp(mfa.secret, req.body?.code, { afterStep: mfa.lastUsedStep });
      if (step === null) return registerFailure(req, res, mfa, 'Invalid SOC authenticator code');
      mfa.lastUsedStep = step;
      event(req, 'soc_mfa_success', 'info', 'SOC opened with an authenticator code');
    }
    mfa.failedAttempts = 0; mfa.lockedUntil = null;
    await mfa.save();
    socMfa.invalidate(req.user.id);

    const { token, expiresAt } = socMfa.issueToken(req.user.id, mfa, req);
    socMfa.grantLive(req.user.id, req.app.get('io'));
    res.json({ socToken: token, expiresAt, recoveryCodesLeft: mfa.recoveryHashes.length });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/soc-auth/logout — closes the SOC now: voids every token issued so far and leaves the live feed.
router.post('/logout', async (req, res) => {
  try {
    await SocMfa.updateOne({ userId: req.user.id }, { revokedBefore: new Date() });
    socMfa.invalidate(req.user.id);
    socMfa.clearLive(req.user.id, req.app.get('io'));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
