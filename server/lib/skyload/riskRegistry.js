// Skyload's shared reputation store — an in-memory map of IP -> risk score,
// fed by signals from across the app (WAF blocks, login failures, bot
// flags). This is what makes Skyload "adaptive" rather than a flat rate
// limit: an IP that's already misbehaving gets treated more strictly on
// every subsequent request, the same reputation-based idea a real edge
// WAF/bot-management product uses — just in-process instead of
// network-edge, and scoped to what a single server can actually see.
//
// Deliberately in-memory, not persisted: reputation should decay and this
// is meant to catch active abuse in the moment, not build a permanent
// blocklist (that's what BlockedIp + ipBlock.js already do, for confirmed
// threats). Restarting the process resets everyone to neutral, which is
// the right behavior for a reputation signal, not a criminal record.

const DECAY_WINDOW_MS = 10 * 60 * 1000; // a score fully decays 10 minutes after its last bump

const registry = new Map(); // ip -> { score, lastUpdated }

function bump(ip, amount) {
  if (!ip) return;
  const now = Date.now();
  const entry = registry.get(ip);
  if (!entry) {
    registry.set(ip, { score: amount, lastUpdated: now });
    return;
  }
  // Decay whatever score remains based on time elapsed, then add the new bump.
  const elapsed = now - entry.lastUpdated;
  const decayed = Math.max(0, entry.score * (1 - elapsed / DECAY_WINDOW_MS));
  registry.set(ip, { score: decayed + amount, lastUpdated: now });
}

function getScore(ip) {
  const entry = registry.get(ip);
  if (!entry) return 0;
  const elapsed = Date.now() - entry.lastUpdated;
  if (elapsed > DECAY_WINDOW_MS) return 0;
  return Math.max(0, entry.score * (1 - elapsed / DECAY_WINDOW_MS));
}

// Periodic sweep so the map doesn't grow unbounded with fully-decayed entries.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of registry) {
    if (now - entry.lastUpdated > DECAY_WINDOW_MS) registry.delete(ip);
  }
}, 5 * 60 * 1000).unref();

module.exports = { bump, getScore };
