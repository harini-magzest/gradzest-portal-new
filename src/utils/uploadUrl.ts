import { getApiToken } from '../api';

/**
 * Appends the JWT token as a query param for /uploads/ paths so the
 * protected static route can authenticate the request.
 * External URLs and non-upload paths are returned unchanged.
 */
export function uploadUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (!url.startsWith('/uploads/')) return url;
  const token = getApiToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
