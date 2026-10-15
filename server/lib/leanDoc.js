// A plain-object stand-in for `doc.toJSON()`, computed from a `.lean()` query result.
//
// Loading a list of students as full Mongoose documents and calling toJSON() on each is most of what the big unpaged
// lists cost: for 3,000 students about 1.6 s hydrating plus 0.3 s serialising, against about 0.16 s for the database
// read itself. This rebuilds the same JSON from the plain result by doing what Mongoose does on the way in and out,
// driven by the schema so it follows the model instead of a hand-kept copy:
//
//   1. a schema default is filled in for every selected path that is missing (arrays become [], `onboarding.*`
//      flags become false, document-array elements get their own defaults, ...);
//   2. empty nested objects are dropped (the schema's `minimize`);
//   3. `id` is added where Mongoose would add it (the `virtuals: true` toJSON option). Which subdocuments get one is
//      not obvious from the schema alone, so it is read off a probe document that Mongoose itself serialises;
//   4. the schema's own toJSON `transform` runs, so secrets are removed by the one place that already removes them.
//
// What it does NOT do is cast values to the schema type, so a stored value of the wrong type is returned as stored.
// server/test/leanDoc.test.js compares it with the real toJSON() over hundreds of randomly shaped documents; if the
// model changes in a way this does not follow, that test fails.
//
// Read the data with the same query you would use for hydrated documents plus `.lean()`: the model's post-find hook
// already decrypts encrypted fields on lean results (lib/encryptedFields.js).

const mongoose = require('mongoose');

const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
// Mongoose's option objects define `default` on their prototype, so `'default' in options` is always true.
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function getIn(obj, parts) {
  let cur = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function setIn(obj, parts, value) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] === undefined || cur[p] === null) cur[p] = {};
    else if (typeof cur[p] !== 'object') return; // a scalar where the schema has an object: leave what is stored
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

// Mongoose gives every array path a default of [] unless the schema says `default: undefined`; any other path has a
// default only when the schema names one.
function hasDefault(type) {
  const opts = type.options || {};
  if (hasOwn(opts, 'default')) return opts.default !== undefined;
  return type.instance === 'Array';
}

/** The value Mongoose would fill in for a missing path: arrays get a fresh [], a function default is called, and the
 *  result is cast to the path's type (`default: Date.now` is a number that becomes a Date). */
function defaultFor(type, scope) {
  const opts = type.options || {};
  if (!hasOwn(opts, 'default')) return [];
  let v = opts.default;
  if (typeof v === 'function') v = v.call(scope);
  else if (Array.isArray(v)) v = v.slice();
  else if (isPlainObject(v)) v = { ...v };
  if (v === undefined || v === null || Array.isArray(v) || typeof type.cast !== 'function') return v;
  try { return type.cast(v); } catch { return v; }
}

/**
 * Which subdocument paths emit an `id` when the model's documents are serialised. One probe record is built with an
 * element at every document-array path (and a value at every single-nested path), hydrated by Mongoose and serialised
 * by Mongoose; the answer is read off the result. Paths the model's toJSON transform strips (sessions, counselorNotes)
 * cannot be probed and do not matter: they never reach a client.
 */
function probeIds(Model) {
  const raw = { _id: new mongoose.Types.ObjectId() };
  const walk = (schema, target) => {
    schema.eachPath((path, type) => {
      if (type.$isMongooseDocumentArray) {
        const el = { _id: new mongoose.Types.ObjectId() };
        walk(type.schema, el);
        setIn(target, path.split('.'), [el]);
      } else if (type.$isSingleNested) {
        const one = {};
        walk(type.schema, one);
        setIn(target, path.split('.'), one);
      }
    });
  };
  walk(Model.schema, raw);

  let json;
  try { json = JSON.parse(JSON.stringify(Model.hydrate(raw).toJSON())); } catch { json = {}; }

  const emits = new Map();
  const read = (schema, value, prefix) => {
    schema.eachPath((path, type) => {
      const full = prefix + path;
      const v = getIn(value, path.split('.'));
      if (type.$isMongooseDocumentArray) {
        const el = Array.isArray(v) ? v[0] : undefined;
        if (el && typeof el === 'object') {
          emits.set(full, 'id' in el);
          read(type.schema, el, full + '.');
        }
      } else if (type.$isSingleNested && v && typeof v === 'object') {
        emits.set(full, 'id' in v);
        read(type.schema, v, full + '.');
      }
    });
  };
  read(Model.schema, json, '');
  return { topLevel: 'id' in json, emits };
}

