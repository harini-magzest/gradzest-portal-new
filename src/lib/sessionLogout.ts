// Why a person was signed out, remembered across the redirect to the login page so it can say so. sessionStorage, so it lives
// only in this tab and disappears once it has been shown.
const KEY = 'gz_logout_reason';

export type LogoutReason = 'idle' | 'expired';

export const LOGOUT_MESSAGES: Record<LogoutReason, string> = {
  idle: 'You were signed out because you were inactive for a while. Please sign in again.',
  expired: 'Your sign-in reached its time limit. Please sign in again.',
};

/** The API's refresh error codes (server/lib/sessionPolicy.js) mapped to a reason; anything else is not a timeout. */
export function reasonFromCode(code: string | null | undefined): LogoutReason | null {
  if (code === 'SESSION_IDLE') return 'idle';
  if (code === 'SESSION_EXPIRED') return 'expired';
  return null;
}

export function setLogoutReason(reason: LogoutReason | null): void {
  try {
    if (reason) sessionStorage.setItem(KEY, reason); else sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable: the person is still signed out, just without the explanation */ }
}

/** Reads the reason once and forgets it. */
export function takeLogoutReason(): LogoutReason | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v === 'idle' || v === 'expired' ? v : null;
  } catch {
    return null;
  }
}
