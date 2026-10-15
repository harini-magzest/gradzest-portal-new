const SecurityEvent = require('../models/SecurityEvent');
const detect = require('../lib/detectIncidents');

// Which detection rules run after each event type is persisted.
const RULES_BY_EVENT_TYPE = {
  login_failure: [detect.checkLoginFailureRules, detect.checkCredentialStuffingRule],
  login_lockout: [detect.checkLockoutRule],
  waf_block: [detect.checkWafBlockRule],
  skyload_bot_flag: [detect.checkSkyloadBotRule],
  login_success: [detect.checkImpossibleTravelRule, detect.checkOffHoursAdminRule, detect.checkNewDevicePrivilegedRule],
  password_reset_request: [detect.checkPasswordResetAbuseRule],
  privilege_change: [detect.checkPrivilegeChangeRule],
  data_export: [detect.checkMassExportRule],
};

// Holds the Socket.io server instance — set once at startup via initSecurityLogger()
let _io = null;

function initSecurityLogger(io) {
  _io = io;
}

/**
 * Log a security event to MongoDB, broadcast it to connected admins, and run
 * the relevant detection rule (if any) against it.
 *
 * @param {string} type - any SecurityEvent type; RULES_BY_EVENT_TYPE above says
 *                         which ones also run detection rules
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
    for (const rule of RULES_BY_EVENT_TYPE[type] || []) {
      rule(entry, _io).catch((err) => console.error('[detectIncidents] Failed:', err.message));
    }

    return entry;
  } catch (err) {
    console.error('[logSecurityEvent] Failed:', err.message);
    return null;
  }
}

module.exports = { logSecurityEvent, initSecurityLogger };
