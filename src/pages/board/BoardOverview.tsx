import WeeklyTrends from '../../components/dashboards/WeeklyTrends';
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Layers, Users, UserCog, FolderOpen, ArrowRight } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; bar: string }> = {
  draft:          { label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100',   bar: 'bg-gray-400' },
  submitted:      { label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-100',   bar: 'bg-blue-500' },
  under_review:   { label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-100',  bar: 'bg-amber-500' },
  offer_received: { label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-100', bar: 'bg-purple-500' },
  accepted:       { label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-100',  bar: 'bg-green-500' },
  rejected:       { label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-100',    bar: 'bg-red-500' },
  enrolled:       { label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-100', bar: 'bg-indigo-500' },
};

export default function BoardOverview() {
  const [applications, setApplications] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.admin.applications(), api.admin.students(), api.admin.counselors()])
      .then(([apps, studs, couns]) => {
        setApplications(apps);
        setStudents(studs);
        setCounselors(couns);
      })
      .catch(err => setError(err.message || 'Could not load board data. Refresh to try again.'))
      .finally(() => setLoading(false));
  }, []);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    applications.forEach(a => { c[a.status] = (c[a.status] || 0) + 1; });
    return c;
  }, [applications]);

  const recentApps = useMemo(() =>
    [...applications]
      .sort((a, b) =>
        new Date(b.updatedDate || b.submittedDate || 0).getTime() -
        new Date(a.updatedDate || a.submittedDate || 0).getTime()
      )
      .slice(0, 8),
    [applications]
  );

  const totalDocs = useMemo(() =>
    students.reduce((sum, s) => sum + (s.documents?.length || 0), 0),
    [students]
  );

  const counselorStudentMap = useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach(s => {
      const cid = s.counselorId?._id || s.counselorId;
      if (cid) map[cid] = (map[cid] || 0) + 1;
    });
    return map;
  }, [students]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Board Overview</h1>
        <p className="text-sm text-gray-500 mt-0.5">All applications, students, counselors, and documents at a glance</p>
      </div>

      <WeeklyTrends />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { to: '/board/applications', label: 'Applications', value: applications.length, sub: 'All time', icon: Layers, iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600' },
          { to: '/board/students', label: 'Students', value: students.length, sub: 'Registered', icon: Users, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
          { to: '/board/counselors', label: 'Counselors', value: counselors.length, sub: 'Active', icon: UserCog, iconBg: 'bg-teal-100', iconColor: 'text-teal-600' },
          { to: '/board/documents', label: 'Documents', value: totalDocs, sub: 'Total files', icon: FolderOpen, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
        ].map(({ to, label, value, sub, icon: Icon, iconBg, iconColor }) => (
          <Link key={to} to={to} className="bg-white rounded-xl p-5 border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">{label}</span>
              <div className={`w-9 h-9 ${iconBg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1 group-hover:text-indigo-500">
              {sub} <ArrowRight className="w-3 h-3" />
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Application Status Breakdown</h2>
            <Link to="/board/applications" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
              const count = statusCounts[status] || 0;
              const pct = applications.length ? Math.round((count / applications.length) * 100) : 0;
              return (
                <div key={status}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                    <span className="font-semibold text-gray-900">
                      {count} <span className="text-gray-400 font-normal text-xs">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cfg.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent applications */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Applications</h2>
            <Link to="/board/applications" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2.5 overflow-y-auto max-h-72">
            {recentApps.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No applications yet</p>
            ) : recentApps.map(app => {
              const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.draft;
              return (
                <div key={app._id} className="flex items-center gap-3 py-1">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                    {app.studentName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{app.studentName}</p>
                    <p className="text-xs text-gray-400 truncate"><Link to={`/university/${app.universityId}`} className="hover:text-indigo-600 hover:underline">{app.universityName}</Link> · {app.courseName}</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Counselor assignment grid */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Counselor Assignments</h2>
          <Link to="/board/counselors" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
            Manage <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {counselors.length === 0 ? (
          <p className="text-sm text-gray-400">No counselors found.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {counselors.map(c => {
              const count = counselorStudentMap[c._id] || 0;
              return (
                <Link to="/board/counselors" key={c._id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-indigo-50 transition-colors">
                  <div className="w-9 h-9 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {c.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500">{count} student{count !== 1 ? 's' : ''}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
