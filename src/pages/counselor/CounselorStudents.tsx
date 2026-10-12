import { useState, useEffect, useCallback } from 'react';
import { Link, Routes, Route, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Search, ArrowLeft, FileText, MessageSquare, CheckCircle, Upload, Phone, X, UserPlus, Plus, Users, BookOpen, Edit2, Eye, UserCog,
  ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw, Activity, GraduationCap, AlertTriangle, UserX,
} from 'lucide-react';
import DocPreviewModal from '../../components/DocPreviewModal';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { Counselor } from '../../types';
import StatusBadge from '../../components/StatusBadge';
import LeadStageSelect, { LEAD_STAGES, leadStageOf } from '../../components/LeadStageSelect';
import BulkActionBar from '../../components/BulkActionBar';
import { RecordTab, StudentRecordPanel, useStudentRecord } from '../../components/StudentRecord';
import { checkCourseEligibility, ELIGIBILITY_BADGE } from '../../utils/eligibility';
import RecordNavArrows from '../../components/RecordNavArrows';
import StudentEditForm, { StudentProfileFields } from '../../components/StudentEditForm';
import StudentNotes from '../../components/StudentNotes';
import { usePermissions } from '../../hooks/usePermissions';
import { usePortalName } from '../../hooks/usePortalName';
import { exportRowsToCsv } from '../../utils/exportCsv';
import { downloadStudentProfilePdf } from '../../utils/studentProfilePdf';

const DOC_TYPES = ['Passport', 'Transcript', 'Diploma/Degree Certificate', 'English Test Certificate', 'SOP', 'LOR', 'CV/Resume', 'Bank Statement', 'Other'];

