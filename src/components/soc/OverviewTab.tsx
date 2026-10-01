import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  KeyRound, Lock, ShieldAlert, Globe2, RefreshCw, AlertCircle, Pause, Play, Trash2, Wifi, WifiOff,
  LogIn, LogOut, Download, Search,
} from 'lucide-react';
import { api, API_ORIGIN, getApiToken } from '../../api';
import { SkeletonStat } from '../Skeleton';
import OverviewInsights, { deltaLabel } from './OverviewInsights';
import SavedFilters from './SavedFilters';
import DeviceDetails from './DeviceDetails';
import { Mask } from './Mask';

type Period = '24h' | '7d' | '30d';

interface SecurityEvent {
  _id: string;
  type: string;
  severity: string;
  email?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
  message: string;
  createdAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#8B1A1A', high: '#dc2626', medium: '#ea580c', low: '#0891b2', info: '#6b7280',
};
const SEVERITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: '#FCE8E8', text: '#8B1A1A', label: 'Critical' },
  high:     { bg: '#FCEBEB', text: '#791F1F', label: 'High' },
  medium:   { bg: '#FAEEDA', text: '#633806', label: 'Medium' },
  low:      { bg: '#E6F1FB', text: '#0C447C', label: 'Low' },
  info:     { bg: '#F0F0F2', text: '#4B5563', label: 'Info' },
};
const TYPE_ICON: Record<string, any> = {
  login_success: LogIn, login_failure: KeyRound, login_lockout: Lock,
  logout: LogOut, token_invalid: ShieldAlert, token_expired: ShieldAlert, password_reset: KeyRound,
  password_reset_request: KeyRound, privilege_change: ShieldAlert,
};
const TYPE_LABEL: Record<string, string> = {
  login_success: 'Login', login_failure: 'Failed login', login_lockout: 'Lockout',
  logout: 'Logout', token_invalid: 'Invalid token', token_expired: 'Expired token', password_reset: 'Password reset',
  password_reset_request: 'Reset requested', privilege_change: 'Privilege change', data_export: 'Data export', malware_upload: 'Malware upload', waf_block: 'WAF block',
  skyload_bot_flag: 'Bot flag', skyload_throttle: 'Throttled',
};

function StatCard({ icon: Icon, label, value, sub, color, delta }: { icon: any; label: string; value: string | number; sub?: string; color: string; delta?: { text: string; up: boolean | null } }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        {delta?.text && <p className={`text-[11px] font-medium mt-0.5 ${delta.up === null ? 'text-gray-400' : delta.up ? 'text-red-600' : 'text-green-600'}`}>{delta.text}</p>}
      </div>
    </div>
  );
}

