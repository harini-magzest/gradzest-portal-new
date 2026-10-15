// Field-level encryption for SOC data at rest (AES-256-GCM).
//
// Values are stored as "enc:v1:<base64url(iv | tag | ciphertext)>". The key lives only in the server's
// environment (DATA_ENCRYPTION_KEY, 64 hex chars), so someone with database access but not the server
// config sees ciphertext only.
//
// Encryption is deterministic: the IV is an HMAC of the plaintext (synthetic-IV style), so the same value
// always encrypts to the same string. That keeps equality lookups, $group and unique indexes working on
// encrypted fields (find by exact email / IP) at the cost of revealing which rows hold equal values.
// The IV is only reused for identical plaintext, which is safe for GCM here. Substring search is not possible.
//
// Empty strings stay empty so `{ field: { $ne: '' } }` filters keep working.

const crypto = require('crypto');

const PREFIX = 'enc:v1:';
let keys = null;
let warnedUndecryptable = false;

// Both directions are pure functions of the value: the key is fixed for the life of the process and the IV is derived
// from the plaintext. The same few values come up again and again (an accessor's email and IP on every row a list
// writes; the same IPs and emails across a page of SOC events), and each repeat costs ~75 µs of HMAC + AES-GCM. The
// most recent results are remembered, so a repeat is a map lookup. Bounded, so it cannot grow without limit; the
// oldest entry goes first. Failures (a ciphertext that does not authenticate) are never cached.
const CACHE_MAX = 4096;
const encryptCache = new Map();
const decryptCache = new Map();
function remember(cache, key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

function getKeys() {
  if (keys) return keys;
  let raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    // Fail closed: only an explicit development/test run may fall back, so a staging box or a one-off script started
    // without NODE_ENV can never silently encrypt with a key derived from a guessable value.
    if (!['development', 'test'].includes(process.env.NODE_ENV)) throw new Error('DATA_ENCRYPTION_KEY is required (set NODE_ENV=development to use a derived dev key)');
    // Dev/test only: derive a key so the app still runs. Set DATA_ENCRYPTION_KEY for any real data.
    raw = crypto.createHash('sha256').update(`dev-only:${process.env.JWT_SECRET || 'unset'}`).digest('hex');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  const master = Buffer.from(raw, 'hex');
  keys = {
    enc: crypto.createHmac('sha256', master).update('enc').digest(),
    siv: crypto.createHmac('sha256', master).update('siv').digest(),
  };
  return keys;
}

const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);

// The AES key derived from a 64-hex master key, as getKeys() does. Exposed so the migration can read values written
// under a different (legacy) key.
const deriveEncKey = (masterHex) => crypto.createHmac('sha256', Buffer.from(masterHex, 'hex')).update('enc').digest();

// Returns the plaintext, or null if `value` is not a ciphertext that authenticates under `encKey` (default: the current key).
function decryptStrict(value, encKey) {
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64url');
    // authTagLength pins the tag to the full 16 bytes: without it GCM accepts a truncated tag (down to 4 bytes),
    // which makes forging a value that "authenticates" a matter of guessing a few bytes
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey || getKeys().enc, buf.subarray(0, 12), { authTagLength: 16 });
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function encrypt(value) {
  if (typeof value !== 'string' || value === '') return value;
  // Already-encrypted values pass through (idempotent), but only if they really are ours: a user-supplied string that
  // merely starts with the prefix (a User-Agent, an email typed into a login form) must be encrypted like any other,
  // otherwise it is stored in the clear and reads back as '' - an easy way to blank a log line.
  if (isEncrypted(value) && decryptStrict(value) !== null) return value;
  const cached = encryptCache.get(value);
  if (cached !== undefined) return cached;
  const { enc, siv } = getKeys();
  const iv = crypto.createHmac('sha256', siv).update(value, 'utf8').digest().subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-256-gcm', enc, iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return remember(encryptCache, value, PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url'));
}

function decrypt(value) {
  if (!isEncrypted(value)) return value;
  const cached = decryptCache.get(value);
  if (cached !== undefined) return cached;
  const plain = decryptStrict(value);
  if (plain !== null) return remember(decryptCache, value, plain);
  // Wrong key or tampered value: never hand ciphertext to a caller, but do not fail silently either.
  if (!warnedUndecryptable) {
    warnedUndecryptable = true;
    console.error('[fieldCrypto] a stored value could not be decrypted (wrong DATA_ENCRYPTION_KEY or tampered data); it is returned as empty');
  }
  return '';
}

const isPlainObject = (v) => v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

// Decrypts every encrypted string inside plain objects / arrays, in place. Used for lean() results and
// aggregation output, which bypass Mongoose documents. Only slots whose value actually changed are written: on a
// hydrated document, re-assigning an array element (even to the same value) marks the whole array modified, so the
// next save() would rewrite it and bump __v.
function decryptDeep(value) {
  if (typeof value === 'string') return decrypt(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const d = decryptDeep(value[i]); if (d !== value[i]) value[i] = d; }
    return value;
  }
  // A Mongoose subdocument (an element of a document array): its raw data lives in _doc.
  if (value && typeof value === 'object' && isPlainObject(value._doc)) { decryptDeep(value._doc); return value; }
  if (isPlainObject(value)) {
    for (const k of Object.keys(value)) { const d = decryptDeep(value[k]); if (d !== value[k]) value[k] = d; }
    return value;
  }
  return value;
}

module.exports = { encrypt, decrypt, decryptDeep, decryptStrict, deriveEncKey, isEncrypted, PREFIX };
