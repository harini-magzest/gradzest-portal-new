import { createContext, useContext, useState, type ReactNode } from 'react';

// Personal details (emails) in the SOC are hidden as ******** until the analyst chooses to reveal them.
// Display only: data is never altered, so actions and filters keep working on the real values.
const RevealContext = createContext<{ revealed: boolean; toggle: () => void }>({ revealed: false, toggle: () => {} });

export function RevealProvider({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return <RevealContext.Provider value={{ revealed, toggle: () => setRevealed(r => !r) }}>{children}</RevealContext.Provider>;
}

export const useReveal = () => useContext(RevealContext);

export const MASK = '********';

export function Mask({ value, fallback = '' }: { value?: string | null; fallback?: string }) {
  const { revealed } = useReveal();
  if (!value) return <>{fallback}</>;
  return <>{revealed ? value : MASK}</>;
}
