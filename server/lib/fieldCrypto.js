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

function getKeys() {
  if (keys) return keys;
  let raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEY is required in production');
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

function encrypt(value) {
  if (typeof value !== 'string' || value === '' || isEncrypted(value)) return value;
  const { enc, siv } = getKeys();
  const iv = crypto.createHmac('sha256', siv).update(value, 'utf8').digest().subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-256-gcm', enc, iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

function decrypt(value) {
  if (!isEncrypted(value)) return value;
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKeys().enc, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return ''; // wrong key or tampered value: never hand ciphertext to a caller
  }
}

const isPlainObject = (v) => v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

// Decrypts every encrypted string inside plain objects / arrays, in place. Used for lean() results and
// aggregation output, which bypass Mongoose documents.
function decryptDeep(value) {
  if (typeof value === 'string') return decrypt(value);
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = decryptDeep(value[i]); return value; }
  if (isPlainObject(value)) { for (const k of Object.keys(value)) value[k] = decryptDeep(value[k]); return value; }
  return value;
}

module.exports = { encrypt, decrypt, decryptDeep, isEncrypted, PREFIX };
