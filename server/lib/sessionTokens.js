// Access tokens, refresh-token sessions and the refresh cookie. Shared by every route that starts a session: sign-in
// (routes/auth.js) and the password change (routes/account.js), which replaces this device's session after revoking the rest.

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const MAX_SESSIONS = 5;

function issueAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role, isAppTeam: !!user.isAppTeam }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

// Issues a new refresh token as its own session, independent of any other
// device the user is already logged in on (up to MAX_SESSIONS at a time;
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

// The cookie is scoped to /api/auth, so the browser sends it only to the auth routes. A route elsewhere cannot tell which
// session a request belongs to, but it can still set a new one with this.
function setRefreshCookie(res, token, expires) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires,
    path: '/api/auth',
  });
}

module.exports = { MAX_SESSIONS, issueAccessToken, issueRefreshToken, setRefreshCookie };
