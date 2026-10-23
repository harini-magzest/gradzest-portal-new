import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, Search, X, RefreshCw, AlertTriangle, Download,
  BookOpen, Award, Clock, Edit2, Send, CheckCircle, XCircle,
  Phone, MapPin, DollarSign, GraduationCap, Layers, LayoutList,
  Globe, UserCog, Mail, Users, CalendarDays,
} from 'lucide-react';
import { api } from '../../api';
import StatusBadge from '../../components/StatusBadge';
import { usePortalName } from '../../hooks/usePortalName';
import SignedFileLink from '../../components/SignedFileLink';

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const APP_STATUSES = [
  { value: 'draft',          label: 'Draft',          icon: <Edit2    className="w-3.5 h-3.5" /> },
  { value: 'submitted',      label: 'Submitted',      icon: <Send     className="w-3.5 h-3.5" /> },
  { value: 'under_review',   label: 'Under Review',   icon: <Clock    className="w-3.5 h-3.5" /> },
  { value: 'offer_received', label: 'Offer Received', icon: <Award    className="w-3.5 h-3.5" /> },
  { value: 'accepted',       label: 'Accepted',       icon: <CheckCircle className="w-3.5 h-3.5" /> },
  { value: 'rejected',       label: 'Rejected',       icon: <XCircle  className="w-3.5 h-3.5" /> },
  { value: 'enrolled',       label: 'Enrolled',       icon: <BookOpen className="w-3.5 h-3.5" /> },
];

const COL_HEADER: Record<string, string> = {
  draft:          'bg-gray-100 text-gray-700 border-gray-200',
  submitted:      'bg-blue-100 text-blue-700 border-blue-200',
  under_review:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  offer_received: 'bg-green-100 text-green-700 border-green-200',
  accepted:       'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected:       'bg-red-100 text-red-700 border-red-200',
  enrolled:       'bg-purple-100 text-purple-700 border-purple-200',
};

const CARD_BG: Record<string, string> = {
  draft:          'border-gray-200 bg-gray-50/60',
  submitted:      'border-blue-200 bg-blue-50/60',
  under_review:   'border-yellow-200 bg-yellow-50/60',
  offer_received: 'border-green-200 bg-green-50/60',
  accepted:       'border-emerald-200 bg-emerald-50/60',
  rejected:       'border-red-200 bg-red-50/60',
  enrolled:       'border-purple-200 bg-purple-50/60',
};

const STATUS_BTN: Record<string, string> = {
  draft:          'bg-gray-100 text-gray-600 border-gray-200',
  submitted:      'bg-blue-100 text-blue-700 border-blue-200',
  under_review:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  offer_received: 'bg-green-100 text-green-700 border-green-200',
  accepted:       'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected:       'bg-red-100 text-red-700 border-red-200',
  enrolled:       'bg-purple-100 text-purple-700 border-purple-200',
};

const DOC_STATUS_COLOR: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-700',
  pending:  'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
};

/* ─── Tiny helpers ──────────────────────────────────────────────────────────── */

