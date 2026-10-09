// Time-based one-time passwords (RFC 6238, built on RFC 4226): the 6-digit codes Google Authenticator, Microsoft
// Authenticator, Authy and 1Password all generate from a shared secret. Pure functions, no I/O and no dependency, so the
// whole thing can be checked against the RFC's published test vectors (see test/totp.test.js).

const crypto = require('crypto');

const STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// Tolerates the spaces and lower case an authenticator app or a person typing a key by hand might produce.
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// 160 bits, the size RFC 4226 recommends for an HMAC-SHA1 key.
const generateSecret = (bytes = 20) => base32Encode(crypto.randomBytes(bytes));

function hotp(key, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

const stepAt = (timeMs) => Math.floor(timeMs / 1000 / STEP_SECONDS);

const totp = (secret, timeMs = Date.now(), digits = DIGITS) => hotp(base32Decode(secret), stepAt(timeMs), digits);

const normalizeCode = (code) => String(code ?? '').replace(/[\s-]/g, '');

/**
 * Checks `code` against the secret for the current 30-second step and one step either side (clock drift between the
 * phone and this server). Returns the step the code belongs to, or null if it does not match.
 *
 * `afterStep` is the last step already accepted for this account: a code from that step or an earlier one is refused, so
 * a code someone shoulder-surfed or that was captured in transit cannot be replayed within its validity window.
 */
function verifyTotp(secret, code, { timeMs = Date.now(), window = 1, afterStep = -1 } = {}) {
  const given = normalizeCode(code);
  if (!new RegExp(`^\\d{${DIGITS}}$`).test(given)) return null;
  let key;
  try { key = base32Decode(secret); } catch { return null; }
  // An empty key is a valid HMAC key that anyone can compute codes for. A secret that failed to decrypt reads back as ''
  // (see fieldCrypto.decrypt), so refuse it rather than let that become a way in.
  if (key.length === 0) return null;
  const now = stepAt(timeMs);
  let matched = null;
  // Every candidate is compared (no early exit) so the response time does not reveal which step was close.
  for (let step = now - window; step <= now + window; step++) {
    const expected = hotp(key, step);
    const same = crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (same && step > afterStep && (matched === null || step > matched)) matched = step;
  }
  return matched;
}

// The otpauth:// URI an authenticator app reads from a QR code (or accepts pasted) to add the account.
function otpauthUri({ secret, account, issuer }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { STEP_SECONDS, DIGITS, base32Encode, base32Decode, generateSecret, hotp, totp, verifyTotp, otpauthUri, normalizeCode };
