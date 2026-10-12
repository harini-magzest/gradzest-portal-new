import { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../../api';
import { Search, X, ChevronRight, User, FileText, Download, Layers, UserCog } from 'lucide-react';
import { exportRowsToCsv } from '../../utils/exportCsv';
import { downloadStudentProfilePdf } from '../../utils/studentProfilePdf';
import SignedFileLink from '../../components/SignedFileLink';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:          { label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100' },
  submitted:      { label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-100' },
  under_review:   { label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-100' },
  offer_received: { label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-100' },
  accepted:       { label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-100' },
  rejected:       { label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-100' },
  enrolled:       { label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-100' },
  active:         { label: 'Active',         color: 'text-green-700',  bg: 'bg-green-100' },
  inactive:       { label: 'Inactive',       color: 'text-gray-600',   bg: 'bg-gray-100' },
};

function Pill({ status }: { status: string }) {
  const c = STATUS_CFG[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100' };
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.color}`}>{c.label}</span>;
}

export default function BoardStudents() {
  const [students, setStudents] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    Promise.all([api.admin.students(), api.admin.counselors(), api.admin.applications()])
      .then(([studs, couns, apps]) => {
        setStudents(studs);
        setCounselors(couns);
        setApplications(apps);
      })
      .finally(() => setLoading(false));
  }, []);

  const counselorMap = useMemo(() => {
    const m: Record<string, any> = {};
    counselors.forEach(c => { m[c._id] = c; });
    return m;
  }, [counselors]);

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
    const list = !q ? students : students.filter(s =>
      [s.name, s.email, s.nationality, s.phone].some(v => v?.toLowerCase().includes(q))
    );
    return [...list].sort((a, b) =>
      new Date(b.createdAt || b.joinedDate || 0).getTime() - new Date(a.createdAt || a.joinedDate || 0).getTime()
    );
  }, [students, search]);

  const handleExport = () => {
    exportRowsToCsv('students.csv', filtered.map(s => ({
      Name: s.name || '', Email: s.email || '', Phone: s.phone || '', Nationality: s.nationality || '',
      Status: s.status || '', Counselor: counselorMap[s.counselorId?._id || s.counselorId]?.name || 'Unassigned',
      Applications: String(appsByStudent[s._id || s.id]?.length || 0), 'Joined Date': s.joinedDate || '',
    })));
  };

  const selectStudent = useCallback(async (s: any) => {
    setSelected(s);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const full = await api.students.get(s._id || s.id);
      setDetail(full);
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const studentApps = selected ? (appsByStudent[selected._id] || []) : [];
  const assignedCounselor = detail
    ? counselorMap[detail.counselorId?._id || detail.counselorId]
    : selected
      ? counselorMap[selected.counselorId?._id || selected.counselorId]
      : null;

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6">
      {/* Left list */}
      <div className={`flex flex-col border-r border-gray-200 bg-white ${selected ? 'hidden lg:flex w-72' : 'flex-1'}`}>
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base font-bold text-gray-900">Students <span className="text-gray-400 font-normal text-sm">({filtered.length})</span></h1>
            <button type="button" onClick={handleExport} title="Export CSV"
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, nationality..."
              className="w-full pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-400" /></button>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No students found</p>
          ) : filtered.map(s => {
            const appCount = (appsByStudent[s._id] || []).length;
            const cid = s.counselorId?._id || s.counselorId;
            const counselor = counselorMap[cid];
            return (
              <button key={s._id} onClick={() => selectStudent(s)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${selected?._id === s._id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}>
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {s.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400 truncate">{s.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400">{s.nationality}</span>
                    {appCount > 0 && <span className="text-[10px] text-indigo-500 font-medium">{appCount} app{appCount !== 1 ? 's' : ''}</span>}
                    {counselor && <span className="text-[10px] text-teal-600 truncate">· {counselor.name}</span>}
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelected(null)} className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg mr-1"><ChevronRight className="w-4 h-4 text-gray-500 rotate-180" /></button>
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-base">
                {selected.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">{selected.name}</h2>
                <p className="text-xs text-gray-500">{selected.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selected.status && <Pill status={selected.status} />}
              <button type="button"
                onClick={() => downloadStudentProfilePdf({ ...selected, ...(detail || {}), applications: studentApps }, { counselorName: assignedCounselor?.name, counselorEmail: assignedCounselor?.email })}
                title="Download Profile PDF"
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors">
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Profile */}
            <Card title="Profile Details" icon={User}>
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> Loading…
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {[
                    ['Nationality', detail?.nationality || selected.nationality],
                    ['Phone', detail?.phone || selected.phone],
                    ['GPA', detail?.gpa || selected.gpa],
                    ['English Test', detail?.englishTest],
                    ['English Score', detail?.englishScore],
                    ['Budget', (detail?.budget || selected.budget) ? `$${Number(detail?.budget || selected.budget).toLocaleString()}` : null],
                    ['Preferred Countries', detail?.preferredCountries?.join(', ') || selected.preferredCountries?.join(', ')],
                    ['Created', selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : null],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k as string}>
                      <p className="text-xs text-gray-400 mb-0.5">{k as string}</p>
                      <p className="font-medium text-gray-800">{v as string}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Counselor */}
            <Card title="Assigned Counselor" icon={UserCog}>
              {assignedCounselor ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                    {assignedCounselor.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{assignedCounselor.name}</p>
                    <p className="text-xs text-gray-500">{assignedCounselor.email}</p>
                    {assignedCounselor.specialty && <p className="text-xs text-gray-400">{assignedCounselor.specialty}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">{loadingDetail ? 'Loading…' : 'No counselor assigned'}</p>
              )}
            </Card>

            {/* Applications */}
            <Card title={`Applications (${studentApps.length})`} icon={Layers}>
              {studentApps.length === 0 ? (
                <p className="text-sm text-gray-400">No applications</p>
              ) : (
                <div className="space-y-2">
                  {studentApps.map(app => {
                    const cfg = STATUS_CFG[app.status] || STATUS_CFG.draft;
                    return (
                      <div key={app._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{app.universityName}</p>
                          <p className="text-xs text-gray-500 truncate">{app.courseName} · {app.intake}</p>
                        </div>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Documents */}
            <Card title={`Documents (${detail?.documents?.length || 0})`} icon={FileText}>
              {loadingDetail ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : !detail?.documents?.length ? (
                <p className="text-sm text-gray-400">No documents uploaded</p>
              ) : (
                <div className="space-y-2">
                  {detail.documents.map((doc: any) => (
                    <div key={doc._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{doc.type}</span>
                          {doc.status && <Pill status={doc.status} />}
                          {doc.uploadedAt && <span className="text-xs text-gray-400">{new Date(doc.uploadedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      {doc.url && (
                        <SignedFileLink href={doc.url} download target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-xs font-medium flex-shrink-0">
                          <Download className="w-3.5 h-3.5" /> Download
                        </SignedFileLink>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center text-sm text-gray-400">
          Select a student to view full details
        </div>
      )}
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}
