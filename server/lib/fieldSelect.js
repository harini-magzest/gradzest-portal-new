// Opt-in field selection for list endpoints that otherwise return whole documents.
//
//   GET /api/admin/students?fields=name,email,counselorId
//
// A picker or a lookup that only needs a name should not make the server load, decrypt and send every student's
// applications, documents and notes: hydrating a full student document is the dominant cost of the unpaged lists
// (about 1.6 s of 1.9 s for 3,000 students). Asking for fewer fields makes the query, the response and the browser's
// work proportionally smaller. Without `fields` nothing changes.
//
// This only ever narrows what a route returns. The route's own authorization and the model's toJSON() still apply, so
// a field that is never sent (the password hash, sessions, tokens, 2FA secrets, private notes) cannot be asked for.

const MAX_FIELDS = 30;
const MAX_QUERY_LENGTH = 600;

// A field name, optionally nested up to four levels: `name`, `englishScore.score`, `applications.status`.
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*){0,3}$/;

// First path segments that are never selectable, whatever is asked for.
const BLOCKED_ROOTS = new Set([
  'password', 'sessions', 'emailVerifyToken', 'emailVerifyExpires', 'resetPasswordToken', 'resetPasswordExpires',
  'loginAttempts', 'lockedUntil', 'counselorNotes', 'twoFactor', '__v',
]);

/**
 * Cleans a `fields` query value into a list of field names, or null when none was asked for (or none was usable), in
 * which case the caller keeps its normal full response. Unknown or blocked names are dropped, not reported.
 */
function parseFields(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const seen = new Set();
  for (const part of raw.slice(0, MAX_QUERY_LENGTH).split(',')) {
    const name = part.trim();
    if (!FIELD_NAME.test(name)) continue;
    if (BLOCKED_ROOTS.has(name.split('.')[0])) continue;
    seen.add(name);
    if (seen.size >= MAX_FIELDS) break;
  }
  return seen.size ? [...seen] : null;
}

/** The value for Mongoose's `.select()`: the requested fields, or `fallback` when none were asked for. */
function selectFor(raw, fallback = '-password') {
  const fields = parseFields(raw);
  return fields ? fields.join(' ') : fallback;
}

module.exports = { parseFields, selectFor, MAX_FIELDS };
