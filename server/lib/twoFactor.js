// Two-factor sign-in with an authenticator app. The user document holds the state (see `twoFactor` in models/User.js);
// this module is the only code that reads or writes the secret fields.
//
//   setup      beginSetup() stores a pending secret; confirmSetup() turns 2FA on once the user proves their app has it
//              and hands back one-time recovery codes (shown once, stored only as keyed hashes).
//   sign-in    signChallenge()/readChallenge() carry "this password was right" between the two login steps;
//              consumeSecondFactor() accepts an authenticator code or a recovery code, once.
//
// Single use is enforced in the database, not in memory: each accepted code is claimed with a conditional update, so two
// requests carrying the same code at the same moment cannot both succeed.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { encrypt, decrypt } = require('./fieldCrypto');
const totp = require('./totp');

const ISSUER = 'Gradzest';
const RECOVERY_CODE_COUNT = 10;
const CHALLENGE_TTL_SECONDS = 5 * 60;

// Add these to a query to read the secret fields, which are `select: false` on the schema.
const SECRET_FIELDS = '+twoFactor.secret +twoFactor.pendingSecret +twoFactor.recoveryCodes +twoFactor.lastStep';

// Keys derived from JWT_SECRET, one per purpose, so none of them can stand in for another (or for an access token).
const derivedKey = (purpose) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(purpose).digest();

/* ── Sign-in challenge ─────────────────────────────────────────────────────── */

// Proof that the password step succeeded, valid for five minutes. It is signed with its own key, so it can never pass as
// an access token (and an access token can never pass as one of these).
const signChallenge = (userId) => jwt.sign({ sub: String(userId), purpose: '2fa' }, derivedKey('2fa-challenge:v1'), { expiresIn: CHALLENGE_TTL_SECONDS });

function readChallenge(token) {
  try {
    const payload = jwt.verify(String(token || ''), derivedKey('2fa-challenge:v1'));
    return payload.purpose === '2fa' ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

/* ── Recovery codes ────────────────────────────────────────────────────────── */

// Keyed, so a copy of the database alone cannot be used to work the codes out offline.
const hashRecoveryCode = (normalized) => crypto.createHmac('sha256', derivedKey('2fa-recovery:v1')).update(normalized).digest('hex');
const normalizeRecoveryCode = (code) => String(code ?? '').toLowerCase().replace(/[\s-]/g, '');
const looksLikeRecoveryCode = (normalized) => /^[0-9a-f]{12}$/.test(normalized);

// 48 random bits each, written xxxx-xxxx-xxxx. Returned in the clear exactly once; only the hashes are stored.
function generateRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const hex = crypto.randomBytes(6).toString('hex');
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
  });
  return { codes, hashes: codes.map((c) => hashRecoveryCode(normalizeRecoveryCode(c))) };
}

/* ── Setup ─────────────────────────────────────────────────────────────────── */

async function beginSetup(userId, account) {
  const secret = totp.generateSecret();
  await User.updateOne({ _id: userId }, { $set: { 'twoFactor.pendingSecret': encrypt(secret) } });
  return { secret, otpauthUri: totp.otpauthUri({ secret, account, issuer: ISSUER }) };
}

// `user` must have been loaded with SECRET_FIELDS.
async function confirmSetup(user, code) {
  const pending = user.twoFactor?.pendingSecret ? decrypt(user.twoFactor.pendingSecret) : '';
  if (!pending) return { ok: false, reason: 'no_setup' };
  const step = totp.verifyTotp(pending, code);
  if (step === null) return { ok: false, reason: 'invalid' };
  const { codes, hashes } = generateRecoveryCodes();
  await User.updateOne({ _id: user._id }, {
    $set: {
      // Encrypt `pending` here instead of copying what was read: the User model decrypts the values it loads (the encrypted-
      // at-rest PII fields use the same read hook), so the field is plaintext by now and copying it would store the key unprotected.
      'twoFactor.enabled': true, 'twoFactor.enabledAt': new Date(), 'twoFactor.secret': encrypt(pending),
      'twoFactor.recoveryCodes': hashes, 'twoFactor.lastStep': step,
    },
    $unset: { 'twoFactor.pendingSecret': 1 },
  });
  return { ok: true, recoveryCodes: codes };
}

async function replaceRecoveryCodes(userId) {
  const { codes, hashes } = generateRecoveryCodes();
  await User.updateOne({ _id: userId }, { $set: { 'twoFactor.recoveryCodes': hashes } });
  return codes;
}

const turnOff = (userId) => User.updateOne({ _id: userId }, {
  $set: { 'twoFactor.enabled': false },
  $unset: { 'twoFactor.secret': 1, 'twoFactor.pendingSecret': 1, 'twoFactor.recoveryCodes': 1, 'twoFactor.lastStep': 1, 'twoFactor.enabledAt': 1 },
});

/* ── Sign-in ───────────────────────────────────────────────────────────────── */

/**
 * Accepts an authenticator code or an unused recovery code, and uses it up. `user` must have been loaded with
 * SECRET_FIELDS. Returns { ok: true, method, remaining? } or { ok: false, reason }.
 */
async function consumeSecondFactor(user, code) {
  const tf = user.twoFactor || {};
  const secret = tf.enabled && tf.secret ? decrypt(tf.secret) : '';
  // A secret that is missing or will not decrypt means this account cannot be verified: refuse, never wave it through.
  if (!secret) return { ok: false, reason: 'not_configured' };

  const step = totp.verifyTotp(secret, code, { afterStep: tf.lastStep ?? -1 });
  // A correct code from a step that was already used (typing it twice, or signing in again within the same 30 seconds as
  // the last time) gets its own reason, so the person is told to wait for the next code instead of "invalid".
  if (step === null && totp.verifyTotp(secret, code) !== null) return { ok: false, reason: 'already_used' };
  if (step !== null) {
    // Claim the step; if another request got there first (the same code sent twice), this one loses.
    const claimed = await User.updateOne({ _id: user._id, 'twoFactor.lastStep': { $not: { $gte: step } } }, { $set: { 'twoFactor.lastStep': step } });
    return claimed.modifiedCount === 1 ? { ok: true, method: 'totp' } : { ok: false, reason: 'replayed' };
  }

  const normalized = normalizeRecoveryCode(code);
  if (looksLikeRecoveryCode(normalized)) {
    const hash = hashRecoveryCode(normalized);
    if ((tf.recoveryCodes || []).includes(hash)) {
      const claimed = await User.updateOne({ _id: user._id, 'twoFactor.recoveryCodes': hash }, { $pull: { 'twoFactor.recoveryCodes': hash } });
      if (claimed.modifiedCount === 1) return { ok: true, method: 'recovery', remaining: tf.recoveryCodes.length - 1 };
    }
  }
  return { ok: false, reason: 'invalid' };
}

module.exports = {
  ISSUER, RECOVERY_CODE_COUNT, CHALLENGE_TTL_SECONDS, SECRET_FIELDS,
  signChallenge, readChallenge,
  generateRecoveryCodes, hashRecoveryCode,
  beginSetup, confirmSetup, replaceRecoveryCodes, turnOff, consumeSecondFactor,
};
