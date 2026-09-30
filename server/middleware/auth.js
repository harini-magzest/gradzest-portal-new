const jwt = require('jsonwebtoken');
const { logSecurityEvent } = require('./logSecurityEvent');

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
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
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
