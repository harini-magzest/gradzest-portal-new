// Opt-in paging for the big lists (admin students, applications, subscribers, meetings). Without ?page or ?limit an
// endpoint answers exactly as before, with the whole list, because many pages still read it that way; with either, it
// answers one page: { items, total, page, limit, ... }. Searching and filtering then happen in the database, so a page
// costs the same with 50 records or 50,000.
const { z, text } = require('./schemas');

const MAX_LIMIT = 200;

// Query fields every paged list accepts
const pageQuery = {
  page: z.string().regex(/^\d{1,6}$/, 'Must be a page number').optional(),
  limit: z.string().regex(/^\d{1,3}$/, 'Must be a number').optional(),
  q: text(100).optional(),
};
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date (YYYY-MM-DD)');

/** The requested page, or null when the caller asked for the whole list. */
function readPaging(query = {}, defaultLimit = 25) {
  if (query.page === undefined && query.limit === undefined) return null;
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A case-insensitive "contains" match for a search box, or null when the box is empty. */
function containsText(q) {
  const s = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  return s ? new RegExp(escapeRegex(s), 'i') : null;
}

/**
 * Matches `value` the way the page did on loaded documents: Mongoose fills in a schema default when a stored record
 * lacks the field, so asking for the default value must also find records where it is missing.
 */
function matchWithDefault(path, value, defaultValue) {
  return value === defaultValue ? { $or: [{ [path]: value }, { [path]: { $exists: false } }] } : { [path]: value };
}

/**
 * The first of `paths` that holds a value, as a date: how the pages sorted ("updatedDate || updatedAt || …"), so the
 * database can sort the same way. Missing, null and '' are skipped; a value that is not a date sorts last.
 */
function firstDate(paths) {
  const first = paths.reduceRight((otherwise, p) => ({ $cond: [{ $ne: [{ $ifNull: [p, ''] }, ''] }, p, otherwise] }), null);
  return { $convert: { input: first, to: 'date', onError: null, onNull: null } };
}

/** Puts documents back in the order of `ids` (a $in query returns them in any order). */
function inOrder(ids, docs) {
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

module.exports = { MAX_LIMIT, pageQuery, isoDay, readPaging, containsText, matchWithDefault, firstDate, inOrder };
