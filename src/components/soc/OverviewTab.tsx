import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { KeyRound, Lock, ShieldAlert, Globe2, RefreshCw } from 'lucide-react';
import { api } from '../../api';
import { useOnResync } from './SocketContext';
import { SkeletonStat } from '../Skeleton';
import {
  deltaLabel, ResponseMetrics, BacklogCard, RuleEffectivenessCard, TopIpsCard, TargetedAccountsCard, GeoCard, type Period,
} from './OverviewInsights';
import LiveSecurityFeed from './LiveSecurityFeed';
import { Card, ErrorBanner, Section, errorText, formatBucket } from './ui';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#8B1A1A', high: '#dc2626', medium: '#ea580c', low: '#0891b2', info: '#6b7280',
};

function StatCard({ icon: Icon, label, value, sub, color, delta }: { icon: any; label: string; value: string | number; sub?: string; color: string; delta?: { text: string; up: boolean | null } }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        {delta?.text && <p className={`text-[11px] font-medium mt-0.5 ${delta.up === null ? 'text-gray-500' : delta.up ? 'text-red-600' : 'text-green-600'}`}>{delta.text}</p>}
      </div>
    </div>
  );
}

const NoEvents = () => <div className="flex items-center justify-center h-40 text-gray-500 text-sm">No events in this period</div>;

