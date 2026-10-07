// Server-side check for URLs that staff type in and that are later shown to students and opened (meeting links). Only
// absolute http(s) URLs are allowed, so a link can never be javascript:, data:, file:, vbscript: or similar.
const MAX_URL_LENGTH = 500;

/** The normalised URL string, or null when `value` is not an acceptable absolute http(s) URL. */
function normalizeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

module.exports = { normalizeHttpUrl, MAX_URL_LENGTH };
