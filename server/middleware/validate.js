// Request validation with Zod, run before a route's handler:
//
//   router.post('/login', validate({ body: loginBody }), handler)
//
// Each part given (params, query, body) is checked against its schema. On failure the request stops with
//   400 { message: 'Invalid request', errors: [{ field: 'email', message: 'Must be a valid email address' }, ...] }
// naming only the fields and what is wrong with them: never the schema, the values sent or a stack trace.
// On success req.body is replaced by the parsed value (trimmed strings, and with .strict() schemas no unknown keys),
// so a handler only sees what its schema allows. Params and query are checked but left as Express parsed them.
// express-mongo-sanitize still runs before this, as a second layer.
const fs = require('fs');
const { objectId } = require('../lib/schemas');

const PARTS = ['params', 'query', 'body'];
const MAX_ERRORS = 20;

function fieldErrors(error, part) {
  return error.issues.flatMap((issue) => {
    const at = issue.path.map(String).join('.');
    // A .strict() schema reports every unexpected key in one issue; list each as its own field
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ field: [at, key].filter(Boolean).join('.'), message: 'Unknown field' }));
    }
    return [{ field: at || part, message: issue.message }];
  });
}

function reject(req, res, errors) {
  // A multipart upload has already been written to disk by multer: do not leave it behind
  if (req.file?.path) fs.unlink(req.file.path, () => {});
  return res.status(400).json({ message: 'Invalid request', errors: errors.slice(0, MAX_ERRORS) });
}

function validate(schemas) {
  for (const part of Object.keys(schemas)) {
    if (!PARTS.includes(part)) throw new Error(`validate(): unknown request part "${part}"`);
  }
  return (req, res, next) => {
    const errors = [];
    let body;
    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) errors.push(...fieldErrors(result.error, part));
      else if (part === 'body') body = result.data;
    }
    if (errors.length) return reject(req, res, errors);
    if (schemas.body) req.body = body;
    next();
  };
}

/**
 * For router.param(name, idParam): a route parameter that must be a MongoDB ObjectId. A malformed one answers 400
 * before any handler runs, instead of reaching a query (a CastError, a 500, or a lookup that can never match).
 */
function idParam(req, res, next, value, name) {
  if (objectId.safeParse(value).success) return next();
  return reject(req, res, [{ field: name, message: 'Must be a valid id' }]);
}

module.exports = { validate, idParam };
