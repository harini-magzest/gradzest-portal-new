// Skyload — this app's self-hosted replica of the parts of Cloudflare's
// edge operations that are actually achievable without real network-edge
// infrastructure: adaptive rate/connection limiting, bot/anomaly
// heuristics, and IP reputation that gets stricter as an IP misbehaves.
//
// What Skyload deliberately does NOT claim to be: DDoS/volumetric
// protection. That requires absorbing attack traffic across many
// geographically distributed data centers before it reaches this server's
// single network link — no code running ON this server can do that, because
// by the time a flood of traffic reaches code running here, the network
// pipe is already saturated. Building something that pretended to do this
// would be fake security theater, so Skyload doesn't attempt it. What it
// does do — connection throttling, bot scoring, adaptive reputation — is
// real, application-layer protection against abuse patterns a single
// server genuinely can defend against.

const { scoreRequest } = require('../lib/skyload/botDetection');
const { tryAcquire, release } = require('../lib/skyload/connectionThrottle');
const { bump } = require('../lib/skyload/riskRegistry');
const { logSecurityEvent } = require('./logSecurityEvent');
const jwt = require('jsonwebtoken');

const BOT_FLAG_THRESHOLD = 4;

// A signed-in full admin using the SOC is not a bot, even though one dashboard load legitimately fires a couple of dozen
// parallel requests. Scoring those as "bot-fast" raised the owner's own IP risk, which cut that IP's concurrent-request
// allowance from 15 to 4 for ten minutes — so sections of the dashboard intermittently failed to load. Requests under
// /api/soc carrying a valid full-admin token are therefore neither scored nor throttled (they are still authenticated,
// authorised as owner and audited by the SOC routes themselves). Everything else, including every unauthenticated
// request and every non-admin token, is treated exactly as before.
// Uses originalUrl so it also works when called from a limiter mounted under /api (where req.path is relative), and
// matches /api/soc exactly or /api/soc/… — never a lookalike such as /api/socks.
function isTrustedSocAdmin(req) {
  const path = String(req.originalUrl || req.url || req.path || '').split('?')[0];
  if (path !== '/api/soc' && !path.startsWith('/api/soc/')) return false;
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return false;
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    return p.role === 'admin' && !p.isAppTeam;
  } catch {
    return false;
  }
}

function skyload(req, res, next) {
  // Monitoring/health-check traffic is expected to look "bot-like" (no
  // browser headers, high frequency from uptime checkers) — exempt it
  // rather than generate constant false flags against legitimate infra.
  if (req.path === '/api/health') return next();
  if (isTrustedSocAdmin(req)) return next();

  if (!tryAcquire(req.ip)) {
    return res.status(429).json({ message: 'Too many concurrent requests from this connection. Please slow down.' });
  }
  let released = false;
  const releaseOnce = () => { if (!released) { released = true; release(req.ip); } };
  res.on('finish', releaseOnce);
  res.on('close', releaseOnce);

  const { score, reasons } = scoreRequest(req);
  if (score >= BOT_FLAG_THRESHOLD) {
    bump(req.ip, score);
    logSecurityEvent('skyload_bot_flag', {
      severity: score >= 6 ? 'high' : 'medium',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      message: `Skyload flagged ${req.method} ${req.originalUrl} (score ${score}): ${reasons.join(', ')}`,
      meta: { score, reasons },
    }).catch(() => {});
  }

  next();
}

module.exports = { skyload, isTrustedSocAdmin };