function Spinner({ size = 4, white = false }: { size?: number; white?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full border-2 animate-spin
        ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-violet-600'}
        ${size === 3 ? 'w-3 h-3' : size === 4 ? 'w-4 h-4' : size === 5 ? 'w-5 h-5' : 'w-6 h-6'}`}
    />
  );
}

function Avi({ name, size = 'md', teal = false }: { name: string; size?: 'sm' | 'md' | 'lg'; teal?: boolean }) {
  const sz = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-lg' };
  const grad = teal ? 'from-teal-500 to-emerald-600' : 'from-violet-500 to-indigo-600';
  return (
    <div className={`${sz[size]} bg-linear-to-br ${grad} rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-xs`}>
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
}

/* ─── Board card (kanban) ───────────────────────────────────────────────────── */

function BoardCard({ app, selected, onClick }: { app: any; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all duration-150
        ${selected
          ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200 shadow-md'
          : `${CARD_BG[app.status] || 'border-gray-200 bg-white'} hover:shadow-xs`}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Avi name={app.studentName} size="sm" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">{app.studentName}</p>
          <p className="text-[10px] text-gray-400 truncate">{app.studentNationality || app.studentEmail}</p>
        </div>
      </div>
      <p className="text-xs font-medium text-gray-800 truncate">{app.universityName}</p>
      <p className="text-[10px] text-gray-500 truncate mt-0.5">{app.courseName}</p>
      <div className="flex items-center justify-between mt-2">
        {app.intake && <span className="text-[10px] text-violet-600 font-medium">{app.intake}</span>}
        {app.submittedDate && <span className="text-[10px] text-gray-400">{app.submittedDate}</span>}
      </div>
    </button>
  );
}

/* ─── List row ──────────────────────────────────────────────────────────────── */

function ListRow({ app, selected, onClick }: { app: any; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-100 transition-all
        ${selected
          ? 'bg-violet-50 border-l-[3px] border-l-violet-500'
          : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}
    >
      <Avi name={app.studentName} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{app.studentName}</p>
        <p className="text-xs text-gray-500 truncate">{app.universityName} · {app.courseName}</p>
        {app.intake && <p className="text-[10px] text-violet-500 mt-0.5">{app.intake}</p>}
      </div>
      <StatusBadge status={app.status} />
    </button>
  );
}

/* ─── Detail panel ──────────────────────────────────────────────────────────── */

function DetailPanel({
  app, studentDetail, studentLoading, counselorMap,
  statusUpdate, notesUpdate, saving, saveError,
  onStatusChange, onNotesChange, onSave, onClose,
}: {
  app: any;
  studentDetail: any;
  studentLoading: boolean;
  counselorMap: Record<string, any>;
  statusUpdate: string;
  notesUpdate: string;
  saving: boolean;
  saveError: string;
  onStatusChange: (s: string) => void;
  onNotesChange: (s: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const counselor = studentDetail?.counselorId ? counselorMap[studentDetail.counselorId] : null;
  const documents: any[] = studentDetail?.documents || [];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 bg-gray-50/80 shrink-0">
        <div className="min-w-0 pr-3">
          <h2 className="text-sm font-bold text-gray-900 truncate">{app.studentName}</h2>
          <p className="text-xs text-gray-500 truncate">{app.universityName} · {app.courseName}</p>
        </div>
        <button aria-label="Close"
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-all shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">

        {/* ── Student ── */}
        <section className="px-5 py-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Student Profile</p>
          {studentLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm"><Spinner size={4} />Loading…</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Avi name={app.studentName} size="lg" />
                <div>
                  <p className="font-bold text-gray-900">{app.studentName}</p>
                  <p className="text-xs text-gray-500">{app.studentEmail}</p>
                  {app.studentNationality && (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                      <Globe className="w-3 h-3" />{app.studentNationality}
                    </span>
                  )}
                </div>
              </div>
              {studentDetail && (
                <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 rounded-xl p-3">
                  {studentDetail.phone && (
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <Phone className="w-3 h-3 text-gray-400 shrink-0" />{studentDetail.phone}
                    </span>
                  )}
                  {studentDetail.educationLevel && (
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <BookOpen className="w-3 h-3 text-gray-400 shrink-0" />{studentDetail.educationLevel}
                    </span>
                  )}
                  {studentDetail.gpa != null && (
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <Award className="w-3 h-3 text-gray-400 shrink-0" />GPA {studentDetail.gpa}
                    </span>
                  )}
                  {studentDetail.englishScore?.type && (
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <CheckCircle className="w-3 h-3 text-gray-400 shrink-0" />
                      {studentDetail.englishScore.type} {studentDetail.englishScore.score}
                    </span>
                  )}
                  {studentDetail.budget && (
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <DollarSign className="w-3 h-3 text-gray-400 shrink-0" />
                      Budget ${Number(studentDetail.budget).toLocaleString()}
                    </span>
                  )}
                  {studentDetail.preferredCountries?.length > 0 && (
                    <span className="flex items-center gap-1.5 text-gray-600 col-span-2">
                      <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                      {studentDetail.preferredCountries.join(' · ')}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Counselor ── */}
        <section className="px-5 py-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Assigned Counselor</p>
          {studentLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm"><Spinner size={4} />Loading…</div>
          ) : counselor ? (
            <div className="flex items-center gap-3 bg-teal-50 border border-teal-100 rounded-xl p-3">
              <Avi name={counselor.name} size="md" teal />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{counselor.name}</p>
                <p className="text-xs text-gray-500 truncate">{counselor.email}</p>
                {counselor.specialization?.length > 0 && (
                  <p className="text-xs text-teal-600 mt-0.5 truncate">
                    {counselor.specialization.slice(0, 2).join(', ')}
                    {counselor.specialization.length > 2 ? ` +${counselor.specialization.length - 2}` : ''}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <UserCog className="w-4 h-4" />
              <span className="italic">No counselor assigned</span>
            </div>
          )}
        </section>

        {/* ── Application Details ── */}
        <section className="px-5 py-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Application Details</p>
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <GraduationCap className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{app.universityName}</p>
                <p className="text-xs text-gray-500 truncate">{app.courseName}</p>
              </div>
            </div>
            {app.intake && (
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700">Intake: <span className="font-semibold">{app.intake}</span></span>
              </div>
            )}
            {app.submittedDate && (
              <div className="flex items-center gap-2.5">
                <Send className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700">Submitted: <span className="font-semibold">{app.submittedDate}</span></span>
              </div>
            )}
            {app.updatedDate && (
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700">Updated: <span className="font-semibold">{app.updatedDate}</span></span>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-700">Status:</span>
              <StatusBadge status={app.status} size="md" />
            </div>
            {app.notes && (
              <div className="mt-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-amber-700 mb-0.5">Notes</p>
                <p className="text-xs text-amber-800 leading-relaxed">{app.notes}</p>
              </div>
            )}
          </div>
        </section>

        {/* ── Update Processing Stage ── */}
        <section className="px-5 py-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Update Processing Stage</p>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {APP_STATUSES.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => onStatusChange(s.value)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all
                  ${statusUpdate === s.value
                    ? `${STATUS_BTN[s.value]} border-current shadow-xs ring-1 ring-offset-1 ring-current/30`
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                {s.icon}{s.label}
              </button>
            ))}
          </div>
          <textarea
            value={notesUpdate}
            onChange={e => onNotesChange(e.target.value)}
            rows={2}
            placeholder="Add processing notes…"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-violet-500 resize-none placeholder:text-gray-400 mb-2"
          />
          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200 mb-2">{saveError}</p>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-linear-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-60 shadow-xs"
          >
            {saving ? <><Spinner size={3} white />Saving…</> : 'Save Stage Update'}
          </button>
        </section>

        {/* ── Documents ── */}
        <section className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Documents</p>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{documents.length}</span>
          </div>
          {studentLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm"><Spinner size={4} />Loading…</div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div
                  key={doc._id || doc.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{doc.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {doc.type && <span className="text-[10px] text-gray-400">{doc.type}</span>}
                      {doc.uploadedDate && (
                        <span className="text-[10px] text-gray-400">· {doc.uploadedDate}</span>
                      )}
                      {doc.status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${DOC_STATUS_COLOR[doc.status] || 'bg-gray-100 text-gray-600'}`}>
                          {doc.status}
                        </span>
                      )}
                    </div>
                  </div>
                  {doc.url ? (
                    <SignedFileLink
                      href={doc.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-[10px] font-semibold transition-colors"
                      title={`Download ${doc.name}`}
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </SignedFileLink>
                  ) : (
                    <span className="shrink-0 text-[10px] text-gray-400 italic px-1">No file</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────────── */

export default function AdminApplicationBoard() {
  const { portal } = usePortalName();
  const [applications, setApplications]   = useState<any[]>([]);
  const [counselors, setCounselors]       = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState('');
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [viewMode, setViewMode]           = useState<'board' | 'list' | 'free-register'>('board');
  const [subscribers, setSubscribers]     = useState<any[]>([]);
  const [subSearch, setSubSearch]         = useState('');
  const [selectedApp, setSelectedApp]     = useState<any>(null);
  const [studentDetail, setStudentDetail] = useState<any>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [statusUpdate, setStatusUpdate]   = useState('');
  const [notesUpdate, setNotesUpdate]     = useState('');
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState('');

  const counselorMap = useMemo(() => {
    const map: Record<string, any> = {};
    counselors.forEach(c => { map[c._id || c.id] = c; });
    return map;
  }, [counselors]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [apps, couns, subs] = await Promise.all([
        api.admin.applications(),
        api.admin.counselors(),
        api.admin.subscribers(),
      ]);
      setApplications(apps);
      setCounselors(couns);
      setSubscribers(subs);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load data.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectApp = useCallback(async (app: any) => {
    setSelectedApp(app);
    setStatusUpdate(app.status);
    setNotesUpdate(app.notes || '');
    setSaveError('');
    setStudentDetail(null);
    if (app.studentId) {
      setStudentLoading(true);
      try {
        const student = await api.students.get(app.studentId);
        setStudentDetail(student);
      } catch { /* keep null */ }
      setStudentLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedApp(null);
    setStudentDetail(null);
  }, []);

  const handleSave = async () => {
    if (!selectedApp) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await api.admin.updateApplication(
        selectedApp.studentId,
        selectedApp._id || selectedApp.id,
        { status: statusUpdate, notes: notesUpdate },
      );
      const merge = (a: any) =>
        (a._id || a.id) === (updated._id || updated.id) && a.studentId === updated.studentId
          ? { ...a, ...updated } : a;
      setApplications(prev => prev.map(merge));
      setSelectedApp((prev: any) => (prev ? { ...prev, ...updated } : prev));
    } catch (e: any) {
      setSaveError(e.message || 'Failed to update.');
    }
    setSaving(false);
  };

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return applications.filter(a => {
      const matchSearch = !q
        || a.studentName?.toLowerCase().includes(q)
        || a.universityName?.toLowerCase().includes(q)
        || a.courseName?.toLowerCase().includes(q)
        || a.studentEmail?.toLowerCase().includes(q)
        || a.studentNationality?.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [applications, search, statusFilter]);

  // Stats
  const statCounts = useMemo(() =>
    APP_STATUSES.map(s => ({
      ...s,
      count: applications.filter(a => a.status === s.value).length,
    })), [applications]);

  const totalStudents = useMemo(
    () => new Set(applications.map(a => a.studentId)).size,
    [applications],
  );

  // Kanban columns
  const byStatus = useMemo(() => {
    const map: Record<string, any[]> = {};
    APP_STATUSES.forEach(s => { map[s.value] = []; });
    filtered.forEach(a => { if (map[a.status]) map[a.status].push(a); });
    return map;
  }, [filtered]);

  const isSelected = (app: any) =>
    !!selectedApp &&
    (selectedApp._id || selectedApp.id) === (app._id || app.id) &&
    selectedApp.studentId === app.studentId;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] -m-6">

      {/* ── Header / stats ── */}
      <div className="shrink-0 bg-linear-to-r from-[#3b0764] to-[#4c1d95] px-6 py-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-purple-200 text-xs font-medium uppercase tracking-wider">{portal}</p>
              <h1 className="text-2xl font-bold leading-tight">Application Board</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2">
          {/* Total */}
          <div className="rounded-xl p-3 bg-white/10 border border-white/20 text-center">
            <div className="text-xl font-bold">{loading ? '…' : applications.length}</div>
            <div className="text-[10px] text-white/70 mt-0.5">Total</div>
          </div>
          {/* Students */}
          <div className="rounded-xl p-3 bg-white/10 border border-white/20 text-center">
            <div className="text-xl font-bold">{loading ? '…' : totalStudents}</div>
            <div className="text-[10px] text-white/70 mt-0.5">Students</div>
          </div>
          {/* Free Registrations */}
          <button
            type="button"
            onClick={() => setViewMode('free-register')}
            className={`rounded-xl p-3 text-center transition-all border ${
              viewMode === 'free-register'
                ? 'bg-white/30 border-white/60 shadow-inner'
                : 'bg-white/10 border-white/20 hover:bg-white/20'
            }`}
          >
            <div className="text-xl font-bold">{loading ? '…' : subscribers.length}</div>
            <div className="text-[10px] text-white/70 mt-0.5 leading-tight">Free Reg.</div>
          </button>
          {/* Per-status */}
          {statCounts.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatusFilter(prev => prev === s.value ? 'all' : s.value)}
              className={`rounded-xl p-3 text-center transition-all border
                ${statusFilter === s.value
                  ? 'bg-white/30 border-white/60 shadow-inner'
                  : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
            >
              <div className="text-xl font-bold">{loading ? '…' : s.count}</div>
              <div className="text-[10px] text-white/70 mt-0.5 leading-tight">{s.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student, university, course…"
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          title="Filter by status"
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500 text-gray-700"
        >
          <option value="all">All Statuses ({applications.length})</option>
          {APP_STATUSES.map(s => (
            <option key={s.value} value={s.value}>
              {s.label} ({statCounts.find(c => c.value === s.value)?.count ?? 0})
            </option>
          ))}
        </select>

        {(search || statusFilter !== 'all') && (
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter('all'); }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100"
          >
            <X className="w-3.5 h-3.5" />Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
              ${viewMode === 'board' ? 'bg-white text-violet-700 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Layers className="w-3.5 h-3.5" />Board
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
              ${viewMode === 'list' ? 'bg-white text-violet-700 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <LayoutList className="w-3.5 h-3.5" />List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('free-register')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
              ${viewMode === 'free-register' ? 'bg-white text-violet-700 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Users className="w-3.5 h-3.5" />Free Register
          </button>
        </div>

        <p className="text-xs text-gray-400">
          {viewMode === 'free-register'
            ? `${subscribers.length} registration${subscribers.length !== 1 ? 's' : ''}`
            : `${filtered.length} application${filtered.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Error banner ── */}
      {loadError && (
        <div className="shrink-0 m-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Failed to load</p>
              <p className="text-xs text-red-600 mt-0.5">{loadError}</p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-3 text-gray-400">
          <Spinner size={6} />
          <span>Loading applications…</span>
        </div>
      ) : viewMode === 'board' ? (

        /* ════ BOARD / KANBAN VIEW ════ */
        <div className="flex-1 flex overflow-hidden">
          {/* Scrollable columns */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-3 h-full px-4 py-4 min-w-max">
              {APP_STATUSES.map(statusDef => {
                const col = byStatus[statusDef.value] || [];
                return (
                  <div
                    key={statusDef.value}
                    className="flex flex-col w-60 bg-gray-50/80 rounded-2xl border border-gray-200 overflow-hidden shrink-0"
                  >
                    {/* Column header */}
                    <div className={`flex items-center justify-between px-3 py-2.5 border-b ${COL_HEADER[statusDef.value]}`}>
                      <div className="flex items-center gap-2">
                        {statusDef.icon}
                        <span className="text-xs font-bold">{statusDef.label}</span>
                      </div>
                      <span className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full min-w-6 text-center">
                        {col.length}
                      </span>
                    </div>
                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {col.length === 0 ? (
                        <p className="text-center text-xs text-gray-400 py-8 italic">Empty</p>
                      ) : (
                        col.map(app => (
                          <BoardCard
                            key={`${app.studentId}-${app._id || app.id}`}
                            app={app}
                            selected={isSelected(app)}
                            onClick={() => selectApp(app)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          {selectedApp && (
            <div className="w-88 shrink-0 border-l border-gray-200 overflow-hidden">
              <DetailPanel
                app={selectedApp}
                studentDetail={studentDetail}
                studentLoading={studentLoading}
                counselorMap={counselorMap}
                statusUpdate={statusUpdate}
                notesUpdate={notesUpdate}
                saving={saving}
                saveError={saveError}
                onStatusChange={setStatusUpdate}
                onNotesChange={setNotesUpdate}
                onSave={handleSave}
                onClose={closeDetail}
              />
            </div>
          )}
        </div>

      ) : viewMode === 'free-register' ? (

        /* ════ FREE REGISTER VIEW ════ */
        <div className="flex-1 overflow-y-auto p-6">
          {/* Search bar */}
          <div className="mb-5 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={subSearch}
                onChange={e => setSubSearch(e.target.value)}
                placeholder="Search by name, email or phone…"
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
              />
            </div>
            {subSearch && (
              <button
                type="button"
                onClick={() => setSubSearch('')}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" />Clear
              </button>
            )}
            <p className="text-xs text-gray-400 ml-auto">
              {subscribers.filter(s =>
                !subSearch ||
                s.name?.toLowerCase().includes(subSearch.toLowerCase()) ||
                s.email?.toLowerCase().includes(subSearch.toLowerCase()) ||
                s.phone?.includes(subSearch)
              ).length} registration{subscribers.length !== 1 ? 's' : ''}
            </p>
          </div>

          {subscribers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-violet-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600 mb-1">No free registrations yet</p>
              <p className="text-xs text-gray-400">People who register via the homepage will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {subscribers
                .filter(s =>
                  !subSearch ||
                  s.name?.toLowerCase().includes(subSearch.toLowerCase()) ||
                  s.email?.toLowerCase().includes(subSearch.toLowerCase()) ||
                  s.phone?.includes(subSearch)
                )
                .map((s, i) => (
                  <div
                    key={s._id || i}
                    className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-linear-to-br from-violet-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {s.name ? s.name.charAt(0).toUpperCase() : s.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {s.name || 'No name provided'}
                        </p>
                        <p className="text-[10px] text-violet-500 font-medium">Free Registration</p>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs text-gray-600">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <a href={`mailto:${s.email}`}
                          className="truncate text-purple-600 hover:text-purple-800 hover:underline transition-colors">
                          {s.email}
                        </a>
                      </div>
                      {s.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{s.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>{new Date(s.subscribedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

      ) : (

        /* ════ LIST VIEW ════ */
        <div className="flex-1 flex overflow-hidden">
          {/* Left list */}
          <div
            className={`${selectedApp ? 'w-80' : 'flex-1'} shrink-0 border-r border-gray-200 bg-white overflow-y-auto`}
          >
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">
                  {search || statusFilter !== 'all' ? 'No applications match.' : 'No applications found.'}
                </p>
              </div>
            ) : (
              filtered.map(app => (
                <ListRow
                  key={`${app.studentId}-${app._id || app.id}`}
                  app={app}
                  selected={isSelected(app)}
                  onClick={() => selectApp(app)}
                />
              ))
            )}
          </div>

          {/* Right detail */}
          {selectedApp ? (
            <div className="flex-1 overflow-hidden">
              <DetailPanel
                app={selectedApp}
                studentDetail={studentDetail}
                studentLoading={studentLoading}
                counselorMap={counselorMap}
                statusUpdate={statusUpdate}
                notesUpdate={notesUpdate}
                saving={saving}
                saveError={saveError}
                onStatusChange={setStatusUpdate}
                onNotesChange={setNotesUpdate}
                onSave={handleSave}
                onClose={closeDetail}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
              <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-violet-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Select an Application</p>
              <p className="text-xs text-gray-400 text-center leading-relaxed">
                Click any application to view full details,<br />
                update its processing stage, and download documents.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
