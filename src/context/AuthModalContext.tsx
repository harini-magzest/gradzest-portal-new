import { createContext, useContext, useState, ReactNode } from 'react';

type Tab = 'login' | 'register';

interface AuthModalCtx {
  isOpen: boolean;
  tab: Tab;
  open: (tab?: Tab) => void;
  close: () => void;
  setTab: (tab: Tab) => void;
}

const AuthModalContext = createContext<AuthModalCtx | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('login');

  return (
    <AuthModalContext.Provider value={{
      isOpen,
      tab,
      open: (t = 'login') => { setTab(t); setIsOpen(true); },
      close: () => setIsOpen(false),
      setTab,
    }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider');
  return ctx;
}
