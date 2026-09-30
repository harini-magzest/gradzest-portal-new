// In-memory cache of active suppression rules, consulted before any detection
// rule opens a new incident. Refreshed on a timer and immediately after any
// change made through the SOC API.

const { buildIpMatcher, normalizeIp } = require('./ipMatch');

const REFRESH_INTERVAL_MS = 30 * 1000;

let rules = [];
let ipMatchers = new Map(); // rule id -> matcher
let loadedAt = 0;
let refreshing = null;

async function refreshSuppressions() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const SuppressionRule = require('../models/SuppressionRule');
      rules = await SuppressionRule.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).lean();
      ipMatchers = new Map(rules.filter((r) => r.kind === 'ip').map((r) => [String(r._id), buildIpMatcher([r.value])]));
      loadedAt = Date.now();
    } catch (err) {
      console.error('[suppression] Failed to refresh rules:', err.message);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function isSuppressed(incidentType, { ip = '', email = '' } = {}) {
  if (Date.now() - loadedAt > REFRESH_INTERVAL_MS) await refreshSuppressions();
  const now = Date.now();
  const lowerEmail = (email || '').toLowerCase();
  const normIp = normalizeIp(ip);
  return rules.some((r) => {
    if (r.expiresAt && new Date(r.expiresAt).getTime() <= now) return false;
    if (r.incidentTypes?.length && !r.incidentTypes.includes(incidentType)) return false;
    if (r.kind === 'ip') return !!normIp && !!ipMatchers.get(String(r._id))?.(normIp);
    return !!lowerEmail && r.value.toLowerCase() === lowerEmail;
  });
}

module.exports = { isSuppressed, refreshSuppressions };
