import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const KEY = 'gz_ref';
// Same shape the server accepts (see recordReferral in server/lib/referrals.js)
const VALID = /^[A-Za-z0-9]{6,12}$/;

/** The referral code the visitor arrived with, if any. */
export function getReferral(): string | undefined {
  try {
    const v = sessionStorage.getItem(KEY);
    return v && VALID.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function clearReferral() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

/** Remembers `?ref=CODE` from a shared link until the visitor signs up, even if they browse around first. */
export function ReferralCapture() {
  const { search } = useLocation();
  useEffect(() => {
    const ref = new URLSearchParams(search).get('ref');
    if (ref && VALID.test(ref)) {
      try { sessionStorage.setItem(KEY, ref); } catch { /* the code just isn't remembered */ }
    }
  }, [search]);
  return null;
}
