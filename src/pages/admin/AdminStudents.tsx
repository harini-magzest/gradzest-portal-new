import { uploadUrl } from '../../utils/uploadUrl';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, UserCog, Plus, Trash2, X, GraduationCap,
  Eye, EyeOff, Check, Search, ExternalLink, ToggleLeft, ToggleRight,
  AlertTriangle, MessageSquare, ChevronDown, ChevronUp,
  BookOpen, DollarSign, MapPin, CheckCircle, Download, RefreshCw,
  ChevronLeft, ChevronRight, Info, UserX, Activity,
} from 'lucide-react';
import { api } from '../../api';
import { checkCourseEligibility, ELIGIBILITY_BADGE } from '../../utils/eligibility';
import StatusBadge from '../../components/StatusBadge';
import { notifyLeadsChanged } from '../../hooks/useNewLeadCount';

// ── Constants ────────────────────────────────────────────────────────────────
const COUNTRIES = ['UK', 'Canada', 'Australia', 'Germany', 'Netherlands', 'Singapore', 'USA', 'Ireland', 'New Zealand'];
const COURSES = ['Computer Science', 'Engineering', 'Business', 'Medicine', 'Law', 'Arts', 'Data Science', 'Finance', 'Psychology'];
const EDUCATION_LEVELS = ['10th Grade (Completed)', '12th Grade (Completed)', 'Diploma (Completed)', "Bachelor's (In Progress)", "Bachelor's (Completed)", "Master's (In Progress)", "Master's (Completed)", 'PhD (In Progress)', 'PhD (Completed)', 'Other'];
const ENGLISH_TYPES = ['IELTS', 'TOEFL', 'PTE', 'Duolingo'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const INTAKE_OPTIONS = [2025, 2026, 2027].flatMap(y => MONTHS.map(m => `${m} ${y}`));
const DEFAULT_STUDENT_FORM = {
  name: '', email: '', password: '', phone: '', nationality: '', educationLevel: '',
  gpa: '', englishType: '', englishScore: '', budget: '',
  preferredCountries: [] as string[], interestedCourses: [] as string[], counselorId: '',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function normalId(obj: any): string { return (obj?._id || obj?.id)?.toString() ?? ''; }

const LEAD_SOURCE_LABELS: Record<string, string> = { self_signup: 'email', github: 'GitHub', facebook: 'Facebook' };

function Spinner({ size = 4, white = false }: { size?: number; white?: boolean }) {
  return <span className={`w-${size} h-${size} border-2 ${white ? 'border-white/40 border-t-white' : 'border-gray-600 border-t-gray-300'} rounded-full animate-spin inline-block`} />;
}

function DetailRow({ label, value }: { label: string; value?: any }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-36 flex-shrink-0">{label}</span>
      <span className="text-xs text-gray-800 font-medium flex-1">{String(value)}</span>
    </div>
  );
}

function BtnPrimary({ children, onClick, disabled, type = 'button', className = '', variant = 'purple' }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  type?: 'button' | 'submit'; className?: string; variant?: 'purple' | 'blue';
}) {
  const colors = variant === 'blue'
    ? 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 focus-visible:ring-blue-500'
    : 'from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 focus-visible:ring-purple-500';
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
        bg-gradient-to-r shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${colors} ${className}`}>
      {children}
    </button>
  );
}

function BtnGhost({ children, onClick, type = 'button', className = '' }: {
  children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit'; className?: string;
}) {
  return (
    <button type={type} onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
        text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 ${className}`}>
      {children}
    </button>
  );
}

function BtnClose({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 active:scale-95 transition-all">
      <X className="w-4 h-4" />
    </button>
  );
}

