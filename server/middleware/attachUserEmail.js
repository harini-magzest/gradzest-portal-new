const User = require('../models/User');

// authMiddleware only decodes the JWT (id, role) — the token itself carries
// no email/name. Routes that need the current user's email/name for logging
// (PII access, analyst actions) mount this after authMiddleware to fetch it
// once per request, rather than changing what's embedded in the token.
module.exports = async function attachUserEmail(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('email name').lean();
    if (user) {
      req.user.email = user.email;
      req.user.name = user.name;
    }
  } catch {
    // Best effort — logging degrades gracefully (blank email) if this fails.
  }
  next();
};
