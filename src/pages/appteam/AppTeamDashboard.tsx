import WeeklyTrends from '../../components/dashboards/WeeklyTrends';
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Layers, Users, UserCog, TrendingUp, Clock, CheckCircle, ArrowRight, GraduationCap, LayoutDashboard } from 'lucide-react';
import ActivityFeed from '../../components/ActivityFeed';
import MeetingPanel from '../../components/MeetingPanel';
import { usePortalName } from '../../hooks/usePortalName';

const STATUSES = [
  { key: 'draft',          label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100',   bar: 'bg-gray-400' },
  { key: 'submitted',      label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-100',   bar: 'bg-blue-500' },
  { key: 'under_review',   label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-100',  bar: 'bg-amber-500' },
  { key: 'offer_received', label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-100', bar: 'bg-purple-500' },
  { key: 'accepted',       label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-100',  bar: 'bg-green-500' },
  { key: 'rejected',       label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-100',    bar: 'bg-red-500' },
  { key: 'enrolled',       label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-100', bar: 'bg-indigo-500' },
];

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find(x => x.key === status);
  if (!s) return <span className="text-xs text-gray-400">{status}</span>;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>{s.label}</span>;
}

export default function AppTeamDashboard() {
  const { portal } = usePortalName();
  const [apps, setApps] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.admin.applications(), api.admin.students({ fields: ['counselorId', 'name', 'nationality'] }), api.admin.counselors()])
      .then(([a, s, c]) => { setApps(a); setStudents(s); setCounselors(c); })
      .catch(err => setError(err.message || 'Could not load dashboard data. Refresh to try again.'))
      .finally(() => setLoading(false));
  }, []);

  const studentMap = useMemo(() => {
    const m: Record<string, any> = {};
    students.forEach(s => { m[s._id] = s; });
    return m;
  }, [students]);

  const counselorMap = useMemo(() => {
    const m: Record<string, any> = {};
    counselors.forEach(c => { m[c._id] = c; });
    return m;
  }, [counselors]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    STATUSES.forEach(s => { c[s.key] = 0; });
    apps.forEach(a => { if (c[a.status] !== undefined) c[a.status]++; });
    return c;
  }, [apps]);

  const recentApps = useMemo(() =>
    [...apps]
      .sort((a, b) => new Date(b.updatedDate || b.updatedAt || 0).getTime() - new Date(a.updatedDate || a.updatedAt || 0).getTime())
      .slice(0, 10),
    [apps]
  );

  const counselorStats = useMemo(() => {
    const studentsByCounselor: Record<string, any[]> = {};
    students.forEach(s => {
      const cid = s.counselorId?._id || s.counselorId;
      if (cid) {
        if (!studentsByCounselor[cid]) studentsByCounselor[cid] = [];
        studentsByCounselor[cid].push(s);
      }
    });
    const appsByStudent: Record<string, number> = {};
    apps.forEach(a => { appsByStudent[a.studentId] = (appsByStudent[a.studentId] || 0) + 1; });

    return counselors.map(c => {
      const assigned = studentsByCounselor[c._id] || [];
      const totalApps = assigned.reduce((sum, s) => sum + (appsByStudent[s._id] || 0), 0);
      return { ...c, studentCount: assigned.length, appCount: totalApps };
    }).sort((a, b) => b.appCount - a.appCount);
  }, [counselors, students, apps]);

  const fmtDate = (d?: string) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const maxCount = Math.max(...STATUSES.map(s => statusCounts[s.key] || 0), 1);

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}
      {/* Header — same orange banner as the other Application Team pages */}
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm flex-shrink-0">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-orange-100 text-xs font-medium uppercase tracking-wide">{portal}</p>
            <h1 className="text-2xl font-bold leading-tight">Application Dashboard</h1>
          </div>
        </div>
        <p className="text-orange-50 mt-3 text-sm">Overview of all applications, students, and counselor assignments</p>
      </div>

      <WeeklyTrends />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Applications', value: apps.length,       icon: Layers,    color: 'text-orange-600', bg: 'bg-orange-50',  to: '/appteam/applications' },
          { label: 'Total Students',     value: students.length,   icon: Users,     color: 'text-orange-600', bg: 'bg-orange-50',  to: '/appteam/students' },
          { label: 'Total Counselors',   value: counselors.length, icon: UserCog,   color: 'text-orange-600', bg: 'bg-orange-50',  to: '/appteam/counselors' },
          { label: 'Active (In Progress)', value: (statusCounts.submitted || 0) + (statusCounts.under_review || 0) + (statusCounts.offer_received || 0),
            icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50', to: '/appteam/applications' },
        ].map(card => (
          <Link key={card.label} to={card.to}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-orange-200 transition-all group">
            <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
            <p className="text-xs text-orange-500 font-medium mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Application Status Breakdown</h2>
            <Link to="/appteam/applications" className="text-xs text-orange-500 font-semibold hover:underline flex items-center gap-1">
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {STATUSES.map(s => {
              const count = statusCounts[s.key] || 0;
              const pct = apps.length ? Math.round((count / apps.length) * 100) : 0;
              const width = apps.length ? Math.round((count / maxCount) * 100) : 0;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-28 flex-shrink-0">{s.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className={`h-2 rounded-full transition-all ${s.bar}`} style={{ width: `${width}%` }} />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 w-16 justify-end">
                    <span className="text-sm font-bold text-gray-800">{count}</span>
                    <span className="text-xs text-gray-400">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Counselor workload */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Counselor Workload</h2>
            <Link to="/appteam/counselors" className="text-xs text-orange-500 font-semibold hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {counselorStats.slice(0, 6).map(c => (
              <div key={c._id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {c.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.specialty || 'General'}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-right">
                  <div>
                    <p className="text-sm font-bold text-orange-600">{c.studentCount}</p>
                    <p className="text-[10px] text-gray-400">students</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-orange-500">{c.appCount}</p>
                    <p className="text-[10px] text-gray-400">apps</p>
                  </div>
                </div>
              </div>
            ))}
            {counselorStats.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No counselors found</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent applications */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />
            <h2 className="text-base font-bold text-gray-900">Recent Applications</h2>
          </div>
          <Link to="/appteam/applications" className="text-xs text-orange-500 font-semibold hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {recentApps.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No applications found</p>
          ) : recentApps.map(app => {
            const student = studentMap[app.studentId];
            const counselorId = student?.counselorId?._id || student?.counselorId;
            const counselor = counselorId ? counselorMap[counselorId] : null;
            return (
              <div key={app._id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {student?.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 truncate">{student?.name || app.studentId}</p>
                    {student?.nationality && (
                      <span className="text-xs text-gray-400">· {student.nationality}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {app.universityId ? (
                      <Link to={`/university/${app.universityId}`} onClick={e => e.stopPropagation()} className="hover:text-orange-600 hover:underline">{app.universityName}</Link>
                    ) : app.universityName}
                    {app.courseName ? ` — ${app.courseName}` : ''}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                  {counselor && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {counselor.name?.[0]?.toUpperCase()}
                      </div>
                      <span className="text-xs text-gray-500 hidden lg:block">{counselor.name}</span>
                    </div>
                  )}
                </div>
                <StatusBadge status={app.status} />
                <span className="hidden md:block text-xs text-gray-400 flex-shrink-0">{fmtDate(app.updatedDate || app.updatedAt)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity feed + Meeting panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <ActivityFeed />
        </div>
        <div>
          <MeetingPanel theme="orange" meetingsPagePath="/admin/meetings" />
        </div>
      </div>

      {/* Learning Hub CTA */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">Application Team Training</p>
            <p className="text-orange-100 text-xs mt-0.5">Learn processing workflows, status rules, document checks, and escalation procedures.</p>
          </div>
        </div>
        <Link to="/appteam/learning"
          className="flex items-center gap-2 bg-white text-orange-600 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-orange-50 transition-colors whitespace-nowrap flex-shrink-0">
          Open Learning Hub <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Quick stats footer */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Accepted',    value: statusCounts.accepted || 0,  icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50',  to: '/appteam/applications' },
          { label: 'Enrolled',    value: statusCounts.enrolled || 0,  icon: CheckCircle, color: 'text-indigo-600', bg: 'bg-indigo-50', to: '/appteam/applications' },
          { label: 'Rejected',    value: statusCounts.rejected || 0,  icon: CheckCircle, color: 'text-red-600',    bg: 'bg-red-50',    to: '/appteam/applications' },
          { label: 'Draft',       value: statusCounts.draft || 0,     icon: Clock,       color: 'text-gray-600',   bg: 'bg-gray-50',   to: '/appteam/applications' },
        ].map(item => (
          <Link key={item.label} to={item.to} className={`${item.bg} rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-all group`}>
            <item.icon className={`w-8 h-8 ${item.color} opacity-70`} />
            <div>
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                {item.label}
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