function EventsOverTimeCard({ stats, period }: { stats: any; period: Period }) {
  const total: number = (stats.series || []).reduce((a: number, s: any) => a + s.count, 0);
  const peak: { bucket: string; count: number } | null = (stats.series || []).reduce((m: any, s: any) => (!m || s.count > m.count ? s : m), null);
  return (
    <Card title="Security events over time" hint={period === '24h' ? 'Per hour' : 'Per day'}>
      {!total ? <NoEvents /> : (
        <>
          {/* The drawing carries no text a screen reader can use, so it is hidden and the same facts are given in words. */}
          <p className="sr-only">
            {total} events in the last {period}{peak ? `, most in one interval: ${peak.count} (${formatBucket(String(peak.bucket))})` : ''}.
          </p>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={formatBucket} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip labelFormatter={(l: any) => formatBucket(String(l))} />
                <Area type="monotone" dataKey="count" name="Events" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

function SeverityCard({ stats }: { stats: any }) {
  const data = Object.entries(stats.severityBreakdown || {}).map(([severity, count]) => ({ severity, count: Number(count) || 0 }));
  const total = Math.max(1, data.reduce((sum, d) => sum + d.count, 0));
  return (
    <Card title="Events by severity">
      {!data.length ? <NoEvents /> : (
        <>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                {/* A lone slice is a full circle: its white edge stroke drew a stray radius line across it. Labels are in
                    the list below, not around the pie, where narrow screens cut them off. */}
                <Pie data={data} dataKey="count" nameKey="severity" cx="50%" cy="50%" outerRadius={80} rootTabIndex={-1}
                  stroke={data.length > 1 ? '#fff' : 'none'}>
                  {data.map((d, i) => <Cell key={i} fill={SEVERITY_COLORS[d.severity] || '#6b7280'} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul aria-label="Events by severity" className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
            {data.map(d => (
              <li key={d.severity} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SEVERITY_COLORS[d.severity] || '#6b7280' }} aria-hidden="true" />
                <span className="capitalize">{d.severity}</span>
                <span className="font-semibold text-gray-800">{d.count}</span>
                <span className="text-gray-500">({Math.round((d.count / total) * 100)}%)</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// Below this, a stats refresh triggered by a live event is throttled rather than firing
// on every single one — an active incident can produce many events a second, and the
// KPI cards don't need to track that closely to stop looking stale.
const STATS_LIVE_REFRESH_MS = 8000;

const PERIODS: { key: Period; label: string }[] = [{ key: '24h', label: '24 Hours' }, { key: '7d', label: '7 Days' }, { key: '30d', label: '30 Days' }];

export default function OverviewTab() {
  const [period, setPeriod] = useState<Period>('24h');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const periodRef = useRef(period);
  useEffect(() => { periodRef.current = period; }, [period]);
  const lastStatsRefresh = useRef(0);

  // silent = background refresh: no spinner, and a failed refresh keeps the numbers already on screen.
  const loadStats = useCallback(async (p: Period, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) { setLoading(true); setError(''); }
    try {
      const data = await api.soc.stats(p);
      if (periodRef.current !== p) return; // the person has moved on to another period
      setStats(data); setUpdatedAt(new Date()); setError('');
    } catch (err) {
      if (periodRef.current !== p) return;
      // A failed foreground load must not leave the previous period's numbers sitting under the new period's tab.
      if (!opts.silent) { setStats(null); setError(errorText(err)); }
    }
    if (!opts.silent && periodRef.current === p) setLoading(false);
  }, []);

  useEffect(() => { loadStats(period); }, [loadStats, period]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) loadStats(period, { silent: true }); }, 60000);
    return () => clearInterval(t);
  }, [loadStats, period]);

  // Events pushed while the socket was down never arrived; the numbers need fetching again (the feed refetches itself).
  useOnResync(() => { void loadStats(periodRef.current, { silent: true }); });

  // The numbers are a separate fetch from the feed — without this they'd only refresh on a manual click or a period
  // change, going stale during the exact spike an analyst is watching scroll by in the feed.
  const onLiveEvent = useCallback(() => {
    const now = Date.now();
    if (now - lastStatsRefresh.current > STATS_LIVE_REFRESH_MS) {
      lastStatsRefresh.current = now;
      loadStats(periodRef.current, { silent: true });
    }
  }, [loadStats]);

  const vsPrevious = `Last ${period}, compared with the ${period} before`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {PERIODS.map(p => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)} aria-pressed={period === p.key}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${period === p.key ? 'bg-white text-purple-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {updatedAt && <span className="text-[11px] text-gray-400 self-center whitespace-nowrap" title="Refreshes automatically every minute">Updated {updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button type="button" onClick={() => loadStats(period)} disabled={loading} aria-label="Refresh"
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => loadStats(period)} />}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)}
        </div>
      ) : stats && (
        <>
          <Section title="Threat activity" hint={vsPrevious}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={KeyRound} label="Failed Logins" value={stats.failedLogins} sub={`in last ${period}`} delta={deltaLabel(stats.failedLogins, stats.previous?.failedLogins, period)} color="bg-linear-to-br from-orange-500 to-amber-500" />
              <StatCard icon={Lock} label="Active Lockouts" value={stats.activeLockouts} sub="locked right now" color="bg-linear-to-br from-red-500 to-rose-600" />
              <StatCard icon={ShieldAlert} label="Blocked / Unauthorized" value={stats.blockedRequests + stats.unauthorizedRequests} sub={`${stats.blockedRequests} rate-limited, ${stats.unauthorizedRequests} 401/403`} delta={deltaLabel(stats.blockedRequests + stats.unauthorizedRequests, stats.previous ? stats.previous.blockedRequests + stats.previous.unauthorizedRequests : undefined, period)} color="bg-linear-to-br from-purple-600 to-indigo-600" />
              <StatCard icon={Globe2} label="Unique IPs" value={stats.uniqueIps} sub={`in last ${period}`} color="bg-linear-to-br from-blue-500 to-indigo-600" />
            </div>
          </Section>

          <Section title="Trends">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <EventsOverTimeCard stats={stats} period={period} />
              <SeverityCard stats={stats} />
            </div>
          </Section>

          <Section title="Where threats come from" hint={`Last ${period}`}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TopIpsCard stats={stats} />
              <TargetedAccountsCard stats={stats} />
              <GeoCard period={period} />
            </div>
          </Section>

          <Section title="Incident response" hint="How fast incidents are picked up and closed">
            <ResponseMetrics stats={stats} period={period} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BacklogCard stats={stats} />
              <RuleEffectivenessCard stats={stats} />
            </div>
          </Section>
        </>
      )}

      <LiveSecurityFeed onEvent={onLiveEvent} />
    </div>
  );
}
