import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { BarChart2, TrendingUp, Users, Award, DollarSign, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../../api';
import { SkeletonStat } from '../../components/Skeleton';
import { usePortalName } from '../../hooks/usePortalName';

type Period = '7d' | '30d' | '90d' | '1yr';

function Spinner({ white = false }: { white?: boolean }) {
  return <span className={`w-4 h-4 border-2 rounded-full animate-spin inline-block flex-shrink-0 ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-gray-600'}`} />;
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function WorkloadBadge({ workload }: { workload: string }) {
  const cls = workload === 'High'
    ? 'bg-red-100 text-red-700 border-red-200'
    : workload === 'Medium'
    ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
    : 'bg-green-100 text-green-700 border-green-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>{workload}</span>;
}

// Custom tooltip for recharts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-gray-800">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.fill }} className="font-medium">{p.value}</p>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const { portal } = usePortalName();
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (p: Period) => {
    setLoading(true); setError('');
    try { setData(await api.admin.analytics(p)); }
    catch (err: any) { setError(err.message || 'Failed to load analytics.'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  const PERIODS: { key: Period; label: string }[] = [
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
    { key: '1yr', label: '1 Year' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-700 to-purple-800 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <BarChart2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
              <h1 className="text-2xl font-bold leading-tight">Analytics</h1>
            </div>
          </div>
          <button type="button" onClick={() => load(period)} disabled={loading}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Period tabs */}
        <div className="flex gap-1 p-1 bg-white/10 rounded-xl w-fit">
          {PERIODS.map(p => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === p.key ? 'bg-white text-purple-700 shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button type="button" onClick={() => load(period)}
            className="text-xs text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg font-semibold">Retry</button>
        </div>
      )}

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-4" />
                <div className="h-48 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="New Students" value={data.newStudents}
              sub={`in last ${period}`} color="bg-gradient-to-br from-blue-500 to-indigo-600" />
            <StatCard icon={Award} label="Visa Approval %" value={`${data.visaApprovalRate}%`}
              sub="of all applications" color="bg-gradient-to-br from-green-500 to-emerald-600" />
            <StatCard icon={TrendingUp} label="Conversion Rate" value={`${data.conversionRate}%`}
              sub="registered → applied" color="bg-gradient-to-br from-orange-500 to-amber-500" />
            <StatCard icon={DollarSign} label="Est. Revenue" value={`$${(data.revenue / 1000).toFixed(0)}K`}
              sub="projected" color="bg-gradient-to-br from-purple-600 to-indigo-600" />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly registrations bar chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Monthly Registrations</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.monthlyRegistrations} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Students" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Applications by country horizontal bar */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Applications by Country</h2>
              {data.applicationsByCountry.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.applicationsByCountry} layout="vertical"
                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="country" width={80} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Applications" fill="#0d1b4b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top universities + application status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top universities */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Top Universities Applied To</h2>
              {!data.topUniversities?.length ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No applications yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.topUniversities} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Applications" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Application status breakdown */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Applications by Status</h2>
              {!data.applicationsByStatus?.length ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No applications yet</div>
              ) : (
                (() => {
                  const COLORS = ['#0d1b4b','#7c3aed','#059669','#dc2626','#ea580c','#0891b2','#6b7280'];
                  return (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={data.applicationsByStatus} dataKey="count" nameKey="status"
                          cx="50%" cy="50%" outerRadius={80} label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}>
                          {data.applicationsByStatus.map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any, n: any) => [v, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  );
                })()
              )}
            </div>
          </div>

          {/* Conversion funnel + counselor performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conversion funnel */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Conversion Funnel</h2>
              <div className="space-y-3">
                {data.conversionFunnel.map((stage: any, i: number) => {
                  const colors = ['bg-blue-600','bg-indigo-500','bg-purple-500','bg-violet-500','bg-purple-700'];
                  return (
                    <div key={stage.stage}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-medium text-gray-700">{stage.stage}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{stage.count}</span>
                          <span className="text-xs text-gray-400">{stage.pct}%</span>
                        </div>
                      </div>
                      <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${colors[i] || 'bg-purple-500'} rounded-full transition-all duration-500 flex items-center pl-3`}
                          style={{ width: `${Math.max(stage.pct, 2)}%` }}>
                          {stage.pct > 15 && <span className="text-xs text-white font-semibold">{stage.pct}%</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Counselor performance */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Counselor Performance</h2>
              {data.counselorPerformance.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">No counselors found</div>
              ) : (
                <div className="space-y-3">
                  {data.counselorPerformance.map((c: any, i: number) => (
                    <div key={c.name} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {c.name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                          <WorkloadBadge workload={c.workload} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{c.students} students</span>
                          <span>{c.applications} apps</span>
                          <span>{c.offers} offers</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-lg font-bold ${c.score >= 70 ? 'text-green-600' : c.score >= 40 ? 'text-yellow-600' : 'text-gray-400'}`}>
                          {c.score}%
                        </div>
                        <div className="text-xs text-gray-400">score</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
