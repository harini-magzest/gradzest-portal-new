import { useState, useEffect, useCallback } from 'react';
import { Monitor, Smartphone, LogOut, Loader2 } from 'lucide-react';
import { api } from '../api';

interface Session {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

function deviceLabel(userAgent: string): string {
  if (!userAgent) return 'Unknown device';
  if (/mobile|android|iphone/i.test(userAgent)) return 'Mobile device';
  if (/curl|postman|supertest/i.test(userAgent)) return 'API client';
  const browser = /edg\//i.test(userAgent) ? 'Edge'
    : /chrome\//i.test(userAgent) ? 'Chrome'
    : /firefox\//i.test(userAgent) ? 'Firefox'
    : /safari\//i.test(userAgent) ? 'Safari'
    : 'Browser';
  const os = /windows/i.test(userAgent) ? 'Windows'
    : /mac os/i.test(userAgent) ? 'macOS'
    : /linux/i.test(userAgent) ? 'Linux'
    : '';
  return os ? `${browser} on ${os}` : browser;
}

export default function ActiveSessionsPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api.auth.sessions();
      setSessions(data.sessions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id: string) => {
    setRevokingId(id);
    try {
      await api.auth.revokeSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to revoke session.');
    }
    setRevokingId(null);
  };

  const signOutOthers = async () => {
    setSigningOutOthers(true); setError(''); setNotice('');
    try {
      const res = await api.auth.revokeOtherSessions();
      setSessions(prev => prev.filter(s => s.isCurrent));
      setNotice(res.message);
    } catch (err: any) {
      setError(err.message || 'Failed to sign out the other devices.');
    }
    setSigningOutOthers(false);
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Monitor className="w-5 h-5 text-purple-600" /> Active Sessions
      </h3>
      <p className="text-xs text-gray-400 mb-4">Devices currently signed in to your account.</p>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      {notice && <p role="status" className="text-xs text-green-700 mb-3">{notice}</p>}
      {sessions.filter(s => !s.isCurrent).length > 0 && (
        <button
          type="button"
          onClick={signOutOthers}
          disabled={signingOutOthers}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> {signingOutOthers ? 'Signing out…' : 'Sign out all other devices'}
        </button>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-400">No active sessions found.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                {/mobile|android|iphone/i.test(s.userAgent) ? (
                  <Smartphone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <Monitor className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 truncate">{deviceLabel(s.userAgent)}</p>
                    {s.isCurrent && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">
                        This device
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">
                    {s.ip || 'Unknown IP'} · last used {new Date(s.lastUsedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => revoke(s.id)}
                disabled={revokingId === s.id}
                title="Log out this device"
                className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {revokingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
