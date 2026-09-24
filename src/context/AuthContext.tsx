import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { api, setApiToken } from '../api';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from httpOnly refresh cookie — no localStorage needed
    api.auth.refresh()
      .then(async token => {
        if (token) {
          const u = await api.auth.me();
          setUser(u);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const { token, user: u } = await api.auth.login(email, password);
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
  };

  // Listen for forced logout triggered by the API interceptor when refresh fails
  useEffect(() => {
    const handler = () => { setApiToken(null); setUser(null); };
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
      {loading ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">Loading...</p>
          </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