function RequestDocumentModal({ studentId, onClose, onRequested }: { studentId: string; onClose: () => void; onRequested: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(DOC_TYPES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Document name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.students.requestDocument(studentId, { name: name.trim(), type });
      onRequested();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to request document.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Request Document</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. IELTS Score Card"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Type</label>
            <select aria-label="Document type" value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60">
              {saving ? 'Requesting…' : 'Request Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const EDUCATION_LEVELS = ['10th Grade (Completed)', '12th Grade (Completed)', 'Diploma (Completed)', "Bachelor's (In Progress)", "Bachelor's (Completed)", "Master's (In Progress)", "Master's (Completed)", 'PhD (In Progress)', 'PhD (Completed)', 'Other'];
const ENGLISH_TYPES = ['IELTS', 'TOEFL', 'PTE', 'Duolingo', 'Other'];
const COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'New Zealand', 'Ireland', 'Netherlands', 'Singapore', 'France', 'Other'];

const STUDENT_STAGES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const normalId = (obj: any): string => String(obj?._id || obj?.id || '');

/** Inline Active/Inactive picker; saves as soon as the value changes. */
function StudentStatusSelect({ studentId, value, editable, onSaved }: { studentId: string; value?: string; editable: boolean; onSaved: (status: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!editable) return <StatusBadge status={value || ''} />;
  const current = value === 'inactive' ? 'inactive' : 'active';
  const tone = current === 'active'
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-gray-100 text-gray-600 border-gray-200';
  async function change(next: string) {
    if (next === value) return;
    setSaving(true); setError('');
    try { await api.students.update(studentId, { status: next }); onSaved(next); }
    catch (err: any) { setError(err.message || 'Could not update status'); }
    finally { setSaving(false); }
  }
  return (
    <span className="inline-flex flex-col">
      <select value={current} disabled={saving} onChange={e => change(e.target.value)}
        aria-label="Student status" title={error || 'Change status'}
        className={`text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60 ${tone}`}>
        {STUDENT_STAGES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
      </select>
      {error && <span className="text-[11px] text-red-600 mt-0.5">{error}</span>}
    </span>
  );
}

function StudentFormModal({ student, onClose, onSaved, inline = false }: { student?: any; onClose: () => void; onSaved: () => void; inline?: boolean }) {
  const isEdit = !!student;
  // Inline mode renders inside the narrow profile sidebar, so paired fields stack.
  const pairGrid = inline ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3';
  const span2 = inline ? '' : 'col-span-2';
  const [form, setForm] = useState({
    name: student?.name ?? '',
    email: student?.email ?? '',
    phone: student?.phone ?? '',
    nationality: student?.nationality ?? '',
    educationLevel: student?.educationLevel ?? '',
    gpa: student?.gpa != null ? String(student.gpa) : '',
    budget: student?.budget != null ? String(student.budget) : '',
    englishType: student?.englishScore?.type ?? 'IELTS',
    englishScore: student?.englishScore?.score != null ? String(student.englishScore.score) : '',
    preferredCountries: (student?.preferredCountries ?? []) as string[],
    status: student?.status === 'inactive' ? 'inactive' : 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, value: any) { setForm(f => ({ ...f, [field]: value })); }

  function toggleCountry(c: string) {
    setForm(f => ({
      ...f,
      preferredCountries: f.preferredCountries.includes(c)
        ? f.preferredCountries.filter(x => x !== c)
        : [...f.preferredCountries, c],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await api.students.update(student._id || student.id, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          nationality: form.nationality.trim(),
          educationLevel: form.educationLevel,
          status: form.status,
          gpa: form.gpa ? Number(form.gpa) : null,
          budget: form.budget ? Number(form.budget) : null,
          englishScore: form.englishScore ? { type: form.englishType, score: form.englishScore } : null,
          preferredCountries: form.preferredCountries,
        });
      } else {
        const payload: any = {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          nationality: form.nationality.trim(),
          educationLevel: form.educationLevel,
          status: form.status,
          joinedDate: new Date().toISOString().split('T')[0],
        };
        if (form.gpa) payload.gpa = Number(form.gpa);
        if (form.budget) payload.budget = Number(form.budget);
        if (form.englishScore) payload.englishScore = { type: form.englishType, score: form.englishScore };
        if (form.preferredCountries.length) payload.preferredCountries = form.preferredCountries;
        await api.students.create(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || (isEdit ? 'Failed to update student.' : 'Failed to create student.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={inline ? '' : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm'}>
      <div className={inline ? 'bg-white' : 'bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto'}>
        <div className={`flex items-center justify-between border-b border-gray-100 bg-white ${inline ? 'px-5 py-3' : 'px-6 py-4 sticky top-0 rounded-t-2xl z-10'}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              {isEdit ? <Edit2 className="w-4 h-4 text-blue-600" /> : <UserPlus className="w-4 h-4 text-blue-600" />}
            </div>
            <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Edit Student Profile' : 'Create Student Profile'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={`${inline ? 'px-5' : 'px-6'} py-5 space-y-4`}>
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">{error}</div>}

          {!isEdit && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-700">
              A random temporary password is emailed to the student and shown to you once, in case the email doesn't arrive. The student can change it after first login.
            </div>
          )}

          {/* Basic info */}
          <div className={pairGrid}>
            <div className={span2}>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Student's full name"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className={span2}>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@email.com"
                disabled={isEdit} title={isEdit ? 'Email is the student\'s login and cannot be changed here' : undefined}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            {isEdit && (
              <div className={span2}>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}
                  aria-label="Student status"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                  {STUDENT_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nationality</label>
              <input value={form.nationality} onChange={e => set('nationality', e.target.value)} placeholder="e.g. Indian"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          {/* Education */}
          <div className={pairGrid}>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Education Level</label>
              <select value={form.educationLevel} onChange={e => set('educationLevel', e.target.value)}
                aria-label="Education level"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                <option value="">Select...</option>
                {EDUCATION_LEVELS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">GPA</label>
              <input type="number" value={form.gpa} onChange={e => set('gpa', e.target.value)}
                placeholder="e.g. 8.5" min="0" max="10" step="0.1"
                title="GPA score"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          {/* English score */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">English Proficiency</label>
            <div className={pairGrid}>
              <select value={form.englishType} onChange={e => set('englishType', e.target.value)}
                aria-label="English test type"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                {ENGLISH_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input value={form.englishScore} onChange={e => set('englishScore', e.target.value)}
                placeholder="Score (e.g. 7.5)"
                title="English test score"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Annual Budget (USD)</label>
            <input type="number" value={form.budget} onChange={e => set('budget', e.target.value)}
              placeholder="e.g. 30000" min="0" step="1000"
              title="Annual budget in USD"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {/* Preferred countries */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Preferred Countries
              {form.preferredCountries.length > 0 && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                  {form.preferredCountries.length} selected
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRIES.map(c => {
                const sel = form.preferredCountries.includes(c);
                return (
                  <button key={c} type="button" onClick={() => toggleCountry(c)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${sel ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-600/40'}`}>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold shadow-md disabled:opacity-60 transition-all flex items-center justify-center gap-2">
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {isEdit ? 'Saving…' : 'Creating…'}</>
                : isEdit
                  ? <><CheckCircle className="w-4 h-4" /> Save Changes</>
                  : <><UserPlus className="w-4 h-4" /> Create Student</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CounselorStudents() {
  return (
    <Routes>
      <Route index element={<StudentsList />} />
      <Route path=":studentId" element={<StudentDetail />} />
    </Routes>
  );
}

function StudentsList() {
  const { portal } = usePortalName();
  const { user } = useAuth();
  const counselor = user as Counselor;
  const navigate = useNavigate();
  const { can, restricted, hasTeam } = usePermissions();
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const [showCreate, setShowCreate] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadStudents = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { setAllStudents(await api.students.list()); }
    catch (err: any) { setLoadError(err.message || 'Failed to load students.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);
  // Names for the "Assigned To" column
  useEffect(() => {
    api.tasks.assignees().then(list => setStaffNames(Object.fromEntries(list.map(u => [u._id, u.name])))).catch(() => {});
  }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, filterStage, filterCountry, filterDateStart, filterDateEnd, tab]);

  const isMine = (s: any) => counselor.assignedStudents?.includes(s._id || s.id) || String(s.counselorId) === String(counselor.id);
  const myStudents = allStudents.filter(isMine);
  // Only counselors whose role gives them a team (lower roles, or peers) get the Team Students view
  const source = tab === 'all' && hasTeam ? allStudents : myStudents;
  const countryOptions = Array.from(new Set(allStudents.flatMap(s => s.preferredCountries || []).filter(Boolean))).sort() as string[];

  // Throws on failure so the stage picker can show the error
  const saveStage = async (sid: string, leadStage: string) => {
    const updated = await api.students.setLeadStage(sid, leadStage);
    setAllStudents(prev => prev.map((s: any) => normalId(s) === sid ? { ...s, leadStage: updated.leadStage } : s));
  };

  const filtered = source.filter((s: any) => {
    if (filterStatus && s.status !== filterStatus) return false;
    if (filterStage && leadStageOf(s).value !== filterStage) return false;
    if (filterCountry && !(s.preferredCountries || []).includes(filterCountry)) return false;
    const jd = (s.joinedDate || '').slice(0, 10);
    if (filterDateStart && jd < filterDateStart) return false;
    if (filterDateEnd && jd > filterDateEnd) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.name?.toLowerCase().includes(q) && !s.email?.toLowerCase().includes(q) && !s.phone?.toLowerCase().includes(q) && !s.nationality?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a: any, b: any) => new Date(b.joinedDate || b.createdAt || 0).getTime() - new Date(a.joinedDate || a.createdAt || 0).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Open the full student page; pass the filtered order so ‹ › can step through it
  const openStudent = (id: string) => navigate(`/counselor/students/${id}`, { state: { ids: filtered.map(normalId) } });

  const counts = {
    total: allStudents.length,
    mine: myStudents.length,
    active: source.filter(s => s.status !== 'inactive').length,
    inactive: source.filter(s => s.status === 'inactive').length,
    enrolled: source.filter(s => s.status === 'enrolled' || s.leadStage === 'enrolment').length,
  };
  const pct = (n: number) => source.length > 0 ? `${Math.round((n / source.length) * 100)}%` : '0%';

  const handleExport = () => {
    exportRowsToCsv('students.csv', filtered.map(s => ({
      Name: s.name || '', Email: s.email || '', Phone: s.phone || '', Nationality: s.nationality || '',
      Status: s.status || '', 'Lead Stage': leadStageOf(s).label, Counselor: staffNames[s.counselorId] || 'Unassigned',
      'Joined Date': s.joinedDate || '',
    })));
  };

  const activeTags: { label: string; clear: () => void }[] = [];
  if (filterStatus) activeTags.push({ label: STUDENT_STAGES.find(s => s.value === filterStatus)?.label || filterStatus, clear: () => setFilterStatus('') });
  if (filterStage) activeTags.push({ label: `Stage: ${leadStageOf({ leadStage: filterStage }).label}`, clear: () => setFilterStage('') });
  if (filterCountry) activeTags.push({ label: filterCountry, clear: () => setFilterCountry('') });
  if (filterDateStart || filterDateEnd) activeTags.push({ label: `Joined ${filterDateStart || '…'} – ${filterDateEnd || '…'}`, clear: () => { setFilterDateStart(''); setFilterDateEnd(''); } });
  if (search) activeTags.push({ label: `"${search}"`, clear: () => { setSearch(''); setSearchInput(''); } });
  const clearAll = () => { setFilterStatus(''); setFilterStage(''); setFilterCountry(''); setFilterDateStart(''); setFilterDateEnd(''); setSearch(''); setSearchInput(''); };

  // Paginator: 1 2 3 … last
  const pageNums: (number | '...')[] = (() => {
    if (totalPages <= 6) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const nums: (number | '...')[] = [1, 2, 3];
    if (page > 4) nums.push('...');
    if (page > 3 && page < totalPages - 1) nums.push(page);
    nums.push('...', totalPages);
    return nums;
  })();

  const avatarPalette = ['from-blue-500 to-indigo-600', 'from-green-500 to-emerald-600', 'from-purple-500 to-pink-600', 'from-amber-500 to-orange-600', 'from-cyan-500 to-blue-600', 'from-rose-500 to-red-600'];
  const dSel = 'appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent cursor-pointer';
  const dInput = 'px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';

  return (
    <div className="space-y-6">
      {showNewLead && (
        <StudentEditForm basePath="/counselor/students" onClose={() => setShowNewLead(false)}
          onSaved={s => { setShowNewLead(false); navigate(`/counselor/students/${s._id || s.id}`); }} />
      )}
      {showCreate && (
        <StudentFormModal onClose={() => setShowCreate(false)} onSaved={() => { loadStudents(); setTab('mine'); }} />
      )}

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-green-600 via-green-700 to-teal-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-green-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
              <h1 className="text-2xl font-bold leading-tight">Students</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors">
              <Download className="w-4 h-4" />Export CSV
            </button>
            <button type="button" onClick={loadStudents} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
            </button>
            <Link to="/counselor/universities"
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" />New Application
            </Link>
            {can('students.create') && (
              <button type="button" onClick={() => setShowNewLead(true)} title="Add a lead from a phone call — only a name and mobile number are needed"
                className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors">
                <Phone className="w-4 h-4" />New Lead
              </button>
            )}
            {can('students.create') && (
              <button type="button" onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-3 py-2 bg-white text-green-700 rounded-xl text-sm font-bold hover:bg-green-50 transition-colors shadow-sm">
                <GraduationCap className="w-4 h-4" />Add Student
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {loadError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-5">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1"><p className="text-sm font-semibold text-red-800">Failed to load students</p><p className="text-xs text-red-600 mt-0.5">{loadError}</p></div>
          <button type="button" onClick={loadStudents} className="text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors">Retry</button>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-4 ${hasTeam ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {[
          ...(hasTeam ? [{ label: 'Team Students', value: counts.total, note: 'Visible to you', icon: <Users className="w-5 h-5 text-green-600" /> }] : []),
          { label: 'My Students', value: counts.mine, note: hasTeam && counts.total ? `${Math.round((counts.mine / counts.total) * 100)}% of team` : 'Assigned to you', icon: <UserCog className="w-5 h-5 text-green-600" /> },
          { label: 'Active', value: counts.active, note: pct(counts.active), icon: <Activity className="w-5 h-5 text-green-600" /> },
          { label: 'Inactive', value: counts.inactive, note: pct(counts.inactive), icon: <UserX className="w-5 h-5 text-green-500" /> },
          { label: 'Enrolled', value: counts.enrolled, note: pct(counts.enrolled), icon: <GraduationCap className="w-5 h-5 text-green-600" /> },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl p-4 border border-green-100 shadow-sm flex items-start gap-3 hover:border-green-300 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">{card.icon}</div>
            <div>
              <p className="text-gray-500 text-xs mb-1">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900">{loading ? '…' : card.value.toLocaleString()}</p>
              <p className="text-xs mt-1 text-green-600">{loading ? '' : card.note}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── My / Team tabs (only when the role gives them a team) ── */}
      {hasTeam && <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        <button type="button" onClick={() => setTab('mine')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>My Students ({myStudents.length})</button>
        <button type="button" onClick={() => setTab('all')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Team Students ({allStudents.length})</button>
      </div>}

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
              {STUDENT_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          <button type="button" onClick={() => setSearch(searchInput)}
            className="px-5 py-2 bg-green-600 text-white hover:bg-green-700 rounded-xl text-sm font-semibold transition-colors shadow-sm">
            Search
          </button>
          {activeTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-500 text-xs">Active filters:</span>
              {activeTags.map(tag => (
                <span key={tag.label} className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-medium">
                  {tag.label}
                  <button type="button" onClick={tag.clear} aria-label={`Clear ${tag.label}`} className="hover:text-green-900 leading-none"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <button type="button" onClick={clearAll} className="text-xs text-green-700 hover:text-green-900 underline">Clear all</button>
            </div>
          )}
        </div>
      </div>

      <BulkActionBar ids={[...selectedIds]} onClear={() => setSelectedIds(new Set())} onDone={loadStudents} />

      {/* ── Table ── */}
      {loading && allStudents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex items-center justify-center gap-3 text-gray-400">
          <span className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /><span className="text-sm">Loading students…</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="w-10 px-4 py-3.5">
                    <input type="checkbox" aria-label="Select all students on this page" checked={paginated.length > 0 && paginated.every((s: any) => selectedIds.has(normalId(s)))}
                      onChange={() => setSelectedIds(prev => { const n = new Set(prev); const all = paginated.every((s: any) => n.has(normalId(s))); paginated.forEach((s: any) => (all ? n.delete(normalId(s)) : n.add(normalId(s)))); return n; })}
                      className="w-4 h-4 rounded cursor-pointer accent-green-600" />
                  </th>
                  {['STUDENT', 'JOINED', 'EMAIL', 'PHONE', 'ASSIGNED TO', 'LEAD STAGE', 'STATUS', 'ACTIONS'].map(h => (
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
                  const mine = isMine(s);
                  const offer = (s.applications || []).some((a: any) => a.status === 'offer_received');
                  return (
                    <tr key={id} className="border-b border-gray-50 hover:bg-green-50/30 transition-colors">
                      <td className="w-10 px-4 py-3.5">
                        <input type="checkbox" aria-label={`Select ${s.name}`} checked={selectedIds.has(id)}
                          onChange={() => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                          className="w-4 h-4 rounded cursor-pointer accent-green-600" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 bg-gradient-to-br ${avatarPalette[idx % avatarPalette.length]} rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>{initials}</div>
                          <div className="min-w-0">
                            <button type="button" onClick={() => openStudent(id)} title="Open profile"
                              className="text-sm font-semibold text-gray-900 truncate hover:text-green-700 hover:underline text-left">{s.name}</button>
                            <p className="text-xs text-green-600 truncate">{s.email}</p>
                            {offer && (
                              <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-sky-50 px-2 py-0.5 rounded-md mt-1">
                                <CheckCircle className="w-3 h-3" /> Offer received
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.joinedDate || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-green-600 whitespace-nowrap max-w-[160px] truncate">{s.email || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.phone || '—'}</td>
                      <td className="px-4 py-3.5 text-sm whitespace-nowrap">
                        {mine ? <span className="font-medium text-green-700">You</span>
                          : s.counselorId ? <span className="text-gray-700">{staffNames[String(s.counselorId)] || '—'}</span>
                          : <span className="text-gray-400">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3.5"><LeadStageSelect value={s.leadStage} editable={mine || restricted} onSave={stage => saveStage(id, stage)} /></td>
                      <td className="px-4 py-3.5">
                        <StudentStatusSelect studentId={id} value={s.status} editable={mine}
                          onSaved={status => setAllStudents(prev => prev.map((x: any) => normalId(x) === id ? { ...x, status } : x))} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <Link to="/counselor/chat" title={`Chat with ${s.name}`}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-sky-50 border border-sky-200 text-sky-600 hover:bg-sky-100 transition-colors">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </Link>
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
                  className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer">
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
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${page === p ? 'bg-green-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
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

// One label/value line in the student details side panel
function InfoRow({ label, value }: { label: string; value?: any }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex gap-3 py-1.5">
      <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
      <span className={`text-xs flex-1 min-w-0 break-words ${empty ? 'text-gray-300' : 'text-gray-800 font-medium'}`}>{empty ? '—' : String(value)}</span>
    </div>
  );
}

function StudentDetail() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [student, setStudent] = useState<any>(null);
  const [studentLoadError, setStudentLoadError] = useState('');
  // Kept separately: other student updates return the profile without it
  const [counselorName, setCounselorName] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'documents' | 'courses' | 'notes' | RecordTab>(
    (searchParams.get('tab') as any) || 'overview'
  );
  const { record, loading: recordLoading, error: recordError, reload: reloadRecord } = useStudentRecord(studentId);
  const [updating, setUpdating] = useState(false);
  const [showRequestDoc, setShowRequestDoc] = useState(false);
  const [universities, setUniversities] = useState<any[]>([]);
  const [eligFilter, setEligFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const { user: counselor } = useAuth();
  const { restricted } = usePermissions();
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.universities.list().then(setUniversities).catch(() => {});
  }, []);

  // Reload whenever the student changes (incl. via the ‹ › arrows)
  const loadStudent = useCallback(() => {
    if (!studentId) return () => {};
    let cancelled = false;
    setStudent(null);
    setStudentLoadError('');
    setCounselorName(null);
    api.students.get(studentId).then(s => {
      if (cancelled) return;
      setStudent(s);
      setCounselorName(s.counselorName || null);
    }).catch((err: any) => { if (!cancelled) setStudentLoadError(err.message || 'Failed to load this student.'); });
    return () => { cancelled = true; };
  }, [studentId]);

  useEffect(() => loadStudent(), [loadStudent]);

  const verifyDoc = async (docId: string, status: 'verified' | 'rejected') => {
    if (!student || !studentId) return;
    setUpdating(true);
    try {
      const updated = await api.students.updateDocument(studentId, docId, status);
      setStudent(updated);
    } catch {}
    setUpdating(false);
  };

  const updateAppStatus = async (appId: string, status: string) => {
    if (!studentId) return;
    setUpdating(true);
    try {
      await api.applications.update(appId, { status });
      const updated = await api.students.get(studentId);
      setStudent(updated);
    } catch {}
    setUpdating(false);
  };

  if (!student && studentLoadError) return (
    <div className="text-center py-12">
      <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
      <p className="text-sm text-gray-600 mb-3">{studentLoadError}</p>
      <button type="button" onClick={loadStudent} className="text-sm font-semibold text-blue-700 hover:text-blue-800">Retry</button>
    </div>
  );

  if (!student) return (
    <div className="text-center py-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
    </div>
  );

  const apps = [...(student.applications || [])].sort((a: any, b: any) => {
    const ta = new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime();
    return tb - ta;
  });
  const docs = student.documents || [];
  // Own students, or — for counselors with a role — any team student the server let us open
  const canEditStudent = restricted || (counselor as any)?.assignedStudents?.includes(studentId) || String(student.counselorId) === String(counselor?.id);
  const allCourses = universities.flatMap(uni =>
    (uni.courses || []).map((c: any) => ({ ...c, uniName: uni.name, uniCountry: uni.country || '', _elig: checkCourseEligibility(student, c) }))
  );
  const courseCountries = Array.from(new Set(universities.map((u: any) => u.country).filter(Boolean))).sort() as string[];
  const eligCounts = {
    eligible: allCourses.filter(c => c._elig.status === 'eligible').length,
    partial: allCourses.filter(c => c._elig.status === 'partial').length,
    not_eligible: allCourses.filter(c => c._elig.status === 'not_eligible').length,
  };
  const visibleCourses = allCourses.filter(c => {
    if (eligFilter && c._elig.status !== eligFilter) return false;
    if (countryFilter && c.uniCountry !== countryFilter) return false;
    if (courseSearch) {
      const q = courseSearch.toLowerCase();
      if (!c.name?.toLowerCase().includes(q) && !c.uniName?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <>
    <div className="space-y-5">
      {showRequestDoc && studentId && (
        <RequestDocumentModal
          studentId={studentId}
          onClose={() => setShowRequestDoc(false)}
          onRequested={async () => {
            if (studentId) {
              const updated = await api.students.get(studentId).catch(() => null);
              if (updated) setStudent(updated);
            }
          }}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => { if (location.key !== 'default') navigate(-1); else navigate('/counselor/students'); }} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {studentId && <RecordNavArrows currentId={studentId} basePath="/counselor/students" />}
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* ── Left: student details ── */}
        <aside className="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center font-bold text-blue-700 text-xl flex-shrink-0">{student.name.charAt(0)}</div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate" title={student.name}>{student.name}</h2>
                <p className="flex items-center gap-1 text-xs text-gray-500 mb-1 min-w-0" title="Assigned counselor">
                  <UserCog className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{counselorName || 'Unassigned'}</span>
                </p>
                <StudentStatusSelect studentId={studentId!} value={student.status} editable={canEditStudent}
                  onSaved={status => setStudent((p: any) => ({ ...p, status }))} />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs font-medium text-gray-500">Lead Stage</span>
              <LeadStageSelect value={student.leadStage} size="md"
                editable={canEditStudent}
                onSave={async stage => { const u = await api.students.setLeadStage(studentId!, stage); setStudent((p: any) => ({ ...p, leadStage: u.leadStage })); }} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Link to="/counselor/chat" className="flex items-center justify-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
                <MessageSquare className="w-4 h-4" /> Chat
              </Link>
              <Link to="/counselor/universities" className="flex items-center justify-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
                <Plus className="w-4 h-4" /> Application
              </Link>
              <button type="button" onClick={() => downloadStudentProfilePdf(student, { counselorName: counselorName || undefined })}
                className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
                <Download className="w-4 h-4" /> Download Profile PDF
              </button>
              {canEditStudent && !editing && (
                <button type="button" onClick={() => setEditing(true)} className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
                  <Edit2 className="w-4 h-4" /> Edit Profile
                </button>
              )}
            </div>
          </div>

          {editing ? (
            <StudentEditForm inline student={{ ...student, counselorName }} basePath="/counselor/students" onClose={() => setEditing(false)}
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
            <InfoRow label="Applications" value={apps.length} />
            <InfoRow label="Documents" value={docs.length} />
            <InfoRow label="Joined" value={student.joinedDate} />
          </div>
          </>)}
        </aside>

        {/* ── Right: tabs ── */}
        <div className="flex-1 min-w-0 w-full space-y-5">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {(['overview', 'timeline', 'notes', 'messages', 'activities', 'emails', 'pipelines', 'documents', 'applications', 'courses'] as const).map(t => (
          <button type="button" key={t} onClick={() => { setActiveTab(t); setEligFilter(''); setCountryFilter(''); setCourseSearch(''); }}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium capitalize whitespace-nowrap transition-colors ${activeTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t === 'courses' ? 'Course Eligibility' : t === 'documents' ? 'Files' : t}
          </button>
        ))}
      </div>

      {(['timeline', 'messages', 'activities', 'emails', 'pipelines'] as const).map(t => activeTab === t && (
        <div key={t} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <StudentRecordPanel tab={t} student={student} record={record} reload={reloadRecord}
            loading={recordLoading} error={recordError}
            canEdit={canEditStudent} canReply={canEditStudent}
            onStudentChange={u => setStudent((p: any) => ({ ...p, ...u }))} />
        </div>
      ))}

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Application Summary</h3>
            {apps.length === 0 ? <p className="text-gray-400 text-sm">No applications yet</p> : (
              <div className="space-y-3">
                {apps.map((a: any) => (
                  <div key={a._id || a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div><p className="font-medium text-sm text-gray-900">{a.universityName}</p><p className="text-xs text-gray-500">{a.courseName}</p></div>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Document Status</h3>
            <div className="space-y-3">
              {docs.map((doc: any) => (
                <div key={doc._id || doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div><p className="font-medium text-sm text-gray-900">{doc.name}</p><p className="text-xs text-gray-500">{doc.type}</p></div>
                  <StatusBadge status={doc.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'applications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{apps.length} application{apps.length !== 1 ? 's' : ''}</p>
            <Link to="/counselor/universities"
              className="flex items-center gap-1.5 bg-green-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-green-700 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> New Application
            </Link>
          </div>
          {apps.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 shadow-sm">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No applications submitted yet</p>
            </div>
          ) : apps.map((app: any) => {
            const appId = app._id || app.id;
            return (
              <div key={appId} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-gray-900">{app.universityName}</h3>
                      <StatusBadge status={app.status} size="md" />
                    </div>
                    <p className="text-gray-600 text-sm">{app.courseName}</p>
                    <p className="text-xs text-gray-400 mt-1">Intake: {app.intake}{app.submittedDate && ` • Submitted: ${app.submittedDate}`}</p>
                  </div>
                  <select aria-label="Update application status" defaultValue={app.status} disabled={updating}
                    onChange={e => updateAppStatus(appId, e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60">
                    {['draft', 'submitted', 'under_review', 'offer_received', 'accepted', 'rejected', 'enrolled'].map(s => (
                      <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'courses' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={courseSearch}
                onChange={e => setCourseSearch(e.target.value)}
                placeholder="Search course or university…"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <select
              aria-label="Filter by country"
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white min-w-[140px]"
            >
              <option value="">All Countries</option>
              {courseCountries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: '', label: `All (${allCourses.length})`, active: 'bg-gray-200 text-gray-700 border-gray-300' },
              { key: 'eligible', label: `Eligible (${eligCounts.eligible})`, active: 'bg-green-100 text-green-700 border-green-300' },
              { key: 'partial', label: `Check Profile (${eligCounts.partial})`, active: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
              { key: 'not_eligible', label: `Not Eligible (${eligCounts.not_eligible})`, active: 'bg-red-100 text-red-700 border-red-300' },
            ].map(f => (
              <button key={f.key} type="button" onClick={() => setEligFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${eligFilter === f.key ? f.active : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {visibleCourses.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 shadow-sm">
                <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">{universities.length === 0 ? 'Loading courses…' : 'No courses match this filter.'}</p>
              </div>
            ) : visibleCourses.map((course: any, i: number) => {
              const badge = ELIGIBILITY_BADGE[course._elig.status as keyof typeof ELIGIBILITY_BADGE];
              return (
                <div key={course._id || course.id || i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{course.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{course.uniName} · {course.level}{course.uniCountry ? ` · ${course.uniCountry}` : ''}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${badge.classes}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>
                  </div>
                  {course._elig.missing.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {course._elig.missing.map((m: string, mi: number) => (
                        <p key={mi} className="text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-lg">✕ {m}</p>
                      ))}
                    </div>
                  )}
                  {course._elig.warnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {course._elig.warnings.map((w: string, wi: number) => (
                        <p key={wi} className="text-xs text-yellow-700 bg-yellow-50 px-2.5 py-1 rounded-lg">⚠ {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-gray-900">Documents</h3>
            <button type="button" onClick={() => setShowRequestDoc(true)} className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:text-blue-700">
              <Upload className="w-4 h-4" /> Request Document
            </button>
          </div>
          <div className="space-y-3">
            {docs.map((doc: any) => {
              const docId = doc._id || doc.id;
              return (
                <div key={docId} className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:border-gray-200">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{doc.name}</p>
                    <p className="text-xs text-gray-400">{doc.type} • Uploaded {doc.uploadedDate}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.url && (
                      <button type="button"
                        onClick={() => setPreviewDoc({ url: doc.url, name: doc.name })}
                        className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                        <Eye className="w-3 h-3" /> Preview
                      </button>
                    )}
                    <StatusBadge status={doc.status} size="md" />
                    {doc.status === 'pending' && (
                      <div className="flex gap-1">
                        <button type="button" disabled={updating} onClick={() => verifyDoc(docId, 'verified')}
                          className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-200 font-medium disabled:opacity-60">Verify</button>
                        <button type="button" disabled={updating} onClick={() => verifyDoc(docId, 'rejected')}
                          className="text-xs bg-red-100 text-red-700 px-2.5 py-1.5 rounded-lg hover:bg-red-200 font-medium disabled:opacity-60">Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'notes' && studentId && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">Notes</h3>
          <StudentNotes studentId={studentId} />
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
