const { verifyAccessToken } = require('../lib/jwt');
const { logSecurityEvent } = require('./logSecurityEvent');
const { redactUrl } = require('../lib/redactUrl');
const { isBlocked, tokenRoleIsCurrent, tokenRevoked } = require('../lib/accountState');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = verifyAccessToken(token);
  } catch (err) {
    // Fire-and-forget — this runs on nearly every protected request, so it
    // must never add latency or be able to fail the response.
    logSecurityEvent(err.name === 'TokenExpiredError' ? 'token_expired' : 'token_invalid', {
      severity: 'low',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      message: `Rejected token on ${req.method} ${redactUrl(req.originalUrl)}`,
      meta: { path: redactUrl(req.originalUrl) },
    }).catch(() => {});
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // A valid token is not enough: a deleted, deactivated or admin-locked account is cut off immediately,
  // not when its 15-minute token happens to expire.
  if (await isBlocked(req.user.id)) {
    return res.status(401).json({ message: 'This account is no longer active.', code: 'ACCOUNT_DISABLED' });
  }
  // Signed out everywhere after this token was issued (password rotated, sessions revoked): the browser's refresh then
  // fails too, so the person signs in again
  if (await tokenRevoked(req.user)) {
    return res.status(401).json({ message: 'You were signed out. Please sign in again.', code: 'SESSION_REVOKED' });
  }
  // Privileges are re-checked against the account on every request, not taken from the token alone: a demoted admin or
  // a counselor moved off the Application Team loses the old rights within seconds. The browser refreshes its token on
  // a 401 and retries, and the new token carries the current role.
  if (!(await tokenRoleIsCurrent(req.user))) {
    return res.status(401).json({ message: 'Your access has changed. Please try again.', code: 'ROLE_CHANGED' });
  }
  next();
};
