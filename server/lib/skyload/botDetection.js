// Skyload bot/anomaly heuristics — scores each request on signals real
// browsers almost always send and bots/scripts often don't. This is a
// SCORING system, not a single-trigger hard block: any one missing header
// is common for legitimate tools (curl, uptime monitors, health checks), so
// only a request that stacks multiple signals gets flagged. Velocity
// (many requests in a short window from one IP) is the strongest signal
// and is weighted heaviest, matching how real bot-management products
// prioritize behavioral signals over static header checks.

const requestLog = new Map(); // ip -> array of recent request timestamps
const VELOCITY_WINDOW_MS = 5000;
const VELOCITY_THRESHOLD = 20; // requests within the window to count as "bot-fast"

const KNOWN_TOOL_USER_AGENTS = /^(curl|wget|python-requests|scrapy|go-http-client|java\/|libwww-perl)/i;

function recordAndCheckVelocity(ip) {
  if (!ip) return 0;
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < VELOCITY_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length;
}

function scoreRequest(req) {
  let score = 0;
  const reasons = [];

  const ua = req.headers['user-agent'] || '';
  if (!ua) {
    score += 2;
    reasons.push('missing user-agent');
  } else if (KNOWN_TOOL_USER_AGENTS.test(ua)) {
    score += 1; // mild — legitimate scripts/health-checks use these too, not damning on its own
    reasons.push('scripted-tool user-agent');
  }

  if (!req.headers['accept-language']) {
    score += 1;
    reasons.push('missing accept-language');
  }
  if (!req.headers['accept']) {
    score += 1;
    reasons.push('missing accept');
  }

  const requestCount = recordAndCheckVelocity(req.ip);
  if (requestCount > VELOCITY_THRESHOLD) {
    score += 5; // the strongest signal — real browsing humans don't fire 20+ requests in 5s
    reasons.push(`${requestCount} requests in ${VELOCITY_WINDOW_MS / 1000}s`);
  }

  return { score, reasons };
}

// Periodic cleanup of stale per-IP velocity tracking.
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestLog) {
    const fresh = timestamps.filter((t) => now - t < VELOCITY_WINDOW_MS);
    if (fresh.length === 0) requestLog.delete(ip);
    else requestLog.set(ip, fresh);
  }
}, 60 * 1000).unref();

module.exports = { scoreRequest };