/** Everything the schema says about one level, worked out once. */
function plan(schema, excluded, prefix, ids) {
  const defaults = [];   // paths with a default value
  const subdocs = [];    // single nested subdocuments and arrays of them
  schema.eachPath((path, type) => {
    if (excluded.has(path) || type.options?.select === false) return;
    const full = prefix + path;
    if (type.$isMongooseDocumentArray) {
      subdocs.push({ parts: path.split('.'), schema: type.schema, many: true, full });
    } else if (type.$isSingleNested) {
      subdocs.push({ parts: path.split('.'), schema: type.schema, many: false, full });
    }
    // A subdocument stored without an `_id` gets a new one when Mongoose loads it (`_id: { auto: true }`).
    if (path === '_id' && type.options && type.options.auto) defaults.push({ parts: ['_id'], autoId: true });
    else if (hasDefault(type)) defaults.push({ parts: path.split('.'), type });
  });
  return { defaults, subdocs, schema, prefix, ids };
}

// One plan per model, exclusion set and nesting level, worked out once: walking 100+ schema paths for every one of
// thousands of documents would cost more than it saves.
const plans = new WeakMap();   // Model -> { ids, byKey: Map }
function modelState(Model) {
  let s = plans.get(Model);
  if (!s) { s = { ids: probeIds(Model), byKey: new Map() }; plans.set(Model, s); }
  return s;
}
function planFor(Model, schema, excluded, prefix) {
  const state = modelState(Model);
  const key = `${prefix}|${[...excluded].sort().join(',')}`;
  let p = state.byKey.get(key);
  if (!p) { p = plan(schema, excluded, prefix, state.ids); state.byKey.set(key, p); }
  return p;
}

function applyDefaults(Model, obj, p, withSubdocIds) {
  for (const { parts, type, autoId } of p.defaults) {
    if (getIn(obj, parts) === undefined) {
      const v = autoId ? new mongoose.Types.ObjectId() : defaultFor(type, obj);
      if (v !== undefined) setIn(obj, parts, v);
    }
  }
  for (const sub of p.subdocs) {
    const value = getIn(obj, sub.parts);
    if (value === undefined || value === null) continue;
    const subPlan = planFor(Model, sub.schema, new Set(), sub.full + '.');
    const emitsId = p.ids.emits.get(sub.full) === true;
    const finish = (el) => {
      applyDefaults(Model, el, subPlan, withSubdocIds);
      if (withSubdocIds && emitsId && el._id !== undefined && el.id === undefined) el.id = String(el._id);
    };
    if (sub.many) {
      if (Array.isArray(value)) for (const el of value) if (isPlainObject(el)) finish(el);
    } else if (isPlainObject(value)) {
      finish(value);
    }
  }
}

/** Drops empty plain objects, recursively (the schema's `minimize`). Arrays, dates and ids are kept as they are. */
function minimize(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (isPlainObject(value[i])) minimize(value[i]);
    return value;
  }
  if (!isPlainObject(value)) return value;
  for (const k of Object.keys(value)) {
    const v = value[k];
    if (isPlainObject(v)) {
      minimize(v);
      if (Object.keys(v).length === 0) delete value[k];
    } else if (Array.isArray(v)) {
      minimize(v);
    }
  }
  return value;
}

/**
 * @param {object} leanDoc  one result of `Model.find(...).select(...).lean()`. It is changed in place.
 * @param {import('mongoose').Model} Model
 * @param {object} [options]
 * @param {string[]} [options.exclude] top-level paths the query excluded (e.g. ['password']); they get no default
 * @param {string[]} [options.only]    top-level paths the query selected, when it was an inclusive projection; nothing
 *                                     else gets a default. `_id` is always kept.
 * @param {boolean} [options.subdocIds=true] false leaves the `id` virtual off subdocuments, which is what calling
 *                                     toJSON() on each subdocument by itself gives (a route that serialises
 *                                     `student.applications[i].toJSON()` individually).
 */
function toClientJson(leanDoc, Model, options = {}) {
  const schema = Model.schema;
  const excluded = new Set(options.exclude || []);
  const only = options.only ? new Set(options.only) : null;
  const withSubdocIds = options.subdocIds !== false;
  const p = planFor(Model, schema, excluded, '');

  if (only) {
    // An inclusive projection: only the selected paths exist on a hydrated document, so only they get defaults.
    const keep = p.defaults.filter((d) => only.has(d.parts[0]));
    const keepSub = p.subdocs.filter((s) => only.has(s.parts[0]));
    applyDefaults(Model, leanDoc, { ...p, defaults: keep, subdocs: keepSub }, withSubdocIds);
  } else {
    applyDefaults(Model, leanDoc, p, withSubdocIds);
  }

  minimize(leanDoc);
  if (p.ids.topLevel && leanDoc._id !== undefined) leanDoc.id = String(leanDoc._id);

  const transform = schema.options.toJSON && schema.options.toJSON.transform;
  return typeof transform === 'function' ? transform(null, leanDoc, schema.options.toJSON) : leanDoc;
}

module.exports = { toClientJson };
