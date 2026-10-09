// Who a request should be counted against for rate limiting and bot scoring.
//
// A signed-in request is counted against its USER, not its IP address. Counselling offices, campuses and mobile
// carriers put many people behind one public IP, so counting by IP made them share one budget: a single dashboard
// load fires dozens of requests, which looked like a bot, flagged the shared IP, and cut everyone on it to 4
// concurrent requests (the "Failed to load … Too many concurrent requests" banners). Anonymous requests are still
// counted per IP. Only a token that verifies earns its own key, so an attacker cannot mint keys by forging one.

function userIdFromToken(req) {
  const token = req.headers?.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    const payload = require('./jwt').verifyAccessToken(token);
    return payload?.id ? String(payload.id) : null;
  } catch {
    return null;
  }
}

/** 'user:<id>' for a valid signed-in request, otherwise the client IP. */
function clientKey(req) {
  const id = userIdFromToken(req);
  return id ? `user:${id}` : req.ip;
}

// Logo and favicon images are fetched by the dozen on any page that lists universities. They are cacheable GETs, not
// data calls, so they get their own (larger) budget and never count towards the bot-velocity score or crowd out data.
function isAssetRequest(req) {
  if (req.method !== 'GET') return false;
  const path = String(req.originalUrl || req.url || req.path || '').split('?')[0];
  return path.startsWith('/api/unilogo/') || path.startsWith('/api/favicon/');
}

module.exports = { clientKey, isAssetRequest, userIdFromToken };
