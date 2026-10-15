import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const LEADS_CHANGED = 'leads:changed';

// Call after anything that changes the number of new leads so the sidebar badge refreshes at once
export const notifyLeadsChanged = () => window.dispatchEvent(new Event(LEADS_CHANGED));

// Number of self-signups no one has picked up yet. Admin only; refreshes on demand and every minute.
export function useNewLeadCount(): number {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    api.admin.newLeadCount().then(r => setCount(r.count)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener(LEADS_CHANGED, refresh);
    return () => { clearInterval(timer); window.removeEventListener(LEADS_CHANGED, refresh); };
  }, [isAdmin, refresh]);

  return count;
}