// ── Student detail modal ─────────────────────────────────────────────────────
function StudentDetailModal({ student, onClose, onChat, onNewApplication }: {
  student: any; onClose: () => void; onChat?: () => void; onNewApplication?: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'courses'>('overview');
  const [universities, setUniversities] = useState<any[]>([]);
  const [eligFilter, setEligFilter] = useState('');

  useEffect(() => {
    api.universities.list().then(setUniversities).catch(() => {});
  }, []);

  const initials = student.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const allCourses = universities.flatMap(uni =>
    (uni.courses || []).map((c: any) => ({ ...c, uniName: uni.name, _elig: checkCourseEligibility(student, c) }))
  );
  const eligCounts = {
    eligible: allCourses.filter(c => c._elig.status === 'eligible').length,
    partial: allCourses.filter(c => c._elig.status === 'partial').length,
    not_eligible: allCourses.filter(c => c._elig.status === 'not_eligible').length,
  };
  const visibleCourses = eligFilter ? allCourses.filter(c => c._elig.status === eligFilter) : allCourses;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-4xl h-[93vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 pt-6 pb-5 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 border border-white/30 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg flex-shrink-0">{initials}</div>
              <div>
                <h2 className="text-xl font-bold text-white">{student.name}</h2>
                <p className="text-blue-200 text-sm mt-0.5">{student.email}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <StatusBadge status={student.status} />
                  {student.nationality && <span className="text-xs bg-white/15 text-white px-2.5 py-1 rounded-full font-medium border border-white/20">{student.nationality}</span>}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white transition-all flex-shrink-0"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-5">
            {[{ label: 'Applications', value: student.applications?.length ?? 0 }, { label: 'Documents', value: student.documents?.length ?? 0 }, { label: 'GPA', value: student.gpa ?? '—' }, { label: 'Budget', value: student.budget ? `$${Number(student.budget).toLocaleString()}` : '—' }].map(stat => (
              <div key={stat.label} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-white">{stat.value}</p>
                <p className="text-xs text-blue-200 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex border-b border-gray-100 flex-shrink-0 px-6 bg-white">
          {(['overview', 'courses'] as const).map(t => (
            <button key={t} type="button" onClick={() => { setTab(t); setEligFilter(''); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'courses' ? 'Course Eligibility' : 'Overview'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'overview' ? (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Personal Information</p>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <DetailRow label="Phone" value={student.phone} />
                    <DetailRow label="Nationality" value={student.nationality} />
                    <DetailRow label="Date of Birth" value={student.dateOfBirth} />
                    <DetailRow label="Gender" value={student.gender} />
                    <DetailRow label="Status" value={student.status} />
                    <DetailRow label="Joined" value={student.joinedDate} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Academic Profile</p>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <DetailRow label="Education Level" value={student.educationLevel} />
                    <DetailRow label="GPA" value={student.gpa} />
                    {student.englishScore?.score && <DetailRow label="English Score" value={`${student.englishScore.type} — ${student.englishScore.score}`} />}
                    <DetailRow label="Budget" value={student.budget ? `$${Number(student.budget).toLocaleString()}` : undefined} />
                  </div>
                </div>
                {student.preferredCountries?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Preferred Countries</p>
                    <div className="flex flex-wrap gap-2">{student.preferredCountries.map((c: string) => <span key={c} className="text-xs bg-sky-50 text-blue-700 px-3 py-1.5 rounded-full font-medium border border-blue-100">{c}</span>)}</div>
                  </div>
                )}
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Applications{student.applications?.length > 0 ? ` (${student.applications.length})` : ''}</p>
                  {student.applications?.length > 0 ? (
                    <div className="space-y-2">{[...student.applications].sort((a: any, b: any) => new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime() - new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime()).map((app: any, i: number) => (
                      <div key={app._id || i} className="bg-gray-50 rounded-xl p-3 flex items-start gap-3 border border-gray-100">
                        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900">{app.universityName}</p><p className="text-xs text-gray-500">{app.courseName}</p></div>
                        <StatusBadge status={app.status} />
                      </div>
                    ))}</div>
                  ) : <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 text-center"><p className="text-sm text-gray-400">No applications yet</p></div>}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Documents{student.documents?.length > 0 ? ` (${student.documents.length})` : ''}</p>
                  {student.documents?.length > 0 ? (
                    <div className="space-y-1.5">{student.documents.map((doc: any, i: number) => (
                      <div key={doc._id || i} className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-center justify-between border border-gray-100">
                        <div><p className="text-xs font-medium text-gray-900">{doc.name}</p><p className="text-xs text-gray-400">{doc.type}</p></div>
                        <div className="flex items-center gap-2">
                          {doc.url && <a href={uploadUrl(doc.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md hover:bg-gray-200 font-medium"><ExternalLink className="w-3 h-3" />Open</a>}
                          <StatusBadge status={doc.status} />
                        </div>
                      </div>
                    ))}</div>
                  ) : <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 text-center"><p className="text-sm text-gray-400">No documents uploaded</p></div>}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-4">
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
                  <div className="p-10 text-center">
                    <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">{universities.length === 0 ? 'Loading courses…' : 'No courses match this filter.'}</p>
                  </div>
                ) : visibleCourses.map((course: any, i: number) => {
                  const badge = ELIGIBILITY_BADGE[course._elig.status as keyof typeof ELIGIBILITY_BADGE];
                  return (
                    <div key={course._id || course.id || i} className="bg-gray-50 rounded-xl border border-gray-100 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{course.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{course.uniName} · {course.level}</p>
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
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0 flex gap-3">
          {onChat && <button type="button" onClick={onChat} className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-md active:scale-[0.98] transition-all"><MessageSquare className="w-4 h-4" />Chat</button>}
          {onNewApplication && <button type="button" onClick={onNewApplication} className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 shadow-md active:scale-[0.98] transition-all"><Plus className="w-4 h-4" />New Application</button>}
          <BtnGhost onClick={onClose} className="flex-1">Close</BtnGhost>
        </div>
      </div>
    </div>
  );
}

// ── New student modal ────────────────────────────────────────────────────────
function NewStudentModal({ onClose, onCreated, counselors }: {
  onClose: () => void; onCreated: (s: any) => void; counselors: any[];
}) {
  const [form, setForm] = useState(DEFAULT_STUDENT_FORM);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof typeof DEFAULT_STUDENT_FORM, value: any) => setForm(f => ({ ...f, [key]: value }));
  const toggleArr = (key: 'preferredCountries' | 'interestedCourses', val: string) =>
    set(key, form[key].includes(val) ? form[key].filter((x: string) => x !== val) : [...form[key], val]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) { setError('Name, email and password are required.'); return; }
    setSaving(true); setError('');
    try {
      const student = await api.admin.createStudent({
        name: form.name.trim(), email: form.email.trim(), password: form.password,
        phone: form.phone.trim() || undefined, nationality: form.nationality.trim() || undefined,
        educationLevel: form.educationLevel || undefined,
        gpa: form.gpa ? parseFloat(form.gpa) : undefined,
        englishScore: (form.englishType && form.englishScore) ? { type: form.englishType, score: parseFloat(form.englishScore) } : undefined,
        budget: form.budget ? parseInt(form.budget) : undefined,
        preferredCountries: form.preferredCountries, interestedCourses: form.interestedCourses,
        counselorId: form.counselorId || undefined,
      });
      onCreated(student);
    } catch (err: any) { setError(err.message || 'Failed to create student.'); }
    setSaving(false);
  };

  const inp = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400';
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm"><GraduationCap className="w-4 h-4 text-white" /></div>
            <h2 className="text-lg font-bold text-gray-900">Add New Student</h2>
          </div>
          <BtnClose onClick={onClose} />
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Account Details</p>
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Aryan Sharma" className={inp} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@example.com" className={inp} /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Set a password" className={`${inp} pr-11`} />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Personal Info</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 9999999999" className={inp} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Nationality</label><input value={form.nationality} onChange={e => set('nationality', e.target.value)} placeholder="e.g. Indian" className={inp} /></div>
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Academic Profile</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Education Level</label>
            <select value={form.educationLevel} onChange={e => set('educationLevel', e.target.value)} title="Education Level" className={`${inp} bg-white text-gray-700`}>
              <option value="">Select level…</option>
              {EDUCATION_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">GPA</label><input type="number" step="0.01" min="0" max="10" value={form.gpa} onChange={e => set('gpa', e.target.value)} placeholder="e.g. 3.8" className={inp} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Budget (USD)</label><input type="number" min="0" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="e.g. 50000" className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">English Test</label>
              <select value={form.englishType} onChange={e => set('englishType', e.target.value)} title="English Test" className={`${inp} bg-white text-gray-700`}>
                <option value="">Select…</option>
                {ENGLISH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Score</label><input type="number" step="0.5" value={form.englishScore} onChange={e => set('englishScore', e.target.value)} placeholder="e.g. 7.5" className={inp} /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Countries</label>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map(c => { const sel = form.preferredCountries.includes(c); return (
                <button key={c} type="button" onClick={() => toggleArr('preferredCountries', c)}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all active:scale-95 ${sel ? 'bg-[#0d1b4b] text-white border-[#0d1b4b]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#0d1b4b]/40'}`}>
                  {sel && <Check className="w-3 h-3" />}{c}
                </button>
              ); })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Interested Courses</label>
            <div className="flex flex-wrap gap-2">
              {COURSES.map(c => { const sel = form.interestedCourses.includes(c); return (
                <button key={c} type="button" onClick={() => toggleArr('interestedCourses', c)}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all active:scale-95 ${sel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400'}`}>
                  {sel && <Check className="w-3 h-3" />}{c}
                </button>
              ); })}
            </div>
          </div>
          {counselors.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign to Counselor</label>
              <select value={form.counselorId} onChange={e => set('counselorId', e.target.value)} title="Counselor" className={`${inp} bg-white text-gray-700`}>
                <option value="">Unassigned</option>
                {counselors.map(c => <option key={normalId(c)} value={normalId(c)}>{c.name}</option>)}
              </select>
            </div>
          )}
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</div>}
          <div className="flex gap-3 pt-2">
            <BtnGhost onClick={onClose} className="flex-1">Cancel</BtnGhost>
            <BtnPrimary type="submit" disabled={saving} className="flex-1" variant="blue">
              {saving ? <><Spinner size={4} white />Adding…</> : <><GraduationCap className="w-4 h-4" />Add Student</>}
            </BtnPrimary>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Assign counselor modal ───────────────────────────────────────────────────
function AssignCounselorModal({ student, counselors, onClose, onSaved }: {
  student: any; counselors: any[]; onClose: () => void; onSaved: () => void;
}) {
  const currentId = student.counselorId || '';
  const [selectedId, setSelectedId] = useState(currentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const unchanged = selectedId === currentId;
  const handleSave = async () => {
    setSaving(true); setError('');
    try { await api.admin.assignCounselor(normalId(student), selectedId || null); onSaved(); }
    catch (err: any) { setError(err.message || 'Failed.'); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div><h2 className="text-base font-bold text-gray-900">Assign Counselor</h2><p className="text-sm text-gray-500 mt-0.5">{student.name}</p></div>
          <BtnClose onClick={onClose} />
        </div>
        <div className="p-5 space-y-4">
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} title="Counselor" className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-700">
            <option value="">— Unassigned —</option>
            {counselors.map(c => <option key={normalId(c)} value={normalId(c)}>{c.name}</option>)}
          </select>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
          <div className="flex gap-3">
            <BtnGhost onClick={onClose} className="flex-1">Cancel</BtnGhost>
            <BtnPrimary onClick={handleSave} disabled={saving || unchanged} className="flex-1">
              {saving ? <><Spinner size={4} white />Saving…</> : unchanged ? 'No Change' : 'Save'}
            </BtnPrimary>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New application modal ────────────────────────────────────────────────────
function NewApplicationModal({ allStudents, initialStudent, onClose, onCreated }: {
  allStudents: any[]; initialStudent?: any; onClose: () => void; onCreated: () => void;
}) {
  const [universities, setUniversities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uniSearch, setUniSearch] = useState('');
  const [expandedUni, setExpandedUni] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [applyError, setApplyError] = useState('');
  const [applySuccess, setApplySuccess] = useState('');

  // Student search & selection
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(initialStudent || null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const matchedStudents = studentQuery.trim().length >= 1
    ? allStudents.filter(s =>
        s.name?.toLowerCase().includes(studentQuery.toLowerCase()) ||
        s.email?.toLowerCase().includes(studentQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  // Fetch full student profile whenever selection changes (ensures all eligibility fields are present)
  useEffect(() => {
    if (!selectedStudent) { setStudentProfile(null); return; }
    setLoadingProfile(true);
    api.students.get(normalId(selectedStudent))
      .then(p => { setStudentProfile(p); setLoadingProfile(false); })
      .catch(() => { setStudentProfile(selectedStudent); setLoadingProfile(false); });
  }, [selectedStudent]);

  useEffect(() => {
    api.admin.universities()
      .then(data => { setUniversities(data); setLoading(false); })
      .catch(e => { setError(e.message || 'Failed.'); setLoading(false); });
  }, []);

  const filteredUnis = universities.filter(u =>
    !uniSearch || u.name?.toLowerCase().includes(uniSearch.toLowerCase()) || u.country?.toLowerCase().includes(uniSearch.toLowerCase())
  );

  const handleApply = async (uni: any, course: any) => {
    if (!selectedStudent) return;
    const key = `${normalId(uni)}-${normalId(course)}`;
    setApplying(key); setApplyError(''); setApplySuccess('');
    try {
      await api.admin.createApplication({ studentId: normalId(selectedStudent), universityName: uni.name, courseName: course.name, intake: course.intake?.[0] || undefined, universityId: normalId(uni), courseId: normalId(course) });
      setAppliedIds(prev => new Set([...prev, key])); setApplySuccess(`Applied to ${course.name} at ${uni.name}`); onCreated();
    } catch (e: any) { setApplyError(e.message || 'Failed.'); }
    setApplying(null);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-sky-500 to-cyan-600 px-6 py-5 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sky-200 text-xs font-medium uppercase tracking-wide">New Application</p>
              <h2 className="text-xl font-bold text-white mt-0.5">Select Student & Course</h2>
              {selectedStudent && <p className="text-sky-100 text-sm mt-1">Eligibility checked against <span className="font-semibold">{selectedStudent.name}</span>'s profile</p>}
            </div>
            <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white transition-all flex-shrink-0"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Student selector */}
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-gray-50/60">
          {selectedStudent ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {selectedStudent.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{selectedStudent.name}</p>
                  <p className="text-xs text-gray-500 truncate">{selectedStudent.email}</p>
                </div>
                {loadingProfile
                  ? <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
                  : studentProfile && (
                    <span className="text-xs text-blue-600 font-medium flex-shrink-0 hidden sm:block">
                      {[studentProfile.educationLevel, studentProfile.gpa ? `GPA ${studentProfile.gpa}` : null, studentProfile.englishScore?.type ? `${studentProfile.englishScore.type} ${studentProfile.englishScore.score}` : null].filter(Boolean).join(' · ')}
                    </span>
                  )
                }
              </div>
              <button type="button"
                onClick={() => { setSelectedStudent(null); setStudentProfile(null); setStudentQuery(''); setAppliedIds(new Set()); }}
                className="px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex-shrink-0">
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  value={studentQuery}
                  onChange={e => { setStudentQuery(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder="Type student name or email to search…"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  autoFocus
                />
              </div>
              {showDropdown && matchedStudents.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-52 overflow-y-auto">
                  {matchedStudents.map(s => (
                    <button key={normalId(s)} type="button"
                      onMouseDown={() => { setSelectedStudent(s); setStudentQuery(s.name); setShowDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left">
                      <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {s.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        <p className="text-xs text-gray-400 truncate">{s.email}</p>
                      </div>
                      {s.educationLevel && <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">{s.educationLevel}</span>}
                    </button>
                  ))}
                </div>
              )}
              {showDropdown && studentQuery.trim().length >= 1 && matchedStudents.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 px-4 py-3">
                  <p className="text-sm text-gray-400">No students found for "{studentQuery}"</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* University search */}
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input value={uniSearch} onChange={e => setUniSearch(e.target.value)} placeholder="Search universities…" className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>

        {applySuccess && <div className="mx-5 mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex-shrink-0"><CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" /><p className="text-sm text-green-700 font-medium">{applySuccess}</p></div>}
        {applyError && <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex-shrink-0"><AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" /><p className="text-sm text-red-700">{applyError}</p></div>}

        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-3">
          {!selectedStudent ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <GraduationCap className="w-10 h-10 mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">Search for a student above to get started</p>
              <p className="text-xs mt-1">Eligibility will be checked against their profile automatically</p>
            </div>
          ) : loading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-600 rounded w-1/2" />
                  </div>
                  <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : filteredUnis.map(uni => {
            const uid = normalId(uni); const isOpen = expandedUni === uid; const courses: any[] = uni.courses || [];
            return (
              <div key={uid} className="border border-gray-200 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setExpandedUni(isOpen ? null : uid)} className="w-full flex items-center gap-4 px-4 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{uni.name?.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{uni.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {uni.country && <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{uni.country}</span>}
                      <span className="flex items-center gap-1 text-xs text-gray-400"><BookOpen className="w-3 h-3" />{courses.length} courses</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>
                {isOpen && <div className="divide-y divide-gray-100 border-t border-gray-200">
                  {courses.map((course: any) => {
                    const cid = normalId(course); const key = `${uid}-${cid}`;
                    const isApplied = appliedIds.has(key); const isApplying = applying === key;
                    const elig = studentProfile
                      ? checkCourseEligibility(studentProfile, course)
                      : { status: 'unknown' as const, missing: [] as string[], warnings: [] as string[] };
                    const badge = ELIGIBILITY_BADGE[elig.status];
                    const isNotEligible = elig.status === 'not_eligible';
                    return (
                      <div key={cid} className={`px-4 py-3 bg-white hover:bg-sky-50/30 ${isNotEligible ? 'bg-red-50/20' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{course.name}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                              {course.level && <span className="text-xs text-gray-500">{course.level}</span>}
                              {course.tuitionFee != null && <span className="flex items-center gap-0.5 text-xs text-green-700 font-medium"><DollarSign className="w-3 h-3" />{Number(course.tuitionFee).toLocaleString()}</span>}
                              {loadingProfile
                                ? <span className="text-xs text-gray-400 italic">checking…</span>
                                : <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.classes}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />{badge.label}
                                  </span>
                              }
                            </div>
                          </div>
                          {isNotEligible ? (
                            <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border bg-red-50 text-red-600 border-red-200 cursor-not-allowed">
                              <X className="w-3.5 h-3.5" />Not Eligible
                            </span>
                          ) : (
                            <button type="button" disabled={isApplied || isApplying || loadingProfile} onClick={() => handleApply(uni, course)}
                              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${isApplied ? 'bg-green-50 text-green-700 border-green-200 cursor-default' : 'bg-[#0d1b4b] text-white border-[#0d1b4b] hover:bg-[#152258] shadow-sm disabled:opacity-60'}`}>
                              {isApplying ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Applying…</> : isApplied ? <><Check className="w-3.5 h-3.5" />Applied</> : <><Plus className="w-3.5 h-3.5" />Apply</>}
                            </button>
                          )}
                        </div>
                        {!loadingProfile && elig.missing.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {elig.missing.map((m: string, mi: number) => (
                              <span key={mi} className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">✕ {m}</span>
                            ))}
                          </div>
                        )}
                        {!loadingProfile && elig.warnings.length > 0 && !isNotEligible && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {elig.warnings.map((w: string, wi: number) => (
                              <span key={wi} className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">⚠ {w}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>}
              </div>
            );
          })}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0"><BtnGhost onClick={onClose} className="w-full">Close</BtnGhost></div>
      </div>
    </div>
  );
}

// ── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const s = status?.toLowerCase() ?? '';
  let cls = 'bg-purple-100 text-purple-700 border border-purple-200';
  if (s === 'active') cls = 'bg-green-100 text-green-700 border border-green-200';
  else if (s === 'inactive') cls = 'bg-gray-100 text-gray-600 border border-gray-200';
  else if (s === 'counseling') cls = 'bg-sky-100 text-sky-700 border border-sky-200';
  else if (s === 'shortlisting') cls = 'bg-indigo-100 text-indigo-700 border border-indigo-200';
  else if (s === 'application') cls = 'bg-blue-100 text-blue-700 border border-blue-200';
  else if (s === 'test_preparation') cls = 'bg-yellow-100 text-yellow-700 border border-yellow-200';
  else if (s === 'visa_process') cls = 'bg-orange-100 text-orange-700 border border-orange-200';
  else if (s === 'loan_process') cls = 'bg-pink-100 text-pink-700 border border-pink-200';
  else if (s === 'enrolled') cls = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
  else if (s === 'registered') cls = 'bg-slate-100 text-slate-600 border border-slate-200';
  else if (s === 'under_review' || s === 'under review') cls = 'bg-blue-100 text-blue-700 border border-blue-200';
  else if (s === 'pending' || s === 'incomplete') cls = 'bg-amber-100 text-amber-700 border border-amber-200';
  const label = (status || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AdminStudents() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterLead = searchParams.get('lead') === 'new';
  const setFilterLead = (on: boolean) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    if (on) next.set('lead', 'new'); else next.delete('lead');
    return next;
  }, { replace: true });
  const [students, setStudents] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [showNewApp, setShowNewApp] = useState(false);
  const [newAppStudent, setNewAppStudent] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [assigningIds, setAssigningIds] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterCounselorId, setFilterCounselorId] = useState('');
  const [filterIntake, setFilterIntake] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('2025-01-01');
  const [filterDateEnd, setFilterDateEnd] = useState(new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [sd, cd] = await Promise.all([api.admin.students(), api.admin.counselors()]);
      setStudents(sd); setCounselors(cd);
    } catch (err: any) { setLoadError(err.message || 'Failed to load data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [search, filterStatus, filterCountry, filterCounselorId, filterIntake, filterDateStart, filterDateEnd, filterLead]);

  const counselorNameById = Object.fromEntries(counselors.map(c => [normalId(c), c.name]));
  const countryOptions = Array.from(new Set(students.flatMap(s => s.preferredCountries || []).filter(Boolean))).sort() as string[];

  const filtered = students.filter(s => {
    if (filterLead && s.leadStatus !== 'new') return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (filterCountry && !(s.preferredCountries || []).includes(filterCountry)) return false;
    if (filterCounselorId) {
      if (filterCounselorId === '__unassigned__') { if (s.counselorId) return false; }
      else if (s.counselorId?.toString() !== filterCounselorId) return false;
    }
    const jd = (s.joinedDate || '').slice(0, 10);
    if (!filterLead && filterDateStart && jd < filterDateStart) return false;
    if (!filterLead && filterDateEnd && jd > filterDateEnd) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.name?.toLowerCase().includes(q) && !s.email?.toLowerCase().includes(q) && !s.phone?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.joinedDate || b.createdAt || 0).getTime() - new Date(a.joinedDate || a.createdAt || 0).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const counts = {
    total: students.length,
    active: students.filter(s => !['enrolled', 'inactive'].includes(s.status)).length,
    inactive: students.filter(s => s.status === 'inactive').length,
    enrolled: students.filter(s => s.status === 'enrolled').length,
    unassigned: students.filter(s => !s.counselorId).length,
    newLeads: students.filter(s => s.leadStatus === 'new').length,
  };
  const pct = (n: number) => counts.total > 0 ? `${Math.round((n / counts.total) * 100)}%` : '0%';

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this student? This cannot be undone.')) return;
    setDeletingId(id);
    try { await api.admin.deleteStudent(id); setStudents(prev => prev.filter(s => normalId(s) !== id)); notifyLeadsChanged(); }
    catch { alert('Failed to delete student.'); }
    setDeletingId(null);
  };

  const handleToggle = async (student: any) => {
    const id = normalId(student); const newStatus = student.status === 'active' ? 'inactive' : 'active';
    setTogglingId(id);
    try { const updated = await api.admin.updateStudentStatus(id, newStatus); setStudents(prev => prev.map(s => normalId(s) === id ? updated : s)); }
    catch { alert('Failed to update status.'); }
    setTogglingId(null);
  };

  const handleInlineAssign = async (studentId: string, counselorId: string) => {
    setAssigningIds(prev => new Set([...prev, studentId]));
    try {
      await api.admin.assignCounselor(studentId, counselorId || null);
      // The server also flips a 'new' lead to 'contacted' once a counselor is assigned
      setStudents(prev => prev.map(s => normalId(s) === studentId
        ? { ...s, counselorId: counselorId || undefined, ...(counselorId && s.leadStatus === 'new' ? { leadStatus: 'contacted' } : {}) }
        : s));
      notifyLeadsChanged();
    } catch { alert('Failed to assign counselor.'); }
    setAssigningIds(prev => { const n = new Set(prev); n.delete(studentId); return n; });
  };

  const handleMarkContacted = async (id: string) => {
    setMarkingId(id);
    try {
      const updated = await api.admin.setLeadStatus(id, 'contacted');
      setStudents(prev => prev.map(s => normalId(s) === id ? updated : s));
      notifyLeadsChanged();
    } catch { alert('Failed to update lead.'); }
    setMarkingId(null);
  };

  const handleExport = () => {
    const rows = filtered.map(s => ({
      Name: s.name || '', Email: s.email || '', Nationality: s.nationality || '',
      Status: s.status || '', Counselor: counselorNameById[s.counselorId] || 'Unassigned',
      'Joined Date': s.joinedDate || '',
    }));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => JSON.stringify((r as Record<string, string>)[h] ?? '')).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'students.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const activeTags: { label: string; clear: () => void }[] = [];
  if (filterLead) activeTags.push({ label: 'New leads', clear: () => setFilterLead(false) });
  if (filterStatus) activeTags.push({ label: filterStatus, clear: () => setFilterStatus('') });
  if (filterCountry) activeTags.push({ label: filterCountry, clear: () => setFilterCountry('') });
  if (filterIntake) activeTags.push({ label: filterIntake, clear: () => setFilterIntake('') });
  if (filterCounselorId) activeTags.push({ label: `Counselor: ${filterCounselorId === '__unassigned__' ? 'Unassigned' : counselorNameById[filterCounselorId] || ''}`, clear: () => setFilterCounselorId('') });
  if (search) activeTags.push({ label: `"${search}"`, clear: () => { setSearch(''); setSearchInput(''); } });
  const clearAll = () => { setFilterLead(false); setFilterStatus(''); setFilterCountry(''); setFilterCounselorId(''); setFilterIntake(''); setSearch(''); setSearchInput(''); };

  const allPageSelected = paginated.length > 0 && paginated.every(s => selectedIds.has(normalId(s)));
  const toggleAll = () => {
    if (allPageSelected) setSelectedIds(prev => { const n = new Set(prev); paginated.forEach(s => n.delete(normalId(s))); return n; });
    else setSelectedIds(prev => new Set([...prev, ...paginated.map(s => normalId(s))]));
  };
  const toggleOne = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Build paginator: 1 2 3 … last
  const buildPageNums = (): (number | '...')[] => {
    if (totalPages <= 6) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const nums: (number | '...')[] = [1, 2, 3];
    if (page > 4) nums.push('...');
    if (page > 3 && page < totalPages - 1) nums.push(page);
    nums.push('...', totalPages);
    return nums;
  };
  const pageNums = buildPageNums();

  const avatarPalette = ['from-blue-500 to-indigo-600', 'from-green-500 to-emerald-600', 'from-purple-500 to-pink-600', 'from-amber-500 to-orange-600', 'from-cyan-500 to-blue-600', 'from-rose-500 to-red-600'];

  // shared select style
  const dSel = 'appearance-none px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer';

  return (
    <>
      {showNewStudent && <NewStudentModal counselors={counselors} onClose={() => setShowNewStudent(false)} onCreated={s => { setStudents(prev => [s, ...prev]); setShowNewStudent(false); }} />}
      {selectedStudent && (
        <StudentDetailModal student={selectedStudent} onClose={() => setSelectedStudent(null)}
          onChat={() => { navigate('/admin/chat', { state: { openChatWith: { _id: normalId(selectedStudent), name: selectedStudent.name } } }); setSelectedStudent(null); }}
          onNewApplication={() => { setNewAppStudent(selectedStudent); setSelectedStudent(null); setShowNewApp(true); }} />
      )}
      {showNewApp && <NewApplicationModal allStudents={students} initialStudent={newAppStudent || undefined} onClose={() => { setShowNewApp(false); setNewAppStudent(null); }} onCreated={() => loadData()} />}

      {/* Page wrapper */}
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">Admin Portal</p>
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
              <button type="button" onClick={() => { setNewAppStudent(null); setShowNewApp(true); }}
                className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" />New Application
              </button>
              <button type="button" onClick={() => setShowNewStudent(true)}
                className="flex items-center gap-2 px-3 py-2 bg-white text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-50 transition-colors shadow-sm">
                <GraduationCap className="w-4 h-4" />Register Student
              </button>
            </div>
          </div>
        </div>

        {/* ── Error ── */}
        {loadError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-5">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1"><p className="text-sm font-semibold text-red-800">Failed to load data</p><p className="text-xs text-red-600 mt-0.5">{loadError}</p></div>
            <button type="button" onClick={loadData} className="text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors">Retry</button>
          </div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total', value: counts.total, trend: '+12%', icon: <Users className="w-5 h-5 text-purple-600" />, iconBg: 'bg-purple-100' },
            { label: 'Active', value: counts.active, trend: pct(counts.active), icon: <Activity className="w-5 h-5 text-purple-600" />, iconBg: 'bg-purple-100' },
            { label: 'Inactive', value: counts.inactive, trend: pct(counts.inactive), icon: <UserX className="w-5 h-5 text-purple-400" />, iconBg: 'bg-purple-50' },
            { label: 'Enrolled', value: counts.enrolled, trend: '+5 this week', icon: <GraduationCap className="w-5 h-5 text-purple-600" />, iconBg: 'bg-purple-100' },
            { label: 'Unassigned', value: counts.unassigned, trend: counts.unassigned > 0 ? 'Needs action' : 'All assigned', icon: <UserCog className="w-5 h-5 text-purple-500" />, iconBg: 'bg-purple-100' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-2xl p-4 border border-purple-100 shadow-sm flex items-start gap-3 hover:border-purple-300 hover:shadow-md transition-all">
              <div className={`w-11 h-11 rounded-xl ${card.iconBg} flex items-center justify-center flex-shrink-0`}>{card.icon}</div>
              <div>
                <p className="text-gray-500 text-xs mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">{loading ? '…' : card.value.toLocaleString()}</p>
                <p className="text-xs mt-1 text-purple-500">{loading ? '' : card.trend}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── New leads banner ── */}
        {counts.newLeads > 0 && !filterLead && (
          <div className="flex items-center justify-between gap-3 flex-wrap bg-red-50 border border-red-200 rounded-2xl px-5 py-3">
            <p className="text-sm text-red-800">
              <span className="font-bold">{counts.newLeads} new lead{counts.newLeads > 1 ? 's' : ''}</span>
              {' '}signed up and {counts.newLeads > 1 ? 'are' : 'is'} waiting for a counselor.
            </p>
            <button type="button" onClick={() => setFilterLead(true)}
              className="text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors">
              View new leads
            </button>
          </div>
        )}

        {/* ── Filter bar ── */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
          {/* Row 1 */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filterDateStart}
                onChange={e => setFilterDateStart(e.target.value)}
                title="From date"
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-gray-400 text-sm font-medium">–</span>
              <input
                type="date"
                value={filterDateEnd}
                onChange={e => setFilterDateEnd(e.target.value)}
                title="To date"
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {/* Country */}
            <div className="relative">
              <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} title="Country" className={dSel}>
                <option value="">Country</option>
                {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            </div>
            {/* Status */}
            <div className="relative">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} title="Status" className={dSel}>
                <option value="">Status</option>
                <option value="counseling">Counseling</option>
                <option value="shortlisting">Shortlisting</option>
                <option value="application">Application</option>
                <option value="test_preparation">Test Preparation</option>
                <option value="visa_process">Visa Process</option>
                <option value="loan_process">Loan Process</option>
                <option value="enrolled">Enrolled</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            </div>
            {/* Counselor */}
            <div className="relative">
              <select value={filterCounselorId} onChange={e => setFilterCounselorId(e.target.value)} title="Counselor" className={dSel}>
                <option value="">Counselor</option>
                <option value="__unassigned__">Unassigned</option>
                {counselors.map(c => <option key={normalId(c)} value={normalId(c)}>{c.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            </div>
            {/* Intake */}
            <div className="relative">
              <select value={filterIntake} onChange={e => setFilterIntake(e.target.value)} title="Intake" className={dSel}>
                <option value="">Intake</option>
                {INTAKE_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            </div>
          </div>
          {/* Row 2 */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setSearch(searchInput); }}
                placeholder="Search by name, email, phone..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <button type="button" onClick={() => setSearch(searchInput)}
              className="px-5 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-sm font-semibold transition-colors shadow-sm">
              Search
            </button>
            {activeTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500 text-xs">Active filters:</span>
                {activeTags.map(tag => (
                  <span key={tag.label} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium">
                    {tag.label}
                    <button type="button" onClick={tag.clear} className="hover:text-blue-900 leading-none"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                <button type="button" onClick={clearAll} className="text-xs text-blue-600 hover:text-blue-800 underline">Clear all</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex items-center justify-center gap-3 text-gray-400">
            <Spinner size={5} /><span className="text-sm">Loading students…</span>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="w-10 px-4 py-3.5">
                      <input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="w-4 h-4 rounded cursor-pointer accent-blue-500" />
                    </th>
                    {['STUDENT', 'JOINED', 'EMAIL', 'PHONE', 'ASSIGNED TO', 'STATUS', 'ACTIONS'].map(h => (
                      <th key={h} className={`px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${h === 'ACTIONS' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-16">
                      <Users className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                      <p className="text-sm text-gray-500">{filterLead ? 'No new leads right now.' : search || filterStatus || filterCountry || filterCounselorId ? 'No students match your filters.' : 'No students yet.'}</p>
                    </td></tr>
                  ) : paginated.map((s, idx) => {
                    const id = normalId(s);
                    const words = (s.name || '').trim().split(' ');
                    const initials = words.length >= 2 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : (s.name?.slice(0, 2) || '??').toUpperCase();
                    const isActive = s.status === 'active';
                    const isToggling = togglingId === id;
                    const isAssigning = assigningIds.has(id);
                    const isDeleting = deletingId === id;
                    return (
                      <tr key={id} className="border-b border-gray-50 hover:bg-sky-50/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggleOne(id)} className="w-4 h-4 rounded cursor-pointer accent-blue-600" />
                        </td>
                        {/* Student */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 bg-gradient-to-br ${avatarPalette[idx % avatarPalette.length]} rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                                {s.leadStatus === 'new' && (
                                  <span title={'New lead · signed up via ' + (LEAD_SOURCE_LABELS[s.source] || 'the website')}
                                    className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold uppercase tracking-wide">
                                    New
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-blue-500 truncate">{s.email}</p>
                            </div>
                          </div>
                        </td>
                        {/* Joined */}
                        <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.joinedDate || '—'}</td>
                        {/* Email */}
                        <td className="px-4 py-3.5 text-sm text-blue-500 whitespace-nowrap max-w-[160px] truncate">{s.email || '—'}</td>
                        {/* Phone */}
                        <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.phone || '—'}</td>
                        {/* Assigned To */}
                        <td className="px-4 py-3.5">
                          <div className="relative inline-block">
                            <select value={s.counselorId?.toString() || ''} disabled={isAssigning}
                              onChange={e => handleInlineAssign(id, e.target.value)} title="Assign counselor"
                              className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 min-w-[100px] max-w-[130px] cursor-pointer">
                              <option value="">Unassigned</option>
                              {counselors.map(c => <option key={normalId(c)} value={normalId(c)}>{c.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                          </div>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3.5"><StatusPill status={s.status} /></td>
                        {/* Actions */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 justify-end">
                            {s.leadStatus === 'new' && (
                              <button type="button" onClick={() => handleMarkContacted(id)} disabled={markingId === id} title="Mark as contacted"
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 border border-green-200 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50">
                                {markingId === id ? <Spinner size={3} /> : <CheckCircle className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <button type="button" onClick={() => setSelectedStudent(s)} title="View details"
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors">
                              <Info className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => navigate('/admin/chat', { state: { openChatWith: { _id: id, name: s.name } } })} title="Chat"
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-sky-50 border border-sky-200 text-sky-600 hover:bg-sky-100 transition-colors">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => handleToggle(s)} disabled={isToggling} title={isActive ? 'Deactivate' : 'Activate'}
                              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${isActive ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100' : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'}`}>
                              {isToggling ? <Spinner size={3} /> : isActive ? <ToggleLeft className="w-3.5 h-3.5" /> : <ToggleRight className="w-3.5 h-3.5" />}
                            </button>
                            <button type="button" onClick={() => handleDelete(id)} disabled={isDeleting} title="Delete"
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50">
                              {isDeleting ? <Spinner size={3} /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Table footer ── */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50/40 flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Show</span>
                <div className="relative">
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} title="Entries per page"
                    className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
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
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pageNums.map((p, i) =>
                  p === '...' ? (
                    <span key={`d${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm select-none">…</span>
                  ) : (
                    <button key={p} type="button" onClick={() => setPage(p as number)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors
                        ${page === p ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                      {p}
                    </button>
                  )
                )}
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>{/* end space-y-6 */}
    </>
  );
}
