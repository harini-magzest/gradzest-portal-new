import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Routes, Route, Link, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Search, X, Download, FileText, BookOpen, Phone, UserCog, Users, MessageSquare,
  CheckCircle, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Activity, UserX, Layers, AlertTriangle, Eye, Pencil,
} from 'lucide-react';
import { api } from '../../api';
import StatusBadge from '../../components/StatusBadge';
import DocPreviewModal from '../../components/DocPreviewModal';
import LeadStageSelect, { LEAD_STAGES, leadStageOf } from '../../components/LeadStageSelect';
import { RecordTab, StudentRecordPanel, useStudentRecord } from '../../components/StudentRecord';
import RecordNavArrows from '../../components/RecordNavArrows';
import StudentEditForm, { StudentProfileFields } from '../../components/StudentEditForm';
import { useToast } from '../../context/ToastContext';
import { exportRowsToCsv } from '../../utils/exportCsv';
import { downloadStudentProfilePdf } from '../../utils/studentProfilePdf';
import SignedFileLink from '../../components/SignedFileLink';

const APP_STATUSES: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft:          { label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100',   dot: 'bg-gray-400' },
  submitted:      { label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-100',   dot: 'bg-blue-500' },
  under_review:   { label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-100',  dot: 'bg-amber-500' },
  offer_received: { label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-100', dot: 'bg-purple-500' },
  accepted:       { label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-100',  dot: 'bg-green-500' },
  rejected:       { label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-100',    dot: 'bg-red-500' },
  enrolled:       { label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-100', dot: 'bg-indigo-500' },
};

const STUDENT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const normalId = (obj: any): string => String(obj?._id || obj?.id || '');
const counselorIdOf = (s: any): string => String(s?.counselorId?._id || s?.counselorId || '');

function AppBadge({ status }: { status: string }) {
  const s = APP_STATUSES[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export default function AppTeamStudents() {
  return (
    <Routes>
      <Route index element={<StudentsList />} />
      <Route path=":studentId" element={<StudentDetail />} />
    </Routes>
  );
}

// ── Students list ────────────────────────────────────────────────────────────
function StudentsList() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [showNewLead, setShowNewLead] = useState(false);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterCounselorId, setFilterCounselorId] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterApps, setFilterApps] = useState(false);
  const [page, setPage] = useState(1);
  const tableRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(25);

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [s, c, a] = await Promise.all([api.admin.students(), api.admin.counselors(), api.admin.applications()]);
      setStudents(s); setCounselors(c); setApplications(a);
    } catch (err: any) { setLoadError(err.message || 'Failed to load students.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [search, filterStatus, filterStage, filterCountry, filterCounselorId, filterDateStart, filterDateEnd, filterApps]);

  const counselorNameById = useMemo(() => Object.fromEntries(counselors.map(c => [normalId(c), c.name])), [counselors]);
  const appsByStudent = useMemo(() => {
    const m: Record<string, any[]> = {};
    applications.forEach(a => { (m[String(a.studentId)] ||= []).push(a); });
    return m;
  }, [applications]);
  const countryOptions = Array.from(new Set(students.flatMap(s => s.preferredCountries || []).filter(Boolean))).sort() as string[];

  // Throws on failure so the stage picker can show the error
  const saveStage = async (id: string, leadStage: string) => {
    const updated = await api.students.setLeadStage(id, leadStage);
    setStudents(prev => prev.map(s => normalId(s) === id ? { ...s, leadStage: updated.leadStage } : s));
  };

  const filtered = students.filter(s => {
    if (filterStatus && (s.status === 'inactive' ? 'inactive' : 'active') !== filterStatus) return false;
    if (filterStage && leadStageOf(s).value !== filterStage) return false;
    if (filterApps && !appsByStudent[normalId(s)]?.length) return false;
    if (filterCountry && !(s.preferredCountries || []).includes(filterCountry)) return false;
    if (filterCounselorId) {
      if (filterCounselorId === '__unassigned__') { if (counselorIdOf(s)) return false; }
      else if (counselorIdOf(s) !== filterCounselorId) return false;
    }
    const jd = (s.joinedDate || '').slice(0, 10);
    if (filterDateStart && jd < filterDateStart) return false;
    if (filterDateEnd && jd > filterDateEnd) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![s.name, s.email, s.phone, s.nationality].some(v => v?.toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.joinedDate || b.createdAt || 0).getTime() - new Date(a.joinedDate || a.createdAt || 0).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Open the full student page; pass the filtered order so ‹ › can step through it
  const openStudent = (id: string, tab?: string) =>
    navigate(`/appteam/students/${id}${tab ? `?tab=${tab}` : ''}`, { state: { ids: filtered.map(normalId) } });

  const counts = {
    total: students.length,
    active: students.filter(s => s.status !== 'inactive').length,
    inactive: students.filter(s => s.status === 'inactive').length,
    withApps: students.filter(s => appsByStudent[normalId(s)]?.length).length,
    unassigned: students.filter(s => !counselorIdOf(s)).length,
  };
  const pct = (n: number) => counts.total > 0 ? `${Math.round((n / counts.total) * 100)}%` : '0%';

  const handleExport = () => {
    exportRowsToCsv('students.csv', filtered.map(s => ({
      Name: s.name || '', Email: s.email || '', Phone: s.phone || '', Nationality: s.nationality || '',
      Status: s.status || '', 'Lead Stage': leadStageOf(s).label, Counselor: counselorNameById[counselorIdOf(s)] || 'Unassigned',
      Applications: String(appsByStudent[normalId(s)]?.length || 0), 'Joined Date': s.joinedDate || '',
    })));
  };

  const activeTags: { label: string; clear: () => void }[] = [];
  if (filterStatus) activeTags.push({ label: STUDENT_STATUSES.find(s => s.value === filterStatus)?.label || filterStatus, clear: () => setFilterStatus('') });
  if (filterStage) activeTags.push({ label: `Stage: ${leadStageOf({ leadStage: filterStage }).label}`, clear: () => setFilterStage('') });
  if (filterCountry) activeTags.push({ label: filterCountry, clear: () => setFilterCountry('') });
  if (filterCounselorId) activeTags.push({ label: `Counselor: ${filterCounselorId === '__unassigned__' ? 'Unassigned' : counselorNameById[filterCounselorId] || ''}`, clear: () => setFilterCounselorId('') });
  if (filterDateStart || filterDateEnd) activeTags.push({ label: `Joined ${filterDateStart || '…'} – ${filterDateEnd || '…'}`, clear: () => { setFilterDateStart(''); setFilterDateEnd(''); } });
  if (filterApps) activeTags.push({ label: 'With applications', clear: () => setFilterApps(false) });
  if (search) activeTags.push({ label: `"${search}"`, clear: () => { setSearch(''); setSearchInput(''); } });
  const clearAll = () => { setFilterStatus(''); setFilterStage(''); setFilterCountry(''); setFilterCounselorId(''); setFilterDateStart(''); setFilterDateEnd(''); setFilterApps(false); setSearch(''); setSearchInput(''); };

  // Stat cards filter the table below; clicking the active card again clears it
  type Card = 'total' | 'active' | 'inactive' | 'withApps' | 'unassigned';
  const activeCard: Card | null =
    !activeTags.length ? 'total'
    : activeTags.length === 1 && filterStatus === 'active' ? 'active'
    : activeTags.length === 1 && filterStatus === 'inactive' ? 'inactive'
    : activeTags.length === 1 && filterApps ? 'withApps'
    : activeTags.length === 1 && filterCounselorId === '__unassigned__' ? 'unassigned'
    : null;
  const pickCard = (card: Card) => {
    const turningOff = activeCard === card;
    clearAll();
    if (!turningOff) {
      if (card === 'active' || card === 'inactive') setFilterStatus(card);
      if (card === 'withApps') setFilterApps(true);
      if (card === 'unassigned') setFilterCounselorId('__unassigned__');
    }
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  // Paginator: 1 2 3 … last
  const pageNums: (number | '...')[] = (() => {
    if (totalPages <= 6) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const nums: (number | '...')[] = [1, 2, 3];
    if (page > 4) nums.push('...');
    if (page > 3 && page < totalPages - 1) nums.push(page);
    nums.push('...', totalPages);
    return nums;
  })();

  const avatarPalette = ['from-orange-500 to-amber-600', 'from-blue-500 to-indigo-600', 'from-green-500 to-emerald-600', 'from-purple-500 to-pink-600', 'from-cyan-500 to-blue-600', 'from-rose-500 to-red-600'];
  const dSel = 'appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent cursor-pointer';
  const dInput = 'px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent';

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-orange-100 text-xs font-medium uppercase tracking-wide">Application Team</p>
              <h1 className="text-2xl font-bold leading-tight">Students</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors">
              <Download className="w-4 h-4" />Export CSV
            </button>
            <button type="button" onClick={loadData} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
            </button>
            <button type="button" onClick={() => setShowNewLead(true)} title="Add a lead from a phone call — only a name and mobile number are needed"
              className="flex items-center gap-2 px-3 py-2 bg-white text-orange-700 rounded-xl text-sm font-bold hover:bg-orange-50 transition-colors shadow-sm">
              <Phone className="w-4 h-4" />New Lead
            </button>
            {showNewLead && (
              <StudentEditForm basePath="/appteam/students" onClose={() => setShowNewLead(false)}
                onSaved={s => { setStudents(prev => [s, ...prev]); setShowNewLead(false); navigate(`/appteam/students/${normalId(s)}`); }} />
            )}
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {loadError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-5">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1"><p className="text-sm font-semibold text-red-800">Failed to load students</p><p className="text-xs text-red-600 mt-0.5">{loadError}</p></div>
          <button type="button" onClick={loadData} className="text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors">Retry</button>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {([
          { key: 'total', label: 'Total', value: counts.total, note: 'All students', hint: 'Show all students', icon: <Users className="w-5 h-5 text-orange-600" /> },
          { key: 'active', label: 'Active', value: counts.active, note: pct(counts.active), hint: 'Show active students', icon: <Activity className="w-5 h-5 text-orange-600" /> },
          { key: 'inactive', label: 'Inactive', value: counts.inactive, note: pct(counts.inactive), hint: 'Show inactive students', icon: <UserX className="w-5 h-5 text-orange-500" /> },
          { key: 'withApps', label: 'With Applications', value: counts.withApps, note: pct(counts.withApps), hint: 'Show students who have applications', icon: <Layers className="w-5 h-5 text-orange-600" /> },
          { key: 'unassigned', label: 'Unassigned', value: counts.unassigned, note: counts.unassigned > 0 ? 'No counselor yet' : 'All assigned', hint: 'Show students without a counselor', icon: <UserCog className="w-5 h-5 text-orange-600" /> },
        ] as const).map(card => {
          const on = activeCard === card.key;
          return (
            <button type="button" key={card.key} onClick={() => pickCard(card.key)} aria-pressed={on} title={on && card.key !== 'total' ? 'Click again to show all students' : card.hint}
              className={`text-left bg-white rounded-2xl p-4 border shadow-sm flex items-start gap-3 hover:border-orange-300 hover:shadow-md transition-all ${
                on ? 'border-orange-500 ring-2 ring-orange-100' : 'border-orange-100'}`}>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${on ? 'bg-orange-500 [&>svg]:text-white' : 'bg-orange-100'}`}>{card.icon}</div>
              <div className="min-w-0">
                <p className="text-gray-500 text-xs mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">{loading ? '…' : card.value.toLocaleString()}</p>
                <p className="text-xs mt-1 text-orange-600">{loading ? '' : card.note}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} title="Joined from" className={dInput} />
            <span className="text-gray-400 text-sm font-medium">–</span>
            <input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} title="Joined to" className={dInput} />
          </div>
          <div className="relative">
            <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} title="Country" className={dSel}>
              <option value="">Country</option>
              {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)} title="Lead stage" className={dSel}>
              <option value="">Lead Stage</option>
              {LEAD_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} title="Status" className={dSel}>
              <option value="">Status</option>
              {STUDENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={filterCounselorId} onChange={e => setFilterCounselorId(e.target.value)} title="Counselor" className={dSel}>
              <option value="">Counselor</option>
              <option value="__unassigned__">Unassigned</option>
              {counselors.map(c => <option key={normalId(c)} value={normalId(c)}>{c.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setSearch(searchInput); }}
              placeholder="Search by name, email, phone..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent" />
          </div>
          <button type="button" onClick={() => setSearch(searchInput)}
            className="px-5 py-2 bg-orange-500 text-white hover:bg-orange-600 rounded-xl text-sm font-semibold transition-colors shadow-sm">
            Search
          </button>
          {activeTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-500 text-xs">Active filters:</span>
              {activeTags.map(tag => (
                <span key={tag.label} className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-full text-xs font-medium">
                  {tag.label}
                  <button type="button" onClick={tag.clear} aria-label={`Clear ${tag.label}`} className="hover:text-orange-900 leading-none"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <button type="button" onClick={clearAll} className="text-xs text-orange-700 hover:text-orange-900 underline">Clear all</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div ref={tableRef} className="scroll-mt-4" />
      {loading && students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex items-center justify-center gap-3 text-gray-400">
          <span className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /><span className="text-sm">Loading students…</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['STUDENT', 'JOINED', 'EMAIL', 'PHONE', 'ASSIGNED TO', 'APPS', 'LEAD STAGE', 'STATUS', 'ACTIONS'].map(h => (
                    <th key={h} className={`px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${h === 'ACTIONS' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-16">
                    <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-500">{activeTags.length ? 'No students match your filters.' : 'No students yet.'}</p>
                  </td></tr>
                ) : paginated.map((s: any, idx: number) => {
                  const id = normalId(s);
                  const words = (s.name || '').trim().split(' ');
                  const initials = words.length >= 2 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : (s.name?.slice(0, 2) || '??').toUpperCase();
                  const apps = appsByStudent[id] || [];
                  const counselorName = counselorNameById[counselorIdOf(s)];
                  return (
                    <tr key={id} className="border-b border-gray-50 hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => openStudent(id)} aria-label={`Open ${s.name}'s profile`}
                            className={`w-9 h-9 bg-gradient-to-br ${avatarPalette[idx % avatarPalette.length]} rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>{initials}</button>
                          <div className="min-w-0">
                            <button type="button" onClick={() => openStudent(id)} title="Open profile"
                              className="text-sm font-semibold text-gray-900 truncate hover:text-orange-700 hover:underline text-left">{s.name}</button>
                            <p className="text-xs text-orange-600 truncate">{s.email}</p>
                            {apps.some(a => a.status === 'offer_received') && (
                              <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-sky-50 px-2 py-0.5 rounded-md mt-1">
                                <CheckCircle className="w-3 h-3" /> Offer received
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.joinedDate || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-orange-600 whitespace-nowrap max-w-[160px] truncate">{s.email || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.phone || '—'}</td>
                      <td className="px-4 py-3.5 text-sm whitespace-nowrap">
                        {counselorName ? <span className="text-gray-700">{counselorName}</span> : <span className="text-gray-400">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">{apps.length}</td>
                      <td className="px-4 py-3.5"><LeadStageSelect value={s.leadStage} onSave={stage => saveStage(id, stage)} /></td>
                      <td className="px-4 py-3.5"><StatusBadge status={s.status === 'inactive' ? 'inactive' : 'active'} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button type="button" onClick={() => openStudent(id, 'messages')} title={`Messages with ${s.name}`} aria-label={`Messages with ${s.name}`}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-sky-50 border border-sky-200 text-sky-600 hover:bg-sky-100 transition-colors">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          {s.phone ? (
                            <a href={`tel:${s.phone.replace(/\s/g, '')}`} title={`Call ${s.phone}`}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 border border-green-200 text-green-600 hover:bg-green-100 transition-colors">
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <span title="No phone number" aria-label="No phone number"
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200 text-gray-300 cursor-not-allowed">
                              <Phone className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50/40 flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Show</span>
              <div className="relative">
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} title="Entries per page"
                  className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer">
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <span>entries</span>
              <span className="hidden sm:inline text-gray-300 mx-1">·</span>
              <span className="hidden sm:inline text-gray-400 text-xs">
                Showing {filtered.length === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)}`} of {filtered.length.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {pageNums.map((p, i) =>
                p === '...' ? (
                  <span key={`d${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm select-none">…</span>
                ) : (
                  <button key={p} type="button" onClick={() => setPage(p)} aria-current={page === p ? 'page' : undefined}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${page === p ? 'bg-orange-500 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                    {p}
                  </button>
                )
              )}
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} aria-label="Next page"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Student page (/appteam/students/:studentId) ──────────────────────────────
function InfoRow({ label, value }: { label: string; value?: any }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex gap-3 py-1.5">
      <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
      <span className={`text-xs flex-1 min-w-0 break-words ${empty ? 'text-gray-300' : 'text-gray-800 font-medium'}`}>{empty ? '—' : String(value)}</span>
    </div>
  );
}

type DetailTab = 'overview' | 'applications' | RecordTab;
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'notes', label: 'Notes' },
  { key: 'messages', label: 'Messages' },
  { key: 'activities', label: 'Activities' },
  { key: 'emails', label: 'Emails' },
  { key: 'pipelines', label: 'Pipelines' },
  { key: 'files', label: 'Files' },
  { key: 'applications', label: 'Applications' },
];

function StudentDetail() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') as DetailTab | null;
  const [tab, setTab] = useState<DetailTab>(initialTab && DETAIL_TABS.some(t => t.key === initialTab) ? initialTab : 'overview');
  useEffect(() => { if (initialTab && DETAIL_TABS.some(t => t.key === initialTab)) setTab(initialTab); }, [initialTab]);
  const [student, setStudent] = useState<any>(null);
  const [error, setError] = useState('');
  const [apps, setApps] = useState<any[]>([]);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const { record, loading: recordLoading, error: recordError, reload: reloadRecord } = useStudentRecord(studentId);

  // Reload whenever the student changes (incl. via the ‹ › arrows)
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setStudent(null); setError(''); setApps([]); setEditing(false);
    api.students.get(studentId)
      .then(s => { if (!cancelled) setStudent(s); })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load this student.'); });
    api.admin.applications()
      .then(all => { if (!cancelled) setApps(all.filter((a: any) => String(a.studentId) === studentId)); })
      .catch(() => { if (!cancelled) toast.error('Failed to load applications.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const goBack = () => { if (location.key !== 'default') navigate(-1); else navigate('/appteam/students'); };

  const header = (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={goBack} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      {studentId && <RecordNavArrows currentId={studentId} basePath="/appteam/students" />}
    </div>
  );

  if (error) return (
    <div className="space-y-5">
      {header}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-sm font-semibold text-red-800">Failed to load student</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
    </div>
  );
  if (!student) return (
    <div className="space-y-5">
      {header}
      <div className="text-center py-12"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
    </div>
  );

  const sortedApps = [...apps].sort((a: any, b: any) =>
    new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime() - new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime());
  const docs = student.documents || [];
  const nameWords = (student.name || '').trim().split(' ');
  const initials = nameWords.length >= 2 ? (nameWords[0][0] + nameWords[nameWords.length - 1][0]).toUpperCase() : (student.name?.slice(0, 2) || '??').toUpperCase();

  const docList = (
    docs.length === 0 ? <p className="text-sm text-gray-400">No documents uploaded</p> : (
      <div className="space-y-2">
        {docs.map((doc: any) => (
          <div key={doc._id || doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-orange-500" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
              <p className="text-xs text-gray-400">{doc.type}{doc.uploadedDate ? ` · ${doc.uploadedDate}` : ''}</p>
            </div>
            <StatusBadge status={doc.status} />
            {doc.url ? (
              <>
                <button type="button" onClick={() => setPreviewDoc({ url: doc.url, name: doc.name })}
                  className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                  <Eye className="w-3 h-3" /> Preview
                </button>
                <SignedFileLink href={doc.url} download target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors">
                  <Download className="w-3 h-3" /> Download
                </SignedFileLink>
              </>
            ) : <span className="text-xs text-gray-300 italic">No file</span>}
          </div>
        ))}
      </div>
    )
  );

  const appList = (
    sortedApps.length === 0 ? <p className="text-sm text-gray-400">No applications yet</p> : (
      <div className="space-y-2">
        {sortedApps.map((app: any) => (
          <div key={app._id || app.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{app.universityName}</p>
              <p className="text-xs text-gray-500 truncate">{app.courseName}{app.intake ? ` · ${app.intake}` : ''}</p>
            </div>
            <AppBadge status={app.status} />
          </div>
        ))}
      </div>
    )
  );

  return (
    <>
    <div className="space-y-5">
      {header}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* ── Left: student details ── */}
        <aside className="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-orange-500 to-amber-600 p-5">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 border border-white/30 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0">{initials}</div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white truncate" title={student.name}>{student.name}</h2>
                <p className="flex items-center gap-1 text-xs text-orange-100 mt-0.5 min-w-0" title="Assigned counselor">
                  <UserCog className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{student.counselorName || 'Unassigned'}</span>
                </p>
                <div className="mt-1"><StatusBadge status={student.status === 'inactive' ? 'inactive' : 'active'} /></div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs font-medium text-orange-100">Lead Stage</span>
              <LeadStageSelect value={student.leadStage}
                onSave={async stage => { const u = await api.students.setLeadStage(studentId!, stage); setStudent((p: any) => ({ ...p, leadStage: u.leadStage })); }} />
            </div>
          </div>
          <div className="p-4 border-b border-gray-100 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEditing(true)} disabled={editing}
              className="disabled:opacity-50 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-all">
              <Pencil className="w-4 h-4" />Edit
            </button>
            <Link to="/appteam/chat" className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-sm transition-all">
              <MessageSquare className="w-4 h-4" />Chat
            </Link>
            <button type="button" onClick={() => downloadStudentProfilePdf({ ...student, applications: apps }, { counselorName: student.counselorName || undefined })}
              className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-all">
              <Download className="w-4 h-4" />Download Profile PDF
            </button>
          </div>

          {editing ? (
            <StudentEditForm inline student={student} basePath="/appteam/students" onClose={() => setEditing(false)}
              onSaved={u => { setStudent((p: any) => ({ ...p, ...u })); setEditing(false); }} />
          ) : (<>
          <StudentProfileFields student={student} />

          <div className="p-5 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Academic Profile</p>
            <InfoRow label="Education" value={student.educationLevel} />
            <InfoRow label="GPA" value={student.gpa !== undefined && student.gpa !== null && student.gpa !== '' ? `${student.gpa}/10` : ''} />
            <InfoRow label="Budget" value={student.budget ? `$${Number(student.budget).toLocaleString()}/yr` : ''} />
          </div>

          <div className="p-5">
            <InfoRow label="Joined" value={student.joinedDate} />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="bg-gray-50 border border-gray-100 rounded-xl py-2 text-center"><p className="text-lg font-bold text-gray-900">{sortedApps.length}</p><p className="text-[11px] text-gray-500">Applications</p></div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl py-2 text-center"><p className="text-lg font-bold text-gray-900">{docs.length}</p><p className="text-[11px] text-gray-500">Documents</p></div>
            </div>
          </div>
          </>)}
        </aside>

        {/* ── Right: tabs ── */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          <div className="flex bg-white rounded-2xl border border-gray-100 shadow-sm px-4 overflow-x-auto">
            {DETAIL_TABS.map(t => (
              <button type="button" key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Layers className="w-4 h-4 text-orange-500" />Application Summary</h3>
                {appList}
              </div>
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-orange-500" />Documents</h3>
                {docList}
              </div>
            </div>
          )}

          {tab === 'applications' && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Layers className="w-4 h-4 text-orange-500" />Applications ({sortedApps.length})</h3>
              {appList}
            </div>
          )}

          {tab !== 'overview' && tab !== 'applications' && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              {tab === 'files' ? (
                <>
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><BookOpen className="w-4 h-4 text-orange-500" />Files ({docs.length})</h3>
                  {docList}
                </>
              ) : (
                <StudentRecordPanel tab={tab} student={student} record={record} reload={reloadRecord}
                  loading={recordLoading} error={recordError} canEdit canReply={false}
                  onStudentChange={u => setStudent((p: any) => ({ ...p, ...u }))} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    {previewDoc && (
      <DocPreviewModal url={previewDoc.url} fileName={previewDoc.name} onClose={() => setPreviewDoc(null)} />
    )}
    </>
  );
}
