// Rejects every request from an IP on the SOC blocklist, as early in the
// middleware chain as possible (before CORS/helmet/rate-limiters) — a blocked
// IP shouldn't get to browse the public site either, not just auth endpoints.
//
// The blocklist (single IPs and CIDR ranges) is cached in memory (a DB hit on
// every single request would be wasteful) and refreshed periodically;
// block/unblock API calls also trigger an immediate refresh so changes take
// effect without waiting for the next tick. Expired temporary blocks are
// filtered out on every refresh even before Mongo's TTL monitor deletes them.

const { buildIpMatcher } = require('../lib/ipMatch');

const REFRESH_INTERVAL_MS = 30 * 1000;

let isBlocked = () => false;
let refreshing = null;

async function refreshBlockedIps() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const BlockedIp = require('../models/BlockedIp');
      const rows = await BlockedIp.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }, 'ip').lean();
      isBlocked = buildIpMatcher(rows.map((r) => r.ip));
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
  if (isBlocked(req.ip)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  next();
}

module.exports = { ipBlockMiddleware, refreshBlockedIps };
