const PiiAccessLog = require('../models/PiiAccessLog');
const { checkBulkPiiAccessRule } = require('./detectIncidents');

// Fixed allowlist of sensitive User fields — the log records what was
// actually sensitive about this access, not just that a profile was opened.
const SENSITIVE_FIELDS = [
  'passportNumber', 'passport', 'dateOfBirth', 'address', 'documents',
  'fundingSource', 'sponsorName', 'phone',
];

const BATCH_CHUNK = 50;

// `nested` lists the schema's nested (non-leaf) paths. On a hydrated document such a path always reads as an object, so
// `address` and `passport` have always counted as present; on a plain object built from a lean read, an empty one is
// gone. The batch logger is told which paths are nested so both give the audit the same answer.
function fieldsPresentOn(doc, nested = []) {
  return SENSITIVE_FIELDS.filter((f) => nested.includes(f) || (doc && doc[f] !== undefined && doc[f] !== null && doc[f] !== ''));
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

/**
 * The same record as logPiiAccess, for a whole list at once (a counselor opening their student list).
 *
 * Logged one at a time, listing 3,000 students was 3,000 inserts plus 3,000 runs of the bulk-access rule, all fired in
 * the same instant. This writes the entries in one insert and runs the rule once afterwards. The rule counts the
 * distinct applicants an accessor touched in its window, so it reaches the same verdict after the last entry as it
 * would have after each of them; every entry is still written and still broadcast to the admin room.
 * Fire-and-forget like logPiiAccess: it never throws and nobody has to wait for it.
 *
 * @param {object} args
 * @param {object} args.accessor   - req.user
 * @param {object[]} args.applicants - the student documents being listed
 * @param {string[]|null} [args.onlyFields] - when the list was narrowed with ?fields=, the first path segment of each
 *   field that was actually selected. A field the list never selected was not accessed, so it is not recorded: a
 *   picker that asked for name and email is not a PII access. null (the default) is a whole-record list, as before.
 * @param {string[]} [args.nestedFields] - the schema's nested paths (Object.keys(User.schema.nested)); see fieldsPresentOn
 * @returns {Promise<object[]>} the entries written (empty when none of the students had sensitive fields)
 */
async function logPiiAccessBatch({ accessor, applicants, accessType = 'list', ip = '', io = null, onlyFields = null, nestedFields = [] }) {
  try {
    const accessorId = accessor.id || accessor._id;
    const docs = [];
    for (const applicant of applicants || []) {
      let fieldsAccessed = fieldsPresentOn(applicant, nestedFields);
      if (onlyFields) fieldsAccessed = fieldsAccessed.filter((f) => onlyFields.includes(f));
      if (fieldsAccessed.length === 0) continue;
      docs.push({
        accessorId,
        accessorEmail: accessor.email || '',
        accessorRole: accessor.role || '',
        applicantId: applicant._id || applicant.id,
        applicantEmail: applicant.email || '',
        fieldsAccessed,
        accessType,
        ip,
      });
    }
    if (docs.length === 0) return [];

    // Building a Mongoose document (cast, encrypt three fields) is synchronous, so a few thousand at once would hold
    // the whole server for seconds. Written in chunks, other requests are served in the gaps between the round trips.
    const entries = [];
    for (let i = 0; i < docs.length; i += BATCH_CHUNK) {
      entries.push(...await PiiAccessLog.insertMany(docs.slice(i, i + BATCH_CHUNK), { ordered: false }));
    }
    if (io) for (const entry of entries) io.to('admin-room').emit('pii_access', entry.toObject());

    checkBulkPiiAccessRule(entries[entries.length - 1], io).catch((err) => console.error('[detectIncidents] Failed:', err.message));
    return entries;
  } catch (err) {
    console.error('[logPiiAccessBatch] Failed:', err.message);
    return [];
  }
}

module.exports = { logPiiAccess, logPiiAccessBatch, fieldsPresentOn };
