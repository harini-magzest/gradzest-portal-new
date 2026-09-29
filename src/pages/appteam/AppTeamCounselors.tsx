import { useEffect, useState, useMemo } from 'react';
import { api } from '../../api';
import { useCallContext } from '../../context/CallContext';
import { PresenceDot, PresenceLabel } from '../../components/Presence';
import { Search, X, ChevronRight, Mail, Phone, Layers, Users, UserCog } from 'lucide-react';

const STATUSES: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft:          { label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100',   dot: 'bg-gray-400' },
  submitted:      { label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-100',   dot: 'bg-blue-500' },
  under_review:   { label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-100',  dot: 'bg-amber-500' },
  offer_received: { label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-100', dot: 'bg-purple-500' },
  accepted:       { label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-100',  dot: 'bg-green-500' },
  rejected:       { label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-100',    dot: 'bg-red-500' },
  enrolled:       { label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-100', dot: 'bg-indigo-500' },
};

function AppBadge({ status }: { status: string }) {
  const s = STATUSES[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export default function AppTeamCounselors() {
  const [counselors, setCounselors] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [onlyOnline, setOnlyOnline] = useState(false);
  const { isOnline } = useCallContext();

  useEffect(() => {
    Promise.all([api.admin.counselors(), api.admin.students(), api.admin.applications()])
      .then(([c, s, a]) => { setCounselors(c); setStudents(s); setApplications(a); })
      .finally(() => setLoading(false));
  }, []);

  const studentsByCounselor = useMemo(() => {
    const m: Record<string, any[]> = {};
    students.forEach(s => {
      const cid = s.counselorId?._id || s.counselorId;
      if (cid) {
        if (!m[cid]) m[cid] = [];
        m[cid].push(s);
      }
    });
    return m;
  }, [students]);

  const appsByStudent = useMemo(() => {
    const m: Record<string, any[]> = {};
    applications.forEach(a => {
      if (!m[a.studentId]) m[a.studentId] = [];
      m[a.studentId].push(a);
    });
    return m;
  }, [applications]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return counselors
      .filter(c => !q || [c.name, c.email, c.specialty, c.phone].some(v => v?.toLowerCase().includes(q)))
      .filter(c => !onlyOnline || isOnline(String(c._id)))
      // Online counselors first
      .sort((a, b) => Number(isOnline(String(b._id))) - Number(isOnline(String(a._id))));
  }, [counselors, search, onlyOnline, isOnline]);
  const onlineCount = counselors.filter(c => isOnline(String(c._id))).length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const selStudents = selected ? (studentsByCounselor[selected._id] || []) : [];
  const selTotalApps = selStudents.reduce((n, s) => n + (appsByStudent[s._id]?.length || 0), 0);

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6">

      {/* Left: counselor list */}
      <div className={`flex flex-col border-r border-gray-200 bg-white ${selected ? 'hidden lg:flex w-72' : 'flex-1'}`}>
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base font-bold text-gray-900">Counselors</h1>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filtered.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, specialty..."
              className="w-full pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-400" /></button>}
          </div>
          {/* Live presence: who has Gradzest open right now */}
          <button type="button" onClick={() => setOnlyOnline(v => !v)} aria-pressed={onlyOnline}
            className={`mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              onlyOnline ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <span className={`w-2 h-2 rounded-full ${onlineCount > 0 ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
            {onlineCount} of {counselors.length} online{onlyOnline ? ' · showing online only' : ''}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No counselors found</p>
          ) : filtered.map(c => {
            const assigned = studentsByCounselor[c._id] || [];
            const totalApps = assigned.reduce((n, s) => n + (appsByStudent[s._id]?.length || 0), 0);
            return (
              <button key={c._id} onClick={() => setSelected(c)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                  selected?._id === c._id ? 'bg-orange-50 border-l-[3px] border-orange-500' : ''
                }`}>
                <div className="relative w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                  {c.name?.[0]?.toUpperCase()}
                  <PresenceDot userId={String(c._id)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400 truncate">{c.email}</p>
                  {c.specialty && <p className="text-[10px] text-teal-500 font-medium">{c.specialty}</p>}
                </div>
                <div className="flex-shrink-0 text-right space-y-0.5">
                  <div className="flex items-center gap-1 justify-end">
                    <Users className="w-3 h-3 text-blue-400" />
                    <span className="text-xs font-bold text-blue-600">{assigned.length}</span>
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <Layers className="w-3 h-3 text-orange-400" />
                    <span className="text-xs font-bold text-orange-500">{totalApps}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail panel */}
      {selected ? (
        <div className="flex-1 bg-white overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <button onClick={() => setSelected(null)} className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronRight className="w-4 h-4 text-gray-500 rotate-180" />
            </button>
            <div className="relative w-11 h-11 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {selected.name?.[0]?.toUpperCase()}
              <PresenceDot userId={String(selected._id)} size="md" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900">{selected.name}</h2>
              <p className="text-xs text-gray-500">{selected.email}</p>
              <PresenceLabel userId={String(selected._id)} />
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">{selStudents.length} students</span>
              <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full">{selTotalApps} apps</span>
            </div>
          </div>

          <div className="p-6 space-y-5 max-w-4xl">
            {/* Counselor details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <UserCog className="w-4 h-4 text-orange-500" /> Counselor Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  [Mail, 'Email', selected.email],
                  [Phone, 'Phone', selected.phone],
                  [UserCog, 'Specialty', selected.specialty],
                  [UserCog, 'Status', selected.status],
                ].filter(([, , v]) => v).map(([Icon, label, value]: any) => (
                  <div key={label} className="flex items-start gap-3">
                    <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
                      <p className="text-sm font-medium text-gray-800">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Assigned students */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-500" /> Assigned Students ({selStudents.length})
              </h3>
              {selStudents.length === 0 ? (
                <p className="text-sm text-gray-400">No students assigned to this counselor</p>
              ) : (
                <div className="space-y-3">
                  {selStudents.map(s => {
                    const studentApps = appsByStudent[s._id] || [];
                    return (
                      <div key={s._id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {s.name?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                            <p className="text-xs text-gray-400 truncate">{s.email}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {s.nationality && <span className="text-xs text-gray-400">{s.nationality}</span>}
                            <span className="text-xs font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">
                              {studentApps.length} apps
                            </span>
                          </div>
                        </div>

                        {studentApps.length > 0 && (
                          <div className="space-y-1.5">
                            {studentApps.map((app: any) => (
                              <div key={app._id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-800 truncate">{app.universityName}</p>
                                  <p className="text-[10px] text-gray-400 truncate">{app.courseName} · {app.intake}</p>
                                </div>
                                <AppBadge status={app.status} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center text-center">
          <div>
            <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <UserCog className="w-8 h-8 text-teal-400" />
            </div>
            <p className="text-sm text-gray-400">Select a counselor to view their<br />assigned students and applications</p>
          </div>
        </div>
      )}
    </div>
  );
}
