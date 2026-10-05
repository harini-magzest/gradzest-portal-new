import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { api, setApiToken } from '../api';
import { getDeviceHints } from '../lib/deviceInfo';

// Force a full page reload on HMR so the context reference never mismatches
if (import.meta.hot) { import.meta.hot.invalidate(); }

type LoginResult = { success: true; role: string; isAppTeam?: boolean } | { success: false; code?: string; message?: string };

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// A non-sensitive hint that this browser has signed in before. Without it we skip the
// refresh call on startup, so signed-out visitors don't make a request that can only 401.
// The session itself still lives only in the httpOnly refresh cookie.
const SESSION_HINT = 'gz_has_session';
const onDashboardUrl = () => /^\/(admin|appteam|board|counselor|student)(\/|$)/.test(window.location.pathname);
const hasSessionHint = () => {
  if (onDashboardUrl()) return true; // always try to restore on a dashboard URL
  try { return localStorage.getItem(SESSION_HINT) === '1'; } catch { return true; }
};
const setSessionHint = (on: boolean) => {
  try { if (on) localStorage.setItem(SESSION_HINT, '1'); else localStorage.removeItem(SESSION_HINT); } catch {}
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Only "loading" while a session restore is actually in flight. Public pages render
  // straight away either way; the dashboard layouts wait on this before redirecting.
  const [loading, setLoading] = useState(hasSessionHint);

  useEffect(() => {
    if (!hasSessionHint()) return;
    // Restore session from the httpOnly refresh cookie in the background
    api.auth.refresh()
      .then(async token => {
        if (token) {
          const u = await api.auth.me();
          setUser(u);
        } else {
          setSessionHint(false);
        }
      })
      .catch(() => setSessionHint(false))
      .finally(() => setLoading(false));
  }, []);

  // Keep the hint in step with the signed-in state
  useEffect(() => { if (user) setSessionHint(true); }, [user]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      // The device the person signs in from is recorded with the sign-in (browser-reported, display only).
      const { token, user: u } = await api.auth.login(email, password, await getDeviceHints());
      setApiToken(token);
      setUser(u);
      return { success: true, role: u.role, isAppTeam: u.isAppTeam };
    } catch (err: any) {
      const message = err?.message || '';
      const code = message.toLowerCase().includes('verify your email') ? 'EMAIL_NOT_VERIFIED' : undefined;
      return { success: false, code, message };
    }
  };

  const loginWithToken = async (token: string) => {
    setApiToken(token);
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {
      setApiToken(null);
    }
  };

  const logout = () => {
    api.auth.logout();
    setApiToken(null);
    setUser(null);
    setSessionHint(false);
  };

  // Listen for forced logout triggered by the API interceptor when refresh fails
  useEffect(() => {
    const handler = () => { setApiToken(null); setUser(null); setSessionHint(false); };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  const refreshUser = async () => {
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithToken, logout, refreshUser, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
