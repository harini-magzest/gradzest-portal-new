const { verifyAccessToken } = require('../lib/tokens');
const { logSecurityEvent } = require('./logSecurityEvent');
const { isBlocked } = require('../lib/accountState');

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
      message: `Rejected token on ${req.method} ${req.originalUrl}`,
      meta: { path: req.originalUrl },
    }).catch(() => {});
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // A valid token is not enough: a deleted, deactivated or admin-locked account is cut off immediately,
  // not when its 15-minute token happens to expire.
  if (await isBlocked(req.user.id)) {
    return res.status(401).json({ message: 'This account is no longer active.', code: 'ACCOUNT_DISABLED' });
  }
  next();
};
