// URL handling for values that arrive from outside the app: the ?redirect= parameter on /login, and links stored on the
// server (meeting links, notification links). Anyone can craft a /login?redirect=… link, and staff-entered links are shown
// to students, so neither is trusted.

/**
 * A same-site path to send the user to after login, or `fallback` if the value is anything else.
 * Accepts "/student/chat?x=1". Rejects "https://evil.com", "//evil.com", "/\evil.com", "javascript:…", and anything with
 * control characters (those can smuggle a different target past a quick look).
 */
export function safeRedirectPath(value: string | null | undefined, fallback = ''): string {
  if (!value || typeof value !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

/** The href if `value` is an absolute http(s) URL, otherwise null. Blocks javascript:, data:, file:, vbscript: and the like. */
export function httpUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Opens an http(s) link in a new tab without giving it access to this page. Returns false (and does nothing) otherwise. */
export function openExternal(value: string | null | undefined): boolean {
  const href = httpUrl(value);
  if (!href) return false;
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}
