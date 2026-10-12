// Building blocks for request schemas (middleware/validate.js). Each route file declares its own schemas next to its
// handlers; these are the shared pieces.
const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');
// The custom string ids universities, courses and countries carry (e.g. "oxford-1700000000000", "c12")
const slugId = z.string().regex(/^[A-Za-z0-9_.-]{1,120}$/, 'Must be a valid id');
const email = z.string().trim().min(3).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Must be a valid email address');
// Length only: each route applies its own password rules (strength, for a new password)
const password = z.string().min(1, 'Required').max(200);
const text = (max = 200) => z.string().trim().max(max);
const requiredText = (max = 200) => text(max).min(1, 'Required');
const textList = (maxItems = 50, maxLength = 200) => z.array(text(maxLength)).max(maxItems);
// A request that must not carry a body (or only an empty one)
const noBody = z.object({}).strict();

/** Params where every named parameter is a MongoDB ObjectId. */
const ids = (...names) => z.object(Object.fromEntries(names.map((name) => [name, objectId]))).strict();

/**
 * A strict object with exactly the top-level fields a Mongoose schema defines (minus `omit`, plus `allow`). Values are
 * left to Mongoose's own casting and validators. For admin forms that edit a whole document: an unknown or protected
 * key is refused instead of being written.
 */
function modelFields(schema, { omit = [], allow = [] } = {}) {
  const keys = new Set([...Object.keys(schema.paths).map((path) => path.split('.')[0]), ...allow]);
  for (const key of omit) keys.delete(key);
  return z.object(Object.fromEntries([...keys].map((key) => [key, z.unknown().optional()]))).strict();
}

module.exports = { z, objectId, slugId, email, password, text, requiredText, textList, noBody, ids, modelFields };