export default function OverviewTab() {
  const [period, setPeriod] = useState<Period>('24h');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Live feed state — mirrors the pattern previously used for useActivityFeed.
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [feedLoading, setFeedLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedFilters, setFeedFilters] = useState({ q: '', type: 'all', severity: 'all' });
  const filtersRef = useRef(feedFilters);
  useEffect(() => { filtersRef.current = feedFilters; }, [feedFilters]);
  const pauseRef = useRef(isPaused);
  const pendingRef = useRef<SecurityEvent[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => { pauseRef.current = isPaused; }, [isPaused]);

  const loadStats = useCallback(async (p: Period) => {
    setLoading(true); setError('');
    try { setStats(await api.soc.stats(p)); }
    catch (err: any) { setError(err.message || 'Failed to load stats.'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadStats(period); }, [loadStats, period]);

  useEffect(() => {
    setFeedLoading(true);
    // Debounced so typing in the search box doesn't fire a request per keystroke.
    const timer = setTimeout(() => {
      api.soc.events({ limit: 50, q: feedFilters.q.trim() || undefined, type: feedFilters.type, severity: feedFilters.severity })
        .then(data => setEvents(data.events || []))
        .catch(() => {})
        .finally(() => setFeedLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [feedFilters]);

  // Live events must respect the active filters too, or a filtered view would fill up with non-matches.
  const matchesFilters = (e: SecurityEvent) => {
    const f = filtersRef.current;
    if (f.type !== 'all' && e.type !== f.type) return false;
    if (f.severity !== 'all' && e.severity !== f.severity) return false;
    const q = f.q.trim().toLowerCase();
    return !q || [e.email, e.ip, e.message].some(v => (v || '').toLowerCase().includes(q));
  };

  useEffect(() => {
    const socket: Socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
      reconnectionAttempts: 10, reconnectionDelay: 2000, reconnectionDelayMax: 10000,
    });
    socket.on('connect', () => setIsLive(true));
    socket.on('disconnect', () => setIsLive(false));
    socket.on('connect_error', () => setIsLive(false));
    socket.on('security_event', (event: SecurityEvent) => {
      if (!matchesFilters(event)) return;
      if (pauseRef.current) {
        pendingRef.current = [event, ...pendingRef.current];
        setPendingCount(pendingRef.current.length);
      } else {
        setEvents(prev => [event, ...prev].slice(0, 200));
      }
    });
    return () => { socket.disconnect(); };
  }, []);

  const togglePause = () => {
    setIsPaused(was => {
      if (was && pendingRef.current.length > 0) {
        const pending = pendingRef.current;
        pendingRef.current = [];
        setPendingCount(0);
        setEvents(prev => [...pending, ...prev].slice(0, 200));
      }
      return !was;
    });
  };
  const exportFeedCsv = () => {
    const params = new URLSearchParams({ type: feedFilters.type, severity: feedFilters.severity });
    if (feedFilters.q.trim()) params.set('q', feedFilters.q.trim());
    api.soc.download(`/events/export.csv?${params}`, 'soc-events.csv').catch(() => {});
  };
  const clearFeed = () => { setEvents([]); pendingRef.current = []; setPendingCount(0); };

  const PERIODS: { key: Period; label: string }[] = [{ key: '24h', label: '24 Hours' }, { key: '7d', label: '7 Days' }, { key: '30d', label: '30 Days' }];
  const severityData = stats ? Object.entries(stats.severityBreakdown || {}).map(([severity, count]) => ({ severity, count })) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {PERIODS.map(p => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${period === p.key ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => loadStats(period)} disabled={loading}
          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)}
        </div>
      ) : stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={KeyRound} label="Failed Logins" value={stats.failedLogins} sub={`in last ${period}`} delta={deltaLabel(stats.failedLogins, stats.previous?.failedLogins, period)} color="bg-gradient-to-br from-orange-500 to-amber-500" />
            <StatCard icon={Lock} label="Active Lockouts" value={stats.activeLockouts} sub="locked right now" color="bg-gradient-to-br from-red-500 to-rose-600" />
            <StatCard icon={ShieldAlert} label="Blocked / Unauthorized" value={stats.blockedRequests + stats.unauthorizedRequests} sub={`${stats.blockedRequests} rate-limited, ${stats.unauthorizedRequests} 401/403`} delta={deltaLabel(stats.blockedRequests + stats.unauthorizedRequests, stats.previous ? stats.previous.blockedRequests + stats.previous.unauthorizedRequests : undefined, period)} color="bg-gradient-to-br from-purple-600 to-indigo-600" />
            <StatCard icon={Globe2} label="Unique IPs" value={stats.uniqueIps} sub={`in last ${period}`} color="bg-gradient-to-br from-blue-500 to-indigo-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Security Events Over Time</h2>
              {!stats.series?.length ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No events yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stats.series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" name="Events" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Events by Severity</h2>
              {!severityData.length ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No events yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={severityData} dataKey="count" nameKey="severity" cx="50%" cy="50%" outerRadius={80}
                      label={({ severity, percent }: any) => `${severity} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {severityData.map((d: any, i: number) => <Cell key={i} fill={SEVERITY_COLORS[d.severity] || '#6b7280'} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Top Offending IPs</h2>
            {!stats.topIps?.length ? (
              <div className="flex items-center justify-center h-24 text-gray-400 text-sm">No blocked/unauthorized requests in this period</div>
            ) : (
              <div className="space-y-2">
                {stats.topIps.map((row: any) => (
                  <div key={row.ip} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-sm font-mono text-gray-700">{row.ip}</span>
                    <span className="text-xs font-semibold text-gray-500">{row.count} blocked/unauthorized</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <OverviewInsights stats={stats} period={period} />
        </>
      )}

      {/* Live feed */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              {isLive ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </>
              ) : <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-300" />}
            </span>
            <h2 className="text-sm font-bold text-gray-900">Live Security Feed</h2>
            {isLive ? <span className="text-[10px] text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded-full">Connected</span>
              : <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded-full">Offline</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {isPaused && pendingCount > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">+{pendingCount} waiting</span>}
            <button onClick={togglePause} title={isPaused ? 'Resume feed' : 'Pause feed'} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button onClick={clearFeed} title="Clear feed" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {isLive ? <Wifi className="w-3.5 h-3.5 text-green-500" /> : <WifiOff className="w-3.5 h-3.5 text-gray-300" />}
          </div>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input value={feedFilters.q} onChange={e => setFeedFilters(f => ({ ...f, q: e.target.value }))} placeholder="Search email, IP or message…"
                className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <select value={feedFilters.type} onChange={e => setFeedFilters(f => ({ ...f, type: e.target.value }))}
              className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="all">All types</option>
              {Object.entries(TYPE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <select value={feedFilters.severity} onChange={e => setFeedFilters(f => ({ ...f, severity: e.target.value }))}
              className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="all">All severities</option>
              {Object.entries(SEVERITY_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button type="button" onClick={exportFeedCsv}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1.5">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
          <SavedFilters storageKey="soc.feedFilters" current={feedFilters} onApply={setFeedFilters} />
        </div>
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: '420px', minHeight: '160px' }}>
          {feedLoading ? (
            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <ShieldAlert className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm font-semibold text-gray-500">No security events yet</p>
            </div>
          ) : events.map(e => {
            const badge = SEVERITY_STYLE[e.severity] ?? SEVERITY_STYLE.info;
            const Icon = TYPE_ICON[e.type] ?? ShieldAlert;
            const time = new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            return (
              <div key={e._id} className="px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
              <div role="button" tabIndex={0} aria-expanded={expandedId === e._id} title="Click for full device details"
                onClick={() => setExpandedId(id => id === e._id ? null : e._id)}
                onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setExpandedId(id => id === e._id ? null : e._id); } }}
                className="flex items-start gap-3 cursor-pointer">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: badge.text }}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-gray-900 truncate"><Mask value={e.email} fallback="Unknown" /></span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 flex-shrink-0" title="Source IP address">{e.ip || 'no IP'}{e.ip && /^(::1$|(::ffff:)?127\.)/.test(e.ip) ? ' (local)' : ''}</span>
                  </div>
                  <p className="text-xs text-gray-700 leading-snug">{TYPE_LABEL[e.type] || e.type}{e.message ? ` — ${e.message}` : ''}</p>
                  {e.userAgent && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{e.userAgent}</p>}
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums pt-0.5">{time}</span>
              </div>
              {expandedId === e._id && <DeviceDetails event={e} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
