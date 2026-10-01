import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api';

// The SOC maintainers' own emails are hidden as ******** until the analyst chooses to reveal them. Emails of
// everyone else (students, counselors, other users) are shown normally. Display only: data is never altered.
type Ctx = { revealed: boolean; toggle: () => void; owners: Set<string>; ensureOwners: () => void };
const RevealContext = createContext<Ctx>({ revealed: false, toggle: () => {}, owners: new Set(), ensureOwners: () => {} });

export function RevealProvider({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const [owners, setOwners] = useState<Set<string>>(new Set());
  // Loaded on first use, not on mount: the list comes from a SOC endpoint that only answers once the owner has passed the
  // two-factor step, which happens after this provider is already on screen.
  const loading = useRef(false);
  const ensureOwners = useCallback(() => {
    if (loading.current || owners.size) return;
    loading.current = true;
    api.soc.owners()
      .then(r => setOwners(new Set(r.emails.map(e => e.toLowerCase()))))
      .catch(() => {})
      .finally(() => { loading.current = false; });
  }, [owners]);
  return <RevealContext.Provider value={{ revealed, toggle: () => setRevealed(r => !r), owners, ensureOwners }}>{children}</RevealContext.Provider>;
}

export const useReveal = () => useContext(RevealContext);

export const MASK = '********';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Hides the maintainers' emails wherever they appear in the text, so a whole sentence such as an incident title
// ("New device for admin owner@…") can be passed through it, not only a bare email.
export function Mask({ value, fallback = '' }: { value?: string | null; fallback?: string }) {
  const { revealed, owners, ensureOwners } = useReveal();
  useEffect(() => { if (value) ensureOwners(); }, [value, ensureOwners]);
  if (!value) return <>{fallback}</>;
  if (revealed || owners.size === 0) return <>{value}</>;
  const re = new RegExp([...owners].map(escapeRe).join('|'), 'gi');
  return <>{value.replace(re, MASK)}</>;
}
