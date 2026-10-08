// The failed-attempt counter and 15-minute lockout that guard the password at sign-in, for the other places that also
// ask someone to prove who they are: the second sign-in step, and the password re-check before a security change. Wrong
// answers anywhere count toward the same lockout, so a code or password cannot be guessed on a side door.

const User = require('../models/User');
const { logSecurityEvent } = require('../middleware/logSecurityEvent');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

// The message to show if this account is locked right now, or null. A lock an administrator set from the SOC runs to
// 2099 and does not expire on its own.
function lockMessage(user) {
  if (!user.lockedUntil || user.lockedUntil <= Date.now()) return null;
  if (new Date(user.lockedUntil).getFullYear() >= 2090) return 'This account has been locked by an administrator. Please contact support.';
  const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
  return `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`;
}

// Counts one wrong answer, locks the account at the limit, and logs it for the SOC (a failed login, plus a lockout event
// when this one tipped it over). Returns { locked, remaining }.
async function registerFailedAttempt(user, req, { message, meta = {} }) {
  const attempts = (user.loginAttempts || 0) + 1;
  const locked = attempts >= MAX_LOGIN_ATTEMPTS;
  await User.updateOne({ _id: user._id }, {
    loginAttempts: attempts,
    ...(locked && { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) }),
  });
  const who = { userId: user._id, email: user.email, role: user.role, ip: req.ip, userAgent: req.headers['user-agent'] || '' };
  logSecurityEvent('login_failure', {
    ...who, severity: locked ? 'high' : 'medium',
    message: `${message} (attempt ${attempts}/${MAX_LOGIN_ATTEMPTS})`, meta,
  }).catch(() => {});
  if (locked) {
    logSecurityEvent('login_lockout', { ...who, severity: 'high', message: 'Account locked for 15 minutes after too many failed attempts' }).catch(() => {});
  }
  return { locked, remaining: Math.max(MAX_LOGIN_ATTEMPTS - attempts, 0) };
}

module.exports = { MAX_LOGIN_ATTEMPTS, LOCK_DURATION_MS, lockMessage, registerFailedAttempt };
