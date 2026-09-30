const SecurityEvent = require('../models/SecurityEvent');
const { checkLoginFailureRules, checkLockoutRule, checkWafBlockRule, checkSkyloadBotRule } = require('../lib/detectIncidents');

// Holds the Socket.io server instance — set once at startup via initSecurityLogger()
let _io = null;

function initSecurityLogger(io) {
  _io = io;
}

/**
 * Log a security event to MongoDB, broadcast it to connected admins, and run
 * the relevant detection rule (if any) against it.
 *
 * @param {string} type - login_success | login_failure | login_lockout |
 *                         logout | token_invalid | token_expired | password_reset
 * @param {object} options
 *   @param {string}       options.severity
 *   @param {ObjectId|null} options.userId
 *   @param {string}       options.email
 *   @param {string}       options.role
 *   @param {string}       options.ip
 *   @param {string}       options.userAgent
 *   @param {string}       options.message
 *   @param {object}       options.meta
 *
 * Returns the saved SecurityEvent document, or null if logging fails.
 * Logging failures are intentionally swallowed so they never crash other routes.
 */
async function logSecurityEvent(type, options = {}) {
  try {
    const {
      severity = 'info',
      userId = null,
      email = '',
      role = '',
      ip = '',
      userAgent = '',
      message = '',
      meta = {},
    } = options;

    const entry = await SecurityEvent.create({
      type, severity, userId: userId || null, email, role, ip, userAgent, message, meta,
    });

    if (_io) {
      _io.to('admin-room').emit('security_event', entry.toObject());
    }

    // Detection rules — fire-and-forget, must never block or fail the caller.
    if (type === 'login_failure') {
      checkLoginFailureRules(entry, _io).catch((err) => console.error('[detectIncidents] Failed:', err.message));
    } else if (type === 'login_lockout') {
      checkLockoutRule(entry, _io).catch((err) => console.error('[detectIncidents] Failed:', err.message));
    } else if (type === 'waf_block') {
      checkWafBlockRule(entry, _io).catch((err) => console.error('[detectIncidents] Failed:', err.message));
    } else if (type === 'skyload_bot_flag') {
      checkSkyloadBotRule(entry, _io).catch((err) => console.error('[detectIncidents] Failed:', err.message));
    }

    return entry;
  } catch (err) {
    console.error('[logSecurityEvent] Failed:', err.message);
    return null;
  }
}

module.exports = { logSecurityEvent, initSecurityLogger };
