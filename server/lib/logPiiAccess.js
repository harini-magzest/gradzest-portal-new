const PiiAccessLog = require('../models/PiiAccessLog');
const { checkBulkPiiAccessRule } = require('./detectIncidents');

// Fixed allowlist of sensitive User fields — the log records what was
// actually sensitive about this access, not just that a profile was opened.
const SENSITIVE_FIELDS = [
  'passportNumber', 'passport', 'dateOfBirth', 'address', 'documents',
  'fundingSource', 'sponsorName', 'phone',
];

function fieldsPresentOn(doc) {
  return SENSITIVE_FIELDS.filter((f) => doc && doc[f] !== undefined && doc[f] !== null && doc[f] !== '');
}

/**
 * Log a PII access and run the bulk-access detection rule against it.
 * Fire-and-forget — never throws, never blocks the caller.
 *
 * @param {object} accessor  - req.user (whoever is viewing the data)
 * @param {object} applicant - the student document being viewed
 * @param {string} accessType - 'view' | 'list'
 * @param {string} ip
 * @param {object|null} io - Socket.io server instance, for the admin-room broadcast
 */
async function logPiiAccess({ accessor, applicant, accessType = 'view', ip = '', io = null }) {
  try {
    const fieldsAccessed = fieldsPresentOn(applicant);
    if (fieldsAccessed.length === 0) return null;

    const entry = await PiiAccessLog.create({
      accessorId: accessor.id || accessor._id,
      accessorEmail: accessor.email || '',
      accessorRole: accessor.role || '',
      applicantId: applicant._id || applicant.id,
      applicantEmail: applicant.email || '',
      fieldsAccessed,
      accessType,
      ip,
    });

    if (io) io.to('admin-room').emit('pii_access', entry.toObject());

    checkBulkPiiAccessRule(entry, io).catch((err) => console.error('[detectIncidents] Failed:', err.message));

    return entry;
  } catch (err) {
    console.error('[logPiiAccess] Failed:', err.message);
    return null;
  }
}

module.exports = { logPiiAccess };
