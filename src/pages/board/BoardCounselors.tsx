import { useEffect, useState, useMemo } from 'react';
import { api } from '../../api';
import { Search, X, ChevronRight, UserCog, Users, Mail, Phone, Layers } from 'lucide-react';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:          { label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100' },
  submitted:      { label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-100' },
  under_review:   { label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-100' },
  offer_received: { label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-100' },
  accepted:       { label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-100' },
  rejected:       { label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-100' },
  enrolled:       { label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-100' },
};

export default function BoardCounselors() {
  const [counselors, setCounselors] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    Promise.all([api.admin.counselors(), api.admin.students(), api.admin.applications()])
      .then(([couns, studs, apps]) => {
        setCounselors(couns);
        setStudents(studs);
        setApplications(apps);
      })
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
    const list = !q ? counselors : counselors.filter(c =>
      [c.name, c.email, c.specialty, c.phone].some(v => v?.toLowerCase().includes(q))
    );
    return [...list].sort((a, b) =>
      new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime()
    );
  }, [counselors, search]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const selectedStudents = selected ? (studentsByCounselor[selected._id] || []) : [];
  const totalAppsForSelected = selectedStudents.reduce((sum, s) => sum + (appsByStudent[s._id]?.length || 0), 0);

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6">
      {/* Left list */}
      <div className={`flex flex-col border-r border-gray-200 bg-white ${selected ? 'hidden lg:flex w-72' : 'flex-1'}`}>
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <h1 className="text-base font-bold text-gray-900 mb-2">
            Counselors <span className="text-gray-400 font-normal text-sm">({filtered.length})</span>
          </h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, specialty..."
              className="w-full pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-400" /></button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No counselors found</p>
          ) : filtered.map(c => {
            const assignedStudents = studentsByCounselor[c._id] || [];
            const totalApps = assignedStudents.reduce((sum, s) => sum + (appsByStudent[s._id]?.length || 0), 0);
            return (
              <button key={c._id} onClick={() => setSelected(c)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${selected?._id === c._id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                  {c.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400 truncate">{c.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-indigo-500 font-medium">{assignedStudents.length} student{assignedStudents.length !== 1 ? 's' : ''}</span>
                    <span className="text-[10px] text-gray-400">· {totalApps} app{totalApps !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Right detail */}
      {selected ? (
        <div className="flex-1 bg-white overflow-y-auto">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <button onClick={() => setSelected(null)} className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronRight className="w-4 h-4 text-gray-500 rotate-180" />
            </button>
            <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
              {selected.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-gray-900">{selected.name}</h2>
              <p className="text-xs text-gray-500">{selected.email}</p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="bg-indigo-100 text-indigo-700 font-semibold px-2.5 py-1 rounded-full">{selectedStudents.length} students</span>
              <span className="bg-gray-100 text-gray-600 font-semibold px-2.5 py-1 rounded-full">{totalAppsForSelected} apps</span>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Contact info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <UserCog className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-bold text-gray-800">Counselor Details</h3>
              </div>
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
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="text-sm font-medium text-gray-800">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Assigned students */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-bold text-gray-800">Assigned Students ({selectedStudents.length})</h3>
              </div>
              {selectedStudents.length === 0 ? (
                <p className="text-sm text-gray-400">No students assigned</p>
              ) : (
                <div className="space-y-3">
                  {selectedStudents.map(s => {
                    const studentApps = appsByStudent[s._id] || [];
                    const statusCounts: Record<string, number> = {};
                    studentApps.forEach(a => { statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });

                    return (
                      <div key={s._id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {s.name?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                            <p className="text-xs text-gray-400 truncate">{s.email}</p>
                          </div>
                          <span className="text-xs font-medium text-gray-500">{s.nationality}</span>
                        </div>

                        {studentApps.length > 0 && (
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1">
                              <Layers className="w-3 h-3" /> Applications ({studentApps.length})
                            </p>
                            <div className="space-y-1.5">
                              {studentApps.map(app => {
                                const cfg = STATUS_CFG[app.status] || STATUS_CFG.draft;
                                return (
                                  <div key={app._id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-gray-800 truncate">{app.universityName}</p>
                                      <p className="text-[10px] text-gray-400 truncate">{app.courseName} · {app.intake}</p>
                                    </div>
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                                  </div>
                                );
                              })}
                            </div>
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
        <div className="hidden lg:flex flex-1 items-center justify-center text-sm text-gray-400">
          Select a counselor to view their assigned students and applications
        </div>
      )}
    </div>
  );
}
