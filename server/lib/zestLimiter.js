// Per-user cap on Zest questions. Every question costs model quota (and, on a free Gemini key, a shared
// requests-per-minute allowance), so without this one signed-in user — or a runaway script — can use it all
// up and switch Zest off for everyone. Keyed on the authenticated user id, not the IP, so a whole office
// behind one address is not throttled together. The global /api limiter (120/min per IP) still applies on top.

const rateLimit = require('express-rate-limit');

function createZestLimiter({ windowMs = 10 * 60 * 1000, max = 30 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `zest:${req.user?.id || 'anonymous'}`,
    validate: { keyGeneratorIpFallback: false },
    message: { message: `You have asked Zest a lot of questions — please wait a few minutes before asking again (limit ${max} per ${Math.round(windowMs / 60000)} minutes).` },
  });
}

module.exports = { createZestLimiter };
