// Randomly shaped student records for the tests that compare the plain-object read path (lib/leanDoc.js) with
// Mongoose's own toJSON(): built from the schema, so they follow the model. Fields are missing, nested objects empty
// or partial, arrays absent, encrypted values present, and secrets stored on some records.
//
// Not a test file (no `.test.`), so vitest does not run it.
const mongoose = require('mongoose');
const User = require('../../models/User');
const { encrypt } = require('../../lib/fieldCrypto');

// A small seeded generator, so a failure reproduces.
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

function setIn(obj, parts, value) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const ENCRYPTED = new Set(User.schema.socEncryptedPaths);
let unique = 0;

function genValue(type, r, depth, path) {
  if (type.$isMongooseDocumentArray) {
    return Array.from({ length: r.int(0, 3) }, () => genDoc(type.schema, r, depth + 1));
  }
  if (type.$isSingleNested) return genDoc(type.schema, r, depth + 1);
  if (type.$isMongooseArray) {
    const inner = type.caster && type.caster.instance;
    if (inner === 'Number') return [r.int(0, 9), r.int(0, 9)];
    if (inner === 'ObjectId') return [new mongoose.Types.ObjectId()];
    return [`a${r.int(0, 99)}`, `b${r.int(0, 99)}`];
  }
  switch (type.instance) {
    case 'String': {
      const enumValues = type.enumValues && type.enumValues.length ? type.enumValues : null;
      const v = enumValues ? r.pick(enumValues) : `text-${++unique}-${r.int(0, 999)}`; // unique: some paths have a unique index
      return ENCRYPTED.has(path) ? encrypt(v) : v;
    }
    case 'Number': return r.int(0, 1000);
    case 'Boolean': return r.chance(0.5);
    case 'Date': return new Date(Date.UTC(2024, r.int(0, 11), r.int(1, 28)));
    case 'ObjectId': return new mongoose.Types.ObjectId();
    case 'Mixed': return { k: r.int(0, 9), nested: { z: 1 } };
    default: return undefined;
  }
}

function genDoc(schema, r, depth = 0, prefix = '') {
  const obj = {};
  schema.eachPath((path, type) => {
    if (path === '_id' || path === '__v') return;
    if (r.chance(0.4)) return; // leave this path out, as an old or partial record would
    const v = genValue(type, r, depth, prefix + path);
    if (v !== undefined) setIn(obj, path.split('.'), v);
  });
  // some nested objects present but empty
  for (const k of Object.keys(obj)) {
    // (plain nested objects only: an ObjectId, a Date or an array emptied to {} is not a shape any record has, and
    // Mongoose reads {} on a reference path as an unsaved document of the referenced model)
    const isNestedObject = obj[k] && typeof obj[k] === 'object' && Object.getPrototypeOf(obj[k]) === Object.prototype;
    if (isNestedObject && r.chance(0.12)) obj[k] = {};
  }
  // (a few nested records have no _id at all; Mongoose then mints a fresh one on every load)
  if (schema.path('_id') && schema.options._id !== false && depth > 0 && !r.chance(0.1)) obj._id = new mongoose.Types.ObjectId();
  return obj;
}

/** `count` raw student records (not yet inserted). `tag` keeps their emails unique across test files. */
function randomStudents({ count, seed, tag }) {
  const r = rng(seed);
  const docs = [];
  for (let i = 0; i < count; i++) {
    const d = genDoc(User.schema, r);
    d._id = new mongoose.Types.ObjectId();
    d.role = 'student';
    d.email = `${tag}-${i}@example.com`;
    d.password = 'not-a-real-hash';
    // secrets that must never reach a client are present on some records
    if (r.chance(0.5)) d.sessions = [{ tokenHash: `h${i}`, ip: '10.0.0.1', userAgent: 'x', createdAt: new Date() }];
    if (r.chance(0.3)) { d.emailVerifyToken = `tok${i}`; d.resetPasswordToken = `rst${i}`; d.loginAttempts = 3; }
    if (r.chance(0.3)) d.counselorNotes = [{ text: `private note ${i}` }];
    docs.push(d);
  }
  return docs;
}

const plain = (v) => JSON.parse(JSON.stringify(v));

// A default of "now" (leadStageChangedAt, statusChangedAt, ...) is read at two slightly different moments.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const sameMoment = (a, b) => typeof a === 'string' && typeof b === 'string' && ISO.test(a) && ISO.test(b)
  && Math.abs(Date.parse(a) - Date.parse(b)) < 10_000;

/** The first LEAF that differs between two JSON values (key order ignored, "now" defaults tolerated), or null. */
function firstDifference(a, b, path = '') {
  if (sameMoment(a, b)) return null;
  const isObj = (v) => v !== null && typeof v === 'object';
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(a)) {
      if (a.length !== b.length) return `${path}: length ${a.length} vs ${b.length}`;
      for (let i = 0; i < a.length; i++) { const d = firstDifference(a[i], b[i], `${path}[${i}]`); if (d) return d; }
      return null;
    }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDifference(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  // A nested record with no stored _id gets a different random one on each load (and the `id` virtual follows it), so
  // for those only the presence of a well-formed id can be compared, not its value.
  if (/(\]|\.[A-Za-z]+)\.(_id|id)$/.test(path) && /^[0-9a-f]{24}$/.test(a) && /^[0-9a-f]{24}$/.test(b)) return null;
  return a === b ? null : `${path}: expected=${JSON.stringify(a)?.slice(0, 80)} got=${JSON.stringify(b)?.slice(0, 80)}`;
}

module.exports = { rng, randomStudents, plain, firstDifference };
