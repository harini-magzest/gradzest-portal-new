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

const BOT_FLAG_THRESHOLD = 4;

function skyload(req, res, next) {
  // Monitoring/health-check traffic is expected to look "bot-like" (no
  // browser headers, high frequency from uptime checkers) — exempt it
  // rather than generate constant false flags against legitimate infra.
  if (req.path === '/api/health') return next();

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

module.exports = { skyload };
