// Rejects every request from an IP on the SOC blocklist, as early in the
// middleware chain as possible (before CORS/helmet/rate-limiters) — a blocked
// IP shouldn't get to browse the public site either, not just auth endpoints.
//
// The blocklist is cached in memory (a DB hit on every single request would be
// wasteful) and refreshed periodically; block/unblock API calls also trigger
// an immediate refresh so changes take effect without waiting for the next tick.

const REFRESH_INTERVAL_MS = 30 * 1000;

let blockedSet = new Set();
let refreshing = null;

async function refreshBlockedIps() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const BlockedIp = require('../models/BlockedIp');
      const rows = await BlockedIp.find({}, 'ip').lean();
      blockedSet = new Set(rows.map((r) => r.ip));
    } catch (err) {
      console.error('[ipBlock] Failed to refresh blocklist:', err.message);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

setInterval(() => { refreshBlockedIps().catch(() => {}); }, REFRESH_INTERVAL_MS).unref();

function ipBlockMiddleware(req, res, next) {
  if (blockedSet.has(req.ip)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  next();
}

module.exports = { ipBlockMiddleware, refreshBlockedIps };
