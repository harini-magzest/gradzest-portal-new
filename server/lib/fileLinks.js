// Short-lived signed links to uploaded files.
//
// Files used to be fetched with the person's access token in the URL (/uploads/x.pdf?token=<JWT>). URLs end up in
// browser history, proxy and server logs and Referer headers, so that leaked a token good for the whole API. Now the
// browser asks POST /api/files/:name/link right before showing a file and gets a link that works for one file, one
// person and five minutes:
//   /uploads/<name>?uid=<user id>&exp=<expiry, ms since epoch>&sig=<HMAC-SHA256 of name, uid and exp>
// keyed by FILE_URL_SECRET (its own secret: knowing it must not let anyone mint API tokens, and the other way round).
// Opening the link still re-checks the account and the per-file rule (lib/fileAccess.js), so a link stops working as
// soon as the person loses access, even inside its five minutes.
const crypto = require('crypto');

const LINK_TTL_MS = 5 * 60 * 1000;
// Stored names are <timestamp>-<random><.ext> (middleware/upload.js); nothing else can be signed
const STORED_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
const USER_ID = /^[0-9a-f]{24}$/;

let devSecret = null;
function secret() {
  if (process.env.FILE_URL_SECRET) return process.env.FILE_URL_SECRET;
  // Fail closed: only an explicit development/test run may fall back (app.js refuses to start in production without it)
  if (!['development', 'test'].includes(process.env.NODE_ENV)) throw new Error('FILE_URL_SECRET is not set');
  devSecret ||= crypto.createHmac('sha256', `dev-only:${process.env.JWT_SECRET || 'unset'}`).update('file-links').digest('hex');
  return devSecret;
}

const signature = (name, uid, exp) =>
  crypto.createHmac('sha256', secret()).update(`file-link:v1\n${name}\n${uid}\n${exp}`).digest('base64url');

const isStoredName = (name) => typeof name === 'string' && STORED_NAME.test(name);

/** A link to one stored file for one user, valid for LINK_TTL_MS from `now`. */
function signedUploadPath(name, userId, now = Date.now()) {
  const uid = String(userId);
  const exp = now + LINK_TTL_MS;
  return {
    url: `/uploads/${encodeURIComponent(name)}?uid=${uid}&exp=${exp}&sig=${signature(name, uid, exp)}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

/**
 * Checks a signed link for the file `name`.
 * @returns {{ userId: string, issuedAt: number } | { error: 'invalid' | 'expired' }}
 */
function checkSignedUpload(name, query, now = Date.now()) {
  const { uid, exp, sig } = query || {};
  if (!isStoredName(name) || typeof uid !== 'string' || typeof exp !== 'string' || typeof sig !== 'string') return { error: 'invalid' };
  if (!USER_ID.test(uid) || !/^\d{1,15}$/.test(exp)) return { error: 'invalid' };
  const expected = Buffer.from(signature(name, uid, exp));
  const given = Buffer.from(sig);
  // The signature is checked before the expiry, so a link with an edited expiry is "invalid", not "expired"
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { error: 'invalid' };
  if (Number(exp) < now) return { error: 'expired' };
  return { userId: uid, issuedAt: Number(exp) - LINK_TTL_MS };
}

/** Whether /uploads still accepts an access token in ?token=. ALLOW_LEGACY_UPLOAD_TOKENS=true|false; unset means
 *  off in production and on elsewhere. Turn it on in production only while browsers still run the previous frontend. */
function legacyUploadTokensAllowed() {
  const flag = String(process.env.ALLOW_LEGACY_UPLOAD_TOKENS || '').toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

module.exports = { signedUploadPath, checkSignedUpload, isStoredName, legacyUploadTokensAllowed, LINK_TTL_MS };
