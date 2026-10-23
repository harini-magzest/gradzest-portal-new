// Helpers every SOC route file uses: the owner-only gate, search over encrypted fields, CSV export logging and a few
// constants. Kept apart from the routes so each area file only pulls in what it needs.
const User = require('../../models/User');
const { logSecurityEvent } = require('../../middleware/logSecurityEvent');
const { isSocOwnerEmail } = require('../../lib/socOwners');

// Manual check only: a link to the file's page on virustotal.com, built from its SHA-256. Nothing is sent automatically.
const vtLink = (sha256) => `https://www.virustotal.com/gui/file/${sha256}`;

const LOCKED_BY_ADMIN_UNTIL = new Date('2099-01-01T00:00:00Z');
// An unreachable or hanging SMTP server must not hang an analyst's request: give up after a bounded wait.
const sendMailWithTimeout = (mailer, options, ms = 8000) => Promise.race([
  mailer.sendMail(options),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Mail server did not respond in time')), ms).unref?.()),
]);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''));

// The SOC exposes PII, account locks and IP blocking, so it is limited to the owner account(s) listed in
// SOC_OWNER_EMAILS (comma separated, default hameed@magzest.in) — being an admin is not enough. Application Team
// accounts have role 'admin' but are deliberately blocked from admin-level functions elsewhere (see blockAppTeam
// in admin.js), and stay blocked here too.

async function adminOnly(req, res, next) {
  try {
    if (req.user.role !== 'admin' || req.user.isAppTeam) return res.status(403).json({ message: 'Admin only' });
    if (!req.user.email) {
      const u = await User.findById(req.user.id).select('email name').lean();
      if (u) { req.user.email = u.email; req.user.name = req.user.name || u.name; }
    }
    const email = String(req.user.email || '').toLowerCase();
    if (!isSocOwnerEmail(email)) {
      return res.status(403).json({ message: 'Not authorised for the SOC' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

// Substring search over encrypted fields cannot run in MongoDB, so for the lists where it matters the newest rows
// matching the structured filters are loaded (decrypted by the model hooks) and filtered here.
const SEARCH_SCAN_CAP = 5000;
// `pick` is a list of row keys, or a function returning the values of a row to search.
function matchesText(row, q, pick) {
  const term = q.trim().slice(0, 100).toLowerCase();
  const values = typeof pick === 'function' ? pick(row) : pick.map((f) => row[f]);
  return values.some((v) => String(v ?? '').toLowerCase().includes(term));
}
async function searchRows(Model, query, q, pick) {
  const rows = await Model.find(query).sort({ createdAt: -1 }).limit(SEARCH_SCAN_CAP).lean();
  const matched = rows.filter((r) => matchesText(r, q, pick));
  // Hitting the cap means older rows were never looked at: callers pass this on so the UI can say so.
  matched.truncated = rows.length >= SEARCH_SCAN_CAP;
  return matched;
}

const SECURITY_TYPE_LABEL = {
  login_success: 'Login',
  login_failure: 'Failed login',
  login_lockout: 'Lockout',
  logout: 'Logout',
  token_invalid: 'Invalid token',
  token_expired: 'Expired token',
  password_reset: 'Password reset',
  malware_upload: 'Malware upload blocked',
  waf_block: 'WAF block',
  skyload_bot_flag: 'Skyload bot flag',
  skyload_throttle: 'Skyload throttle',
  password_reset_request: 'Password reset requested',
  password_change: 'Password changed',
  two_factor_change: 'Two-factor change',
  privilege_change: 'Privilege change',
  data_export: 'Data export',
  bulk_delete: 'Bulk data deletion',
};

// Every CSV download from the SOC is itself a security event, so a burst of
// exports by one account can raise a mass_export incident.
function logExport(req, what, rows) {
  logSecurityEvent('data_export', {
    severity: 'info', userId: req.user.id, email: req.user.email || '', role: req.user.role,
    ip: req.ip, userAgent: req.headers['user-agent'] || '',
    message: `Exported ${rows} ${what} row${rows === 1 ? '' : 's'} as CSV`, meta: { export: what, rows },
  }).catch(() => {});
}

const PERIOD_MS = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };

module.exports = { adminOnly, LOCKED_BY_ADMIN_UNTIL, sendMailWithTimeout, escapeRegex, isObjectId, searchRows, SECURITY_TYPE_LABEL, logExport, PERIOD_MS, vtLink };
