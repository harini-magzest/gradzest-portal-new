import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { api, setApiToken, takeRefreshFailure, type SessionInfo } from '../api';
import { reasonFromCode, setLogoutReason, type LogoutReason } from '../lib/sessionLogout';
import { getDeviceHints } from '../lib/deviceInfo';

// Force a full page reload on HMR so the context reference never mismatches
if (import.meta.hot) { import.meta.hot.invalidate(); }

type LoginResult =
  | { success: true; role: string; isAppTeam?: boolean; recoveryCodesRemaining?: number }
  // The password was right but the account asks for a second step: pass `twoFactor.challengeToken` to verifyTwoFactor.
  | { success: false; twoFactor: { challengeToken: string } }
  | { success: false; twoFactor?: undefined; code?: string; message?: string };

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<LoginResult>;
  loginWithToken: (token: string) => Promise<void>;
  // `reason` is remembered so the login page can say why (see lib/sessionLogout.ts)
  logout: (reason?: LogoutReason) => void;
  // The server's limits for this sign-in (when it ends, how long idle is allowed); null when signed out
  session: SessionInfo | null;
  // Tells the server the person is still here (renews the idle clock); signs out if the session has already ended
  extendSession: () => Promise<void>;
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
  const [session, setSession] = useState<SessionInfo | null>(null);

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
          setLogoutReason(reasonFromCode(takeRefreshFailure())); // came back after the session timed out: say so on the login page
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
      const result = await api.auth.login(email, password, await getDeviceHints());
      if ('twoFactorRequired' in result) return { success: false, twoFactor: { challengeToken: result.challengeToken } };
      setApiToken(result.token);
      setSession(result.session ?? null);
      setUser(result.user);
      return { success: true, role: result.user.role, isAppTeam: result.user.isAppTeam };
    } catch (err: any) {
      const message = err?.message || '';
      const code = message.toLowerCase().includes('verify your email') ? 'EMAIL_NOT_VERIFIED' : undefined;
      return { success: false, code, message };
    }
  };

  const verifyTwoFactor = async (challengeToken: string, code: string): Promise<LoginResult> => {
    try {
      const { token, user: u, session: s, recoveryCodesRemaining } = await api.auth.verifyTwoFactor(challengeToken, code, await getDeviceHints());
      setApiToken(token);
      setSession(s ?? null);
      setUser(u);
      return { success: true, role: u.role, isAppTeam: u.isAppTeam, recoveryCodesRemaining };
    } catch (err: any) {
      // CHALLENGE_EXPIRED: the five minutes ran out, so the caller sends the person back to the password step
      return { success: false, code: err?.code, message: err?.message || 'Verification failed.' };
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

  const logout = (reason?: LogoutReason) => {
    api.auth.logout();
    setApiToken(null);
    setUser(null);
    setSession(null);
    setSessionHint(false);
    if (reason) setLogoutReason(reason);
  };

  // The server's limits arrive with every renewal of the access token
  useEffect(() => {
    const onSession = (e: Event) => setSession((e as CustomEvent<SessionInfo>).detail ?? null);
    window.addEventListener('auth:session', onSession);
    return () => window.removeEventListener('auth:session', onSession);
  }, []);

  // Listen for forced logout triggered by the API interceptor when refresh fails (the detail says if a time limit ended it)
  useEffect(() => {
    const handler = (e: Event) => {
      setLogoutReason(reasonFromCode((e as CustomEvent<{ reason?: string | null }>).detail?.reason));
      setApiToken(null); setUser(null); setSession(null); setSessionHint(false);
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  const extendSession = async () => {
    const token = await api.auth.refresh();
    if (!token) logout(reasonFromCode(takeRefreshFailure()) ?? undefined); // it had already ended: sign out cleanly
  };

  const refreshUser = async () => {
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, login, verifyTwoFactor, loginWithToken, logout, session, extendSession, refreshUser, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
