import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../../api';

// The SOC maintainers' own emails are hidden as ******** until the analyst chooses to reveal them. Emails of
// everyone else (students, counselors, other users) are shown normally. Display only: data is never altered.
type Ctx = { revealed: boolean; toggle: () => void; owners: Set<string> };
const RevealContext = createContext<Ctx>({ revealed: false, toggle: () => {}, owners: new Set() });

export function RevealProvider({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const [owners, setOwners] = useState<Set<string>>(new Set());
  useEffect(() => {
    api.soc.owners().then(r => setOwners(new Set(r.emails.map(e => e.toLowerCase())))).catch(() => {});
  }, []);
  return <RevealContext.Provider value={{ revealed, toggle: () => setRevealed(r => !r), owners }}>{children}</RevealContext.Provider>;
}

export const useReveal = () => useContext(RevealContext);

export const MASK = '********';

export function Mask({ value, fallback = '' }: { value?: string | null; fallback?: string }) {
  const { revealed, owners } = useReveal();
  if (!value) return <>{fallback}</>;
  return <>{!revealed && owners.has(value.toLowerCase()) ? MASK : value}</>;
}
