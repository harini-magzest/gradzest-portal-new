// Step-up authentication for the SOC.
//
// Being signed in as the owner is not enough to open the SOC: a stolen session token or a left-open laptop would hand
// over every security record, PII access log and the ability to lock accounts. After signing in, the owner proves
// possession of their authenticator app and receives a short-lived SOC token (JWT, default 30 minutes). Every SOC REST
// call must carry it in X-SOC-Token; the live-event socket room is only joined while the token is active.
//
// The token is bound to the owner's user id and to a hash of their browser's User-Agent, carries the enrolment
// version, and is void if issued before `revokedBefore` (sign-out / lockout / reset). The requirement is opt-in:
// set SOC_MFA_REQUIRED=true to enforce it.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const SocMfa = require('../models/SocMfa');

// OFF unless SOC_MFA_REQUIRED=true. (It was on by default; switched to opt-in at the owner's request. The whole
// mechanism — enrolment, token, lockout, live-feed gating — is intact and returns when the setting is "true".)
const required = () => process.env.SOC_MFA_REQUIRED === 'true';
const ttlMinutes = () => Math.max(5, parseInt(process.env.SOC_MFA_TTL_MIN || '30', 10) || 30);
const uaHash = (req) => crypto.createHash('sha256').update(String(req.headers?.['user-agent'] || '')).digest('hex').slice(0, 16);

// A short cache keeps the per-request check to roughly one read per owner every few seconds.
const CACHE_MS = 10 * 1000;
const cache = new Map();
async function getMfa(userId) {
  const key = String(userId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.doc;
  const doc = await SocMfa.findOne({ userId: key }).lean();
  cache.set(key, { doc, at: Date.now() });
  return doc;
}
const invalidate = (userId) => { cache.delete(String(userId)); };

function issueToken(userId, mfa, req) {
  const token = jwt.sign(
    { sub: String(userId), purpose: 'soc', ver: new Date(mfa.enrolledAt).getTime(), uah: uaHash(req) },
    process.env.JWT_SECRET,
    { expiresIn: `${ttlMinutes()}m` },
  );
  return { token, expiresAt: new Date(Date.now() + ttlMinutes() * 60 * 1000) };
}

function tokenIsValid(token, userId, mfa, req) {
  if (!token || !mfa?.enabled) return false;
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p.purpose !== 'soc' || p.sub !== String(userId)) return false;
    if (p.uah !== uaHash(req)) return false;                                   // not the browser it was issued to
    if (p.ver !== new Date(mfa.enrolledAt).getTime()) return false;            // enrolment was reset since
    if (mfa.revokedBefore && p.iat * 1000 < new Date(mfa.revokedBefore).getTime()) return false;
    return true;
  } catch {
    return false;
  }
}

/** Express gate: resolves true if the caller may proceed, otherwise sends the response and resolves false. */
async function socMfaOk(req, res) {
  if (!required()) return true;
  const mfa = await getMfa(req.user.id);
  if (!mfa?.enabled) {
    res.status(403).json({ message: 'Set up two-factor authentication to open the SOC.', code: 'SOC_MFA_SETUP_REQUIRED' });
    return false;
  }
  if (!tokenIsValid(req.headers['x-soc-token'], req.user.id, mfa, req)) {
    res.status(403).json({ message: 'Enter your authenticator code to open the SOC.', code: 'SOC_MFA_REQUIRED' });
    return false;
  }
  return true;
}

// ── who currently has the live feed open (so the socket room follows the same rule) ──
const sessions = new Map(); // userId -> { until, timer }
function grantLive(userId, io) {
  const key = String(userId);
  clearLive(key, null);
  const ms = ttlMinutes() * 60 * 1000;
  const timer = setTimeout(() => clearLive(key, io), ms);
  timer.unref?.();
  sessions.set(key, { until: Date.now() + ms, timer });
  io?.in(`user:${key}`).socketsJoin('admin-room');
}
function clearLive(userId, io) {
  const key = String(userId);
  const s = sessions.get(key);
  if (s) { clearTimeout(s.timer); sessions.delete(key); }
  io?.in(`user:${key}`).socketsLeave('admin-room');
}
const liveActive = (userId) => (sessions.get(String(userId))?.until || 0) > Date.now();

module.exports = { required, ttlMinutes, getMfa, invalidate, issueToken, tokenIsValid, socMfaOk, grantLive, clearLive, liveActive };
