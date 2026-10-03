import { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useCallContext } from '../../context/CallContext';
import { PresenceDot, PresenceLabel } from '../../components/Presence';
import {
  Search, X, Mail, Phone, Layers, Users, UserCog, Award, MessageSquare, Wifi, UserX,
  ChevronDown, SlidersHorizontal, Briefcase, Languages, AlertCircle, RefreshCw, ChevronRight,
} from 'lucide-react';

const STATUSES: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft:          { label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100',   dot: 'bg-gray-400' },
  submitted:      { label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-100',   dot: 'bg-blue-500' },
  under_review:   { label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-100',  dot: 'bg-amber-500' },
  offer_received: { label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-100', dot: 'bg-purple-500' },
  accepted:       { label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-100',  dot: 'bg-green-500' },
  rejected:       { label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-100',    dot: 'bg-red-500' },
  enrolled:       { label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-100', dot: 'bg-indigo-500' },
};
const STATUS_ORDER = Object.keys(STATUSES);
const OFFER_STATUSES = ['offer_received', 'accepted', 'enrolled'];

type Presence = 'all' | 'online' | 'offline';
type Workload = 'all' | 'with' | 'without';
type SortKey = 'online' | 'name' | 'students' | 'apps' | 'offers';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'online', label: 'Online first' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'students', label: 'Most students' },
  { key: 'apps', label: 'Most applications' },
  { key: 'offers', label: 'Most offers' },
];

const idOf = (x: any) => String(x?._id || x?.id || x || '');

function AppBadge({ status }: { status: string }) {
  const s = STATUSES[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

/** Applications by stage as one stacked bar; every stage is also listed with its count on hover. */
function PipelineBar({ counts, total }: { counts: Record<string, number>; total: number }) {
  if (!total) return <div className="h-2 rounded-full bg-gray-100" title="No applications" />;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-gray-100"
      title={STATUS_ORDER.filter(s => counts[s]).map(s => `${STATUSES[s].label}: ${counts[s]}`).join(' · ')}>
      {STATUS_ORDER.filter(s => counts[s]).map(s => (
        <span key={s} className={STATUSES[s].dot} style={{ width: `${(counts[s] / total) * 100}%` }} />
      ))}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone, active, hint, onClick }: {
  icon: any; label: string; value: number | string; tone: string; active?: boolean; hint: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={hint}
      className={`text-left bg-white rounded-2xl border shadow-sm px-4 py-3 flex items-center gap-3 transition-all hover:shadow-md hover:border-orange-200 ${
        active ? 'border-orange-400 ring-2 ring-orange-100' : 'border-gray-100'}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}><Icon className="w-4 h-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-xs text-gray-500 truncate">{label}</p>
      </div>
      <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-transform ${active ? 'rotate-90 text-orange-500' : 'text-gray-300'}`} />
    </button>
  );
}

type Panel = 'assigned' | 'unassigned' | 'applications' | 'offers';
const PANEL_TITLE: Record<Panel, string> = {
  assigned: 'Assigned students', unassigned: 'Unassigned students', applications: 'All applications', offers: 'Offers',
};

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
        className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
        {children}
      </select>
      <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 pointer-events-none" />
    </label>
  );
}

export default function AppTeamCounselors() {
  const [counselors, setCounselors] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLParagraphElement>(null);
  const { isOnline } = useCallContext();

  // Filters
  const [search, setSearch] = useState('');
  const [presence, setPresence] = useState<Presence>('all');
  const [workload, setWorkload] = useState<Workload>('all');
  const [specialty, setSpecialty] = useState('');
  const [sort, setSort] = useState<SortKey>('online');

  const load = () => {
    setLoading(true); setError('');
    Promise.all([api.admin.counselors(), api.admin.students(), api.admin.applications()])
      .then(([c, s, a]) => { setCounselors(c); setStudents(s); setApplications(a); setUpdatedAt(new Date()); })
      .catch(err => setError(err.message || 'Could not load counselors.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const studentsByCounselor = useMemo(() => {
    const m: Record<string, any[]> = {};
    students.forEach(s => {
      const cid = idOf(s.counselorId);
      if (cid) (m[cid] ||= []).push(s);
    });
    return m;
  }, [students]);

  const appsByStudent = useMemo(() => {
    const m: Record<string, any[]> = {};
    applications.forEach(a => { (m[idOf(a.studentId)] ||= []).push(a); });
    return m;
  }, [applications]);

  // Per-counselor numbers, computed once and shared by the cards, sorting and the drawer
  const stats = useMemo(() => {
    const m: Record<string, { students: number; apps: number; offers: number; byStatus: Record<string, number> }> = {};
    counselors.forEach(c => {
      const assigned = studentsByCounselor[idOf(c)] || [];
      const apps = assigned.flatMap(s => appsByStudent[idOf(s)] || []);
      const byStatus: Record<string, number> = {};
      apps.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
      m[idOf(c)] = { students: assigned.length, apps: apps.length, offers: apps.filter(a => OFFER_STATUSES.includes(a.status)).length, byStatus };
    });
    return m;
  }, [counselors, studentsByCounselor, appsByStudent]);

  const specialties = useMemo(
    () => Array.from(new Set(counselors.flatMap(c => c.specialization || []))).filter(Boolean).sort(),
    [counselors],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = counselors.filter(c => {
      const st = stats[idOf(c)];
      if (q && ![c.name, c.email, c.phone, c.title, ...(c.specialization || [])].some(v => v?.toLowerCase().includes(q))) return false;
      if (presence === 'online' && !isOnline(idOf(c))) return false;
      if (presence === 'offline' && isOnline(idOf(c))) return false;
      if (workload === 'with' && !st?.students) return false;
      if (workload === 'without' && st?.students) return false;
      if (specialty && !(c.specialization || []).includes(specialty)) return false;
      return true;
    });
    const by = (k: 'students' | 'apps' | 'offers') => (a: any, b: any) => (stats[idOf(b)]?.[k] || 0) - (stats[idOf(a)]?.[k] || 0);
    const byName = (a: any, b: any) => (a.name || '').localeCompare(b.name || '');
    const cmp = sort === 'name' ? byName
      : sort === 'online' ? (a: any, b: any) => Number(isOnline(idOf(b))) - Number(isOnline(idOf(a))) || byName(a, b)
      : by(sort);
    return [...list].sort(cmp);
  }, [counselors, stats, search, presence, workload, specialty, sort, isOnline]);

  const filtersOn = !!search || presence !== 'all' || workload !== 'all' || !!specialty;
  const clearFilters = () => { setSearch(''); setPresence('all'); setWorkload('all'); setSpecialty(''); };

  const onlineCount = counselors.filter(c => isOnline(idOf(c))).length;
  const assignedCount = Object.values(stats).reduce((n, s) => n + s.students, 0);
  const unassignedCount = students.filter(s => !idOf(s.counselorId)).length;
  const totalOffers = Object.values(stats).reduce((n, s) => n + s.offers, 0);
  const totalApps = Object.values(stats).reduce((n, s) => n + s.apps, 0);

  const selected = counselors.find(c => idOf(c) === selectedId) || null;

  // Tiles: the first two filter the counselor list, the rest open a list of records on this page
  const togglePanel = (p: Panel) => setPanel(cur => (cur === p ? null : p));
  const showCounselors = (p: Presence) => {
    setPanel(null); clearFilters(); setPresence(p);
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  useEffect(() => {
    if (panel) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [panel]);

  if (loading && !counselors.length) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header — same orange banner as the other Application Team pages */}
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm flex-shrink-0">
              <UserCog className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-orange-100 text-xs font-medium uppercase tracking-wide">Application Team</p>
              <h1 className="text-2xl font-bold leading-tight">Counselors</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {updatedAt && (
              <span className="text-xs text-orange-100" aria-live="polite">
                {loading ? 'Refreshing…' : `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
              </span>
            )}
            <button type="button" onClick={load} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>
        <p className="text-orange-50 mt-3 text-sm">Workload, applications and availability across the counselling team</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Team summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={UserCog} label="Counselors" value={counselors.length} tone="bg-teal-50 text-teal-700"
          active={!panel && !filtersOn} hint="Show all counselors" onClick={() => showCounselors('all')} />
        <Kpi icon={Wifi} label="Online now" value={onlineCount} tone="bg-green-50 text-green-700"
          active={!panel && presence === 'online'} hint="Show counselors who are online" onClick={() => showCounselors('online')} />
        <Kpi icon={Users} label="Assigned students" value={assignedCount} tone="bg-blue-50 text-blue-700"
          active={panel === 'assigned'} hint="List students who have a counselor" onClick={() => togglePanel('assigned')} />
        <Kpi icon={UserX} label="Unassigned students" value={unassignedCount} tone={unassignedCount ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}
          active={panel === 'unassigned'} hint="List students without a counselor" onClick={() => togglePanel('unassigned')} />
        <Kpi icon={Layers} label="Applications" value={totalApps} tone="bg-orange-50 text-orange-600"
          active={panel === 'applications'} hint="List all applications" onClick={() => togglePanel('applications')} />
        <Kpi icon={Award} label="Offers" value={totalOffers} tone="bg-purple-50 text-purple-700"
          active={panel === 'offers'} hint="List applications with an offer" onClick={() => togglePanel('offers')} />
      </div>

      {panel && (
        <div ref={panelRef} className="scroll-mt-4">
          <RecordsPanel panel={panel} students={students} applications={applications} counselors={counselors}
            appsByStudent={appsByStudent} onClose={() => setPanel(null)} onOpenCounselor={setSelectedId} />
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone, specialization…"
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
        <div className="flex gap-0.5 bg-gray-100 rounded-xl p-0.5" role="tablist" aria-label="Availability">
          {(['all', 'online', 'offline'] as Presence[]).map(p => (
            <button key={p} type="button" role="tab" aria-selected={presence === p} onClick={() => setPresence(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize inline-flex items-center gap-1.5 ${presence === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {p !== 'all' && <span className={`w-2 h-2 rounded-full ${p === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />}
              {p}{p === 'online' ? ` (${onlineCount})` : ''}
            </button>
          ))}
        </div>
        <Select label="Workload" value={workload} onChange={v => setWorkload(v as Workload)}>
          <option value="all">Any workload</option>
          <option value="with">Has students</option>
          <option value="without">No students yet</option>
        </Select>
        {specialties.length > 0 && (
          <Select label="Specialization" value={specialty} onChange={setSpecialty}>
            <option value="">All specializations</option>
            {specialties.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
        <Select label="Sort by" value={sort} onChange={v => setSort(v as SortKey)}>
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
        {filtersOn && (
          <button type="button" onClick={clearFilters} className="px-3 py-2 text-sm text-orange-600 hover:text-orange-700 font-medium">Clear filters</button>
        )}
      </div>

      <p ref={listRef} className="text-xs text-gray-500 flex items-center gap-1.5 scroll-mt-4">
        <SlidersHorizontal className="w-3.5 h-3.5" />Showing {filtered.length} of {counselors.length} counselors
      </p>

      {/* Counselor list — one row per counselor, numbers aligned in columns */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <UserCog className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No counselors match these filters.</p>
          {filtersOn && <button type="button" onClick={clearFilters} className="mt-2 text-sm text-orange-600 font-medium">Clear filters</button>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Column headings (wide screens) */}
          <div className="hidden lg:grid grid-cols-[minmax(0,2.2fr)_repeat(3,5.5rem)_minmax(0,1.3fr)_auto] items-center gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            <span>Counselor</span>
            <span className="text-center">Students</span>
            <span className="text-center">Applications</span>
            <span className="text-center">Offers</span>
            <span>Application pipeline</span>
            <span className="w-[13.5rem]" aria-hidden="true" />
          </div>
          <ul className="divide-y divide-gray-100">
            {filtered.map(c => {
              const st = stats[idOf(c)];
              const nums: [string, number, string][] = [
                ['Students', st?.students || 0, 'text-blue-600'],
                ['Applications', st?.apps || 0, 'text-orange-500'],
                ['Offers', st?.offers || 0, 'text-purple-600'],
              ];
              return (
                <li key={idOf(c)}
                  className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_repeat(3,5.5rem)_minmax(0,1.3fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-4 hover:bg-orange-50/40 transition-colors">
                  {/* Who */}
                  <button type="button" onClick={() => setSelectedId(idOf(c))} className="flex items-center gap-3 min-w-0 text-left group">
                    <div className="relative w-11 h-11 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {c.name?.[0]?.toUpperCase()}
                      <PresenceDot userId={idOf(c)} size="md" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate group-hover:text-orange-600">
                        {c.name}{c.title && <span className="font-normal text-gray-500 text-sm"> · {c.title}</span>}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                      {(c.specialization || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.specialization.slice(0, 3).map((s: string) => (
                            <span key={s} className="text-[10px] font-medium bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{s}</span>
                          ))}
                          {c.specialization.length > 3 && <span className="text-[10px] text-gray-400 px-1">+{c.specialization.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Numbers: their own columns on wide screens, one row of three on small ones */}
                  <div className="grid grid-cols-3 gap-2 lg:contents">
                    {nums.map(([label, value, cls]) => (
                      <div key={label} className="text-center bg-gray-50 rounded-xl py-1.5 lg:bg-transparent lg:py-0">
                        <p className={`text-lg font-bold ${value ? cls : 'text-gray-300'}`}>{value}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide lg:hidden">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Pipeline */}
                  <div className="min-w-0">
                    <PipelineBar counts={st?.byStatus || {}} total={st?.apps || 0} />
                    <p className="text-[11px] text-gray-400 mt-1 truncate">
                      {st?.apps
                        ? STATUS_ORDER.filter(s => st.byStatus[s]).map(s => `${STATUSES[s].label} ${st.byStatus[s]}`).join(' · ')
                        : 'No applications yet'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 lg:w-[13.5rem] lg:justify-end">
                    <Link to={`/appteam/chat?counselorId=${idOf(c)}`}
                      className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50">
                      <MessageSquare className="w-4 h-4" />Message
                    </Link>
                    <button type="button" onClick={() => setSelectedId(idOf(c))}
                      className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">
                      <Users className="w-4 h-4" />View
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selected && (
        <CounselorDrawer counselor={selected} stats={stats[idOf(selected)]}
          students={studentsByCounselor[idOf(selected)] || []} appsByStudent={appsByStudent}
          onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

/** Students or applications behind a summary tile, listed on the page with their own search and filters. */
function RecordsPanel({ panel, students, applications, counselors, appsByStudent, onClose, onOpenCounselor }: {
  panel: Panel; students: any[]; applications: any[]; counselors: any[]; appsByStudent: Record<string, any[]>;
  onClose: () => void; onOpenCounselor: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => { setQ(''); setStatus(''); }, [panel]);

  const counselorName = useMemo(() => Object.fromEntries(counselors.map(c => [idOf(c), c.name])), [counselors]);
  const counselorOfStudent = useMemo(() => Object.fromEntries(students.map(s => [idOf(s), idOf(s.counselorId)])), [students]);
  const match = (...vals: any[]) => !q || vals.some(v => String(v || '').toLowerCase().includes(q.toLowerCase()));

  const isStudentPanel = panel === 'assigned' || panel === 'unassigned';
  const studentRows = isStudentPanel
    ? students
        .filter(s => (panel === 'assigned' ? !!idOf(s.counselorId) : !idOf(s.counselorId)))
        .filter(s => match(s.name, s.email, s.phone, s.nationality, counselorName[idOf(s.counselorId)]))
    : [];
  const appRows = !isStudentPanel
    ? applications
        .filter(a => panel === 'applications' || OFFER_STATUSES.includes(a.status))
        .filter(a => !status || a.status === status)
        .filter(a => match(a.studentName, a.universityName, a.courseName, a.intake, counselorName[counselorOfStudent[idOf(a.studentId)]]))
    : [];
  const statusOptions = panel === 'offers' ? OFFER_STATUSES : STATUS_ORDER;
  const count = isStudentPanel ? studentRows.length : appRows.length;

  // Counselor name opens their details drawer
  const counselorCell = (cid: string) => (cid && counselorName[cid] ? (
    <button type="button" onClick={() => onOpenCounselor(cid)} className="text-sm text-teal-700 hover:text-orange-600 hover:underline text-left">
      {counselorName[cid]}
    </button>
  ) : <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Unassigned</span>);

  return (
    <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100 bg-orange-50/50">
        <h2 className="font-semibold text-gray-900 flex-1">{PANEL_TITLE[panel]} <span className="text-gray-400 font-normal">({count})</span></h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search this list"
            placeholder={isStudentPanel ? 'Search students' : 'Search student, university, course'}
            className="pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm w-56 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>
        {!isStudentPanel && (
          <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"
            className="py-1.5 pl-2 pr-6 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white">
            <option value="">Any status</option>
            {statusOptions.map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}
          </select>
        )}
        <button type="button" onClick={onClose} aria-label="Close list" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-[28rem] overflow-y-auto">
        {count === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            {q || status ? 'Nothing matches.' : panel === 'unassigned' ? 'Every student has a counselor.' : 'Nothing here yet.'}
          </p>
        ) : isStudentPanel ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide text-left sticky top-0">
              <tr>
                <th className="font-semibold px-5 py-2">Student</th>
                <th className="font-semibold px-3 py-2 hidden md:table-cell">Nationality</th>
                <th className="font-semibold px-3 py-2">Counselor</th>
                <th className="font-semibold px-3 py-2 text-center">Applications</th>
                <th className="font-semibold px-3 py-2 hidden md:table-cell">Latest status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {studentRows.map(s => {
                const apps = appsByStudent[idOf(s)] || [];
                const latest = apps[apps.length - 1];
                return (
                  <tr key={idOf(s)} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.email || s.phone || '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 hidden md:table-cell">{s.nationality || '—'}</td>
                    <td className="px-3 py-2.5">{counselorCell(idOf(s.counselorId))}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-gray-800">{apps.length}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell">{latest ? <AppBadge status={latest.status} /> : <span className="text-xs text-gray-400">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide text-left sticky top-0">
              <tr>
                <th className="font-semibold px-5 py-2">Student</th>
                <th className="font-semibold px-3 py-2">University &amp; course</th>
                <th className="font-semibold px-3 py-2 hidden md:table-cell">Counselor</th>
                <th className="font-semibold px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {appRows.map((a, i) => (
                <tr key={idOf(a) || i} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium text-gray-900">{a.studentName}</td>
                  <td className="px-3 py-2.5">
                    <p className="text-gray-800">{a.universityName}</p>
                    <p className="text-xs text-gray-400">{[a.courseName, a.intake].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">{counselorCell(counselorOfStudent[idOf(a.studentId)])}</td>
                  <td className="px-3 py-2.5"><AppBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Slide-over with one counselor's details, pipeline and assigned students. */
function CounselorDrawer({ counselor: c, stats: st, students, appsByStudent, onClose }: {
  counselor: any; stats?: { students: number; apps: number; offers: number; byStatus: Record<string, number> };
  students: any[]; appsByStudent: Record<string, any[]>; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = students.filter(s => {
    const apps = appsByStudent[idOf(s)] || [];
    if (q && ![s.name, s.email, s.phone].some(v => v?.toLowerCase().includes(q.toLowerCase()))) return false;
    if (status === 'none') return apps.length === 0;
    if (status && !apps.some(a => a.status === status)) return false;
    return true;
  });

  const details: [any, string, string | undefined][] = [
    [Mail, 'Email', c.email],
    [Phone, 'Phone', c.phone],
    [Briefcase, 'Experience', c.experience ? `${c.experience} years` : undefined],
    [Languages, 'Languages', (c.languages || []).join(', ') || undefined],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="counselor-drawer-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-gray-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {c.name?.[0]?.toUpperCase()}
            <PresenceDot userId={idOf(c)} size="md" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="counselor-drawer-title" className="text-lg font-bold text-gray-900 truncate">{c.name}</h2>
            <p className="text-xs text-gray-500 truncate">{c.title || c.email}</p>
            <PresenceLabel userId={idOf(c)} />
          </div>
          <Link to={`/appteam/chat?counselorId=${idOf(c)}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600">
            <MessageSquare className="w-4 h-4" />Message
          </Link>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Numbers + pipeline */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              {[['Students', st?.students || 0, 'text-blue-600'], ['Applications', st?.apps || 0, 'text-orange-500'], ['Offers', st?.offers || 0, 'text-purple-600']].map(([l, v, cls]) => (
                <div key={l as string}>
                  <p className={`text-2xl font-bold ${cls}`}>{v}</p>
                  <p className="text-xs text-gray-500">{l}</p>
                </div>
              ))}
            </div>
            <PipelineBar counts={st?.byStatus || {}} total={st?.apps || 0} />
            {!!st?.apps && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                {STATUS_ORDER.filter(s => st.byStatus[s]).map(s => (
                  <span key={s} className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${STATUSES[s].dot}`} />{STATUSES[s].label} <b className="text-gray-900">{st.byStatus[s]}</b>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><UserCog className="w-4 h-4 text-orange-500" />Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {details.filter(([, , v]) => v).map(([Icon, label, value]) => (
                <div key={label} className="flex items-start gap-3 min-w-0">
                  <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
                    {label === 'Email' ? <a href={`mailto:${value}`} className="text-sm font-medium text-gray-800 hover:text-orange-600 break-all">{value}</a>
                      : label === 'Phone' ? <a href={`tel:${value}`} className="text-sm font-medium text-gray-800 hover:text-orange-600">{value}</a>
                      : <p className="text-sm font-medium text-gray-800">{value}</p>}
                  </div>
                </div>
              ))}
            </div>
            {(c.specialization || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {c.specialization.map((s: string) => <span key={s} className="text-xs font-medium bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{s}</span>)}
              </div>
            )}
            {c.bio && <p className="text-sm text-gray-600 mt-4 whitespace-pre-line">{c.bio}</p>}
          </div>

          {/* Students */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 flex-1"><Users className="w-4 h-4 text-orange-500" />Assigned students ({students.length})</h3>
              {students.length > 0 && (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search students" aria-label="Search students"
                      className="pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs w-40 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by application status"
                    className="py-1.5 pl-2 pr-6 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white">
                    <option value="">Any application status</option>
                    {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}
                    <option value="none">No applications yet</option>
                  </select>
                </>
              )}
            </div>
            {students.length === 0 ? (
              <p className="text-sm text-gray-400">No students assigned to this counselor yet.</p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-gray-400">No students match.</p>
            ) : (
              <div className="space-y-3">
                {shown.map(s => {
                  const apps = appsByStudent[idOf(s)] || [];
                  return (
                    <div key={idOf(s)} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {s.name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                          <p className="text-xs text-gray-400 truncate">{s.email || s.phone}</p>
                        </div>
                        {s.nationality && <span className="text-xs text-gray-400">{s.nationality}</span>}
                        <span className="text-xs font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">{apps.length} apps</span>
                      </div>
                      {apps.length > 0 && (
                        <div className="space-y-1.5 mt-3">
                          {apps.map((app: any) => (
                            <div key={idOf(app)} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-800 truncate">{app.universityName}</p>
                                <p className="text-[10px] text-gray-400 truncate">{[app.courseName, app.intake].filter(Boolean).join(' · ')}</p>
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
    </div>
  );
}
