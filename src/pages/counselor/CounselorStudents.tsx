import { uploadUrl } from '../../utils/uploadUrl';
import { useState, useEffect } from 'react';
import { Link, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, FileText, MessageSquare, CheckCircle, Upload, Phone, X, ExternalLink, UserPlus, Plus, Users, BookOpen, StickyNote, Edit2, Trash2, Eye } from 'lucide-react';
import DocPreviewModal from '../../components/DocPreviewModal';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { Counselor } from '../../types';
import StatusBadge from '../../components/StatusBadge';
import { checkCourseEligibility, ELIGIBILITY_BADGE } from '../../utils/eligibility';

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
  { value: 'counseling', label: 'Counseling' },
  { value: 'shortlisting', label: 'Shortlisting' },
  { value: 'application', label: 'Application' },
  { value: 'test_preparation', label: 'Test Preparation' },
  { value: 'visa_process', label: 'Visa Process' },
  { value: 'loan_process', label: 'Loan Process' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const STUDENTS_PER_PAGE = 8;

const ROW_BTN = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border text-green-700 bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-300 active:scale-[0.97] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-1';

function StudentFormModal({ student, onClose, onSaved }: { student?: any; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!student;
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
    status: student?.status ?? 'counseling',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
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

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">{error}</div>}

          {!isEdit && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-700">
              A default password <strong>student123</strong> will be set. The student can change it after first login.
            </div>
          )}

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Student's full name"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@email.com"
                disabled={isEdit} title={isEdit ? 'Email is the student\'s login and cannot be changed here' : undefined}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            {isEdit && (
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Stage</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}
                  aria-label="Student stage"
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
          <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
  const { user } = useAuth();
  const counselor = user as Counselor;
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const [showCreate, setShowCreate] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [page, setPage] = useState(1);

  function loadStudents() {
    api.students.list().then(setAllStudents).catch(() => {});
  }

  useEffect(() => { loadStudents(); }, []);
  useEffect(() => { setPage(1); }, [query, statusFilter, tab]);

  const isMine = (s: any) => !!counselor.assignedStudents?.includes(s._id || s.id);
  const myStudents = allStudents.filter(isMine);
  const source = tab === 'mine' ? myStudents : allStudents;

  const filtered = source.filter((s: any) => {
    const matchQuery = !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.email.toLowerCase().includes(query.toLowerCase()) || s.nationality?.toLowerCase().includes(query.toLowerCase());
    const matchStatus = !statusFilter || s.status === statusFilter;
    return matchQuery && matchStatus;
  }).sort((a: any, b: any) => new Date(b.joinedDate || b.createdAt || 0).getTime() - new Date(a.joinedDate || a.createdAt || 0).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / STUDENTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * STUDENTS_PER_PAGE;
  const pageStudents = filtered.slice(pageStart, pageStart + STUDENTS_PER_PAGE);

  return (
    <div className="space-y-6">
      {showCreate && (
        <StudentFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { loadStudents(); setTab('mine'); }}
        />
      )}
      {editingStudent && (
        <StudentFormModal
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
          onSaved={loadStudents}
        />
      )}
      <div className="bg-gradient-to-r from-green-600 via-green-700 to-teal-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-green-200 text-xs font-medium uppercase tracking-wide">Counselor Portal</p>
              <h1 className="text-2xl font-bold leading-tight">Students</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        <button type="button" onClick={() => setTab('mine')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>My Students ({myStudents.length})</button>
        <button type="button" onClick={() => setTab('all')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>All Students ({allStudents.length})</button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 gap-3 flex-wrap bg-gray-50/60">
          <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search students…"
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by stage"
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">All stages</option>
              {STUDENT_STAGES.filter(s => s.value !== 'active' && s.value !== 'inactive').map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold shadow-sm active:scale-[0.97] transition-all">
            <UserPlus className="w-4 h-4" />Add Student
          </button>
        </div>

        <div className="divide-y divide-gray-50">
          {pageStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <Users className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">{query || statusFilter ? 'No students match your search.' : 'No students yet. Add one above.'}</p>
            </div>
          ) : pageStudents.map((student: any) => {
            const sid = student._id || student.id;
            const apps = student.applications || [];
            const docs = student.documents || [];
            const subtitle = [student.nationality, student.educationLevel, student.phone].filter(Boolean).join(' · ');
            return (
              <div key={sid} className="flex items-center gap-4 px-5 py-4 hover:bg-green-50/40 transition-colors">
                <Link to={`/counselor/students/${sid}`} aria-label={`Open ${student.name}'s profile`}
                  className="w-11 h-11 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm text-lg">
                  {student.name.charAt(0)}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/counselor/students/${sid}`}
                    className="font-bold text-gray-900 text-sm hover:text-green-700 hover:underline transition-colors">
                    {student.name}
                  </Link>
                  <p className="text-xs text-gray-500 truncate">{student.email}</p>
                  {subtitle && <p className="text-xs text-green-700 mt-0.5 truncate">{subtitle}</p>}
                  {apps.some((a: any) => a.status === 'offer_received') && (
                    <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-sky-50 px-2 py-0.5 rounded-md mt-1">
                      <CheckCircle className="w-3 h-3" /> Offer received — action needed
                    </p>
                  )}
                </div>
                <div className="hidden lg:flex items-center gap-4 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-900">{apps.length}</p>
                    <p className="text-xs text-gray-400">apps</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-900">{docs.filter((d: any) => d.status === 'verified').length}/{docs.length}</p>
                    <p className="text-xs text-gray-400">docs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-900">{student.englishScore?.score ?? '—'}</p>
                    <p className="text-xs text-gray-400">{student.englishScore?.type ?? 'score'}</p>
                  </div>
                  <StatusBadge status={student.status} />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  <Link to="/counselor/chat" title={`Chat with ${student.name}`} className={ROW_BTN}>
                    <MessageSquare className="w-3.5 h-3.5" />Chat
                  </Link>
                  {isMine(student) && (
                    <button type="button" onClick={() => setEditingStudent(student)} title={`Edit ${student.name}`} className={ROW_BTN}>
                      <Edit2 className="w-3.5 h-3.5" />Edit
                    </button>
                  )}
                  {student.phone ? (
                    <a href={`tel:${student.phone.replace(/\s/g, '')}`} title={`Call ${student.phone}`}
                      className="w-8 h-8 bg-green-600 hover:bg-green-700 active:scale-95 text-white rounded-full flex items-center justify-center shadow-sm transition-all">
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span title="No phone number — add one with Edit" aria-label="No phone number"
                      className="w-8 h-8 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center cursor-not-allowed">
                      <Phone className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 border-t border-gray-100 bg-gray-50/60">
            <p className="text-xs text-gray-500">
              Showing <span className="font-semibold text-gray-700">{pageStart + 1}–{pageStart + pageStudents.length}</span> of <span className="font-semibold text-gray-700">{filtered.length}</span> students
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button key={n} type="button" onClick={() => setPage(n)} aria-current={n === currentPage ? 'page' : undefined}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold border transition-colors ${n === currentPage ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {n}
                  </button>
                ))}
                <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentDetail() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'documents' | 'courses' | 'notes'>('overview');
  const [updating, setUpdating] = useState(false);
  const [showRequestDoc, setShowRequestDoc] = useState(false);
  const [universities, setUniversities] = useState<any[]>([]);
  const [eligFilter, setEligFilter] = useState('');
  const [noteText, setNoteText] = useState('');
  const [editingNote, setEditingNote] = useState<{ id: string; text: string } | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const { user: counselor } = useAuth();
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (studentId) api.students.get(studentId).then(setStudent).catch(() => {});
    api.universities.list().then(setUniversities).catch(() => {});
  }, [studentId]);

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
      <button type="button" onClick={() => navigate('/counselor/students')} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center font-bold text-blue-700 text-2xl flex-shrink-0">{student.name.charAt(0)}</div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-gray-900">{student.name}</h2>
              <StatusBadge status={student.status} size="md" />
            </div>
            <p className="text-gray-600">{student.email} • {student.phone}</p>
            <p className="text-sm text-gray-500 mt-1">{student.nationality} • {student.educationLevel} • GPA: {student.gpa}/10</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {student.englishScore && <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full">{student.englishScore.type}: {student.englishScore.score}</span>}
              <span className="bg-purple-100 text-purple-700 text-xs px-2.5 py-1 rounded-full">Budget: ${(student.budget || 0).toLocaleString()}/yr</span>
              {(student.preferredCountries || []).map((c: string) => <span key={c} className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full">{c}</span>)}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Link to="/counselor/chat" className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
              <MessageSquare className="w-4 h-4" /> Chat
            </Link>
            <Link to="/counselor/universities" className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
              <Plus className="w-4 h-4" /> New Application
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {(['overview', 'applications', 'documents', 'courses', 'notes'] as const).map(t => (
          <button type="button" key={t} onClick={() => { setActiveTab(t); setEligFilter(''); setCountryFilter(''); setCourseSearch(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${activeTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t === 'courses' ? 'Course Eligibility' : t}
          </button>
        ))}
      </div>

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
                        onClick={() => setPreviewDoc({ url: uploadUrl(doc.url), name: doc.name })}
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

      {activeTab === 'notes' && (() => {
        const myNotes = (student.counselorNotes || []).filter((n: any) => n.counselorId === ((counselor as any)?._id || counselor?.id));

        const handleAddNote = async () => {
          if (!noteText.trim() || !studentId) return;
          setNotesSaving(true);
          try {
            const updated = await api.students.addNote(studentId, noteText.trim());
            setStudent(updated);
            setNoteText('');
          } catch {}
          setNotesSaving(false);
        };

        const handleSaveEdit = async () => {
          if (!editingNote || !editingNote.text.trim() || !studentId) return;
          setNotesSaving(true);
          try {
            const updated = await api.students.editNote(studentId, editingNote.id, editingNote.text.trim());
            setStudent(updated);
            setEditingNote(null);
          } catch {}
          setNotesSaving(false);
        };

        const handleDelete = async (noteId: string) => {
          if (!studentId) return;
          try {
            const updated = await api.students.deleteNote(studentId, noteId);
            setStudent(updated);
          } catch {}
        };

        return (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <StickyNote className="w-4 h-4 text-yellow-500" />
                <h3 className="font-bold text-gray-900">My Notes</h3>
                <span className="text-xs text-gray-400 ml-auto">Only visible to you</span>
              </div>

              <div className="flex gap-2 mb-5">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add a private note about this student…"
                  rows={3}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
                />
                <button
                  type="button"
                  disabled={!noteText.trim() || notesSaving}
                  onClick={handleAddNote}
                  className="self-end px-4 py-2.5 bg-yellow-500 text-white rounded-xl text-sm font-medium hover:bg-yellow-600 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {notesSaving ? 'Saving…' : 'Add Note'}
                </button>
              </div>

              {myNotes.length === 0 ? (
                <div className="text-center py-8">
                  <StickyNote className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No notes yet. Add your first note above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...myNotes].reverse().map((note: any) => {
                    const noteId = note._id || note.id;
                    const isEditing = editingNote?.id === noteId;
                    return (
                      <div key={noteId} className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingNote!.text}
                              onChange={e => setEditingNote({ id: editingNote!.id, text: e.target.value })}
                              rows={3}
                              className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none bg-white"
                            />
                            <div className="flex gap-2 justify-end">
                              <button type="button" onClick={() => setEditingNote(null)}
                                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                                Cancel
                              </button>
                              <button type="button" disabled={!editingNote!.text.trim() || notesSaving} onClick={handleSaveEdit}
                                className="px-3 py-1.5 text-xs bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50">
                                {notesSaving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <p className="flex-1 text-sm text-gray-800 whitespace-pre-wrap">{note.text}</p>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button type="button" onClick={() => setEditingNote({ id: noteId, text: note.text })}
                                className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-100 rounded-lg transition-colors" title="Edit note">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => handleDelete(noteId)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete note">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          {note.createdAt ? new Date(note.createdAt).toLocaleString() : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
    {previewDoc && (
      <DocPreviewModal url={previewDoc.url} fileName={previewDoc.name} onClose={() => setPreviewDoc(null)} />
    )}
    </>
  );
}
