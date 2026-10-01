// Time-based one-time passwords (RFC 6238 / RFC 4226) with HMAC-SHA1, 6 digits, 30-second steps — the scheme every
// authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) implements. Implemented with
// Node's crypto so there is no third-party dependency to audit; verified against the RFC's published test vectors.

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// 160-bit secret, as recommended by RFC 4226.
const generateSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secretBuf, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

const stepOf = (timeMs, step = 30) => Math.floor(timeMs / 1000 / step);
const totpAt = (secretB32, timeMs, { step = 30, digits = 6 } = {}) => hotp(base32Decode(secretB32), stepOf(timeMs, step), digits);

/**
 * Checks a submitted code. Accepts the current step and `window` steps either side (clock drift). A step at or before
 * `afterStep` is refused, so a code that was already used (e.g. shoulder-surfed or intercepted) can't be replayed.
 * @returns {number|null} the matched step, or null
 */
function verifyTotp(secretB32, code, { now = Date.now(), window = 1, step = 30, digits = 6, afterStep = 0 } = {}) {
  const submitted = String(code || '').replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(submitted)) return null;
  let secret;
  try { secret = base32Decode(secretB32); } catch { return null; }
  const current = stepOf(now, step);
  for (let w = -window; w <= window; w++) {
    const counter = current + w;
    if (counter <= afterStep) continue;
    const expected = hotp(secret, counter, digits);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(submitted))) return counter;
  }
  return null;
}

const otpauthUrl = ({ secret, account, issuer }) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

module.exports = { base32Encode, base32Decode, generateSecret, hotp, totpAt, stepOf, verifyTotp, otpauthUrl };
