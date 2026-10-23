import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Users, UserCog, FileText, Plus, Trash2, X,
  Eye, EyeOff, Check, UserPlus, Search, ArrowRight,
  ToggleLeft, ToggleRight, GraduationCap, RefreshCw, AlertTriangle, UserCheck, MessageSquare,
  LayoutDashboard,
} from 'lucide-react';
import { api } from '../../api';
import StatusBadge from '../../components/StatusBadge';
import ActivityFeed from '../../components/ActivityFeed';
import MeetingPanel from '../../components/MeetingPanel';
import { usePortalName } from '../../hooks/usePortalName';
import TeamWorkload from '../../components/dashboards/TeamWorkload';
import Funnel from '../../components/dashboards/Funnel';
import WeeklyTrends from '../../components/dashboards/WeeklyTrends';
import LeadScores from '../../components/dashboards/LeadScores';
import ConversionReport from '../../components/dashboards/ConversionReport';
import ReferralsAdmin from '../../components/dashboards/ReferralsAdmin';

const SPECIALIZATIONS = [
  'UK Universities', 'Canada Universities', 'Australia Universities',
  'Germany', 'Netherlands', 'Singapore', 'Medical Programs', 'Engineering', 'Business',
];
const COUNTRIES = ['UK', 'Canada', 'Australia', 'Germany', 'Netherlands', 'Singapore', 'USA', 'Ireland', 'New Zealand'];
const COURSES = ['Computer Science', 'Engineering', 'Business', 'Medicine', 'Law', 'Arts', 'Data Science', 'Finance', 'Psychology'];
const EDUCATION_LEVELS = ['10th Grade (Completed)', '12th Grade (Completed)', 'Diploma (Completed)', "Bachelor's (In Progress)", "Bachelor's (Completed)", "Master's (In Progress)", "Master's (Completed)", 'PhD (In Progress)', 'PhD (Completed)', 'Other'];
const ENGLISH_TYPES = ['IELTS', 'TOEFL', 'PTE', 'Duolingo'];
const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'French', 'German', 'Spanish', 'Arabic', 'Mandarin', 'Japanese'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const COUNSELOR_DEGREES = ["Bachelor's", "Master's", 'PhD', 'Diploma', 'Certificate'];
const GRAD_YEARS = Array.from({ length: 40 }, (_, i) => String(2025 - i));

const DEFAULT_COUNSELOR_FORM = {
  name: '', email: '', password: '',
  specialization: [] as string[], experience: '',
  phone: '', nationality: '', dateOfBirth: '', gender: '',
  title: '', bio: '',
  languages: [] as string[], certifications: '',
  linkedIn: '', website: '',
  street: '', city: '', state: '', country: '', postalCode: '',
  degree: '', institution: '', graduationYear: '',
};
const DEFAULT_STUDENT_FORM = {
  name: '', email: '', password: '', phone: '', nationality: '', educationLevel: '',
  gpa: '', englishType: '', englishScore: '', budget: '',
  preferredCountries: [] as string[], interestedCourses: [] as string[], counselorId: '',
};

// ── Button primitives ────────────────────────────────────────────────────────

function BtnPrimary({ children, onClick, disabled, type = 'button', className = '', variant = 'purple' }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  type?: 'button' | 'submit'; className?: string; variant?: 'purple' | 'blue';
}) {
  const colors = variant === 'blue'
    ? 'from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 focus-visible:ring-purple-500'
    : 'from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 focus-visible:ring-purple-400';
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
        bg-linear-to-r shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
        focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2
        ${colors} ${className}`}>
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
        text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300
        active:scale-[0.98] transition-all duration-150
        focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2
        ${className}`}>
      {children}
    </button>
  );
}

function BtnClose({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400
        hover:bg-gray-100 hover:text-gray-700 active:scale-95 transition-all
        focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gray-400">
      <X className="w-4 h-4" />
    </button>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ size = 4, white = false }: { size?: number; white?: boolean }) {
  return <span className={`w-${size} h-${size} border-2 ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-gray-600'} rounded-full animate-spin inline-block`} />;
}

function normalId(obj: any) { return (obj?._id || obj?.id)?.toString() ?? ''; }

function counselorPerf(counselor: any, allStudents: any[]) {
  const assignedIds = (counselor.assignedStudents || []).map((id: any) => id.toString());
  const myStudents = allStudents.filter(s => assignedIds.includes(normalId(s)));
  const allApps = myStudents.flatMap((s: any) => s.applications || []);
  const allDocs = myStudents.flatMap((s: any) => s.documents || []);

  const offers = allApps.filter((a: any) => a.status === 'offer_received').length;
  const accepted = allApps.filter((a: any) => ['accepted', 'enrolled'].includes(a.status)).length;
  const submitted = allApps.filter((a: any) => a.status !== 'draft').length;
  const verified = allDocs.filter((d: any) => d.status === 'verified').length;

  const offerRate = submitted > 0 ? (offers + accepted) / submitted : 0;
  const docRate = allDocs.length > 0 ? verified / allDocs.length : 0;
  const portfolioRate = Math.min(myStudents.length / 8, 1);

  const score = Math.min(100, Math.round(offerRate * 45 + docRate * 30 + portfolioRate * 25));
  const tier = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Average' : 'Getting Started';
  const color = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-purple-700' : score >= 40 ? 'text-yellow-600' : 'text-gray-500';
  const bg = score >= 80 ? 'bg-green-50 border-green-200' : score >= 60 ? 'bg-purple-50 border-purple-200' : score >= 40 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200';
  const bar = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-purple-600' : score >= 40 ? 'bg-yellow-500' : 'bg-gray-400';

  return {
    score, tier, color, bg, bar,
    offers, accepted, submitted, verified,
    totalApps: allApps.length, totalDocs: allDocs.length,
    studentCount: myStudents.length,
    metrics: [
      { label: 'Offer & Acceptance Rate', value: Math.round(offerRate * 100), bar: 'bg-green-500' },
      { label: 'Document Review Rate', value: Math.round(docRate * 100), bar: 'bg-purple-600' },
      { label: 'Student Portfolio', value: Math.round(portfolioRate * 100), bar: 'bg-purple-500' },
    ],
  };
}

// ── New counselor modal ──────────────────────────────────────────────────────

function NewCounselorModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: any) => void }) {
  const [form, setForm] = useState(DEFAULT_COUNSELOR_FORM);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof DEFAULT_COUNSELOR_FORM, value: any) => setForm(f => ({ ...f, [key]: value }));
  const toggleSpec = (s: string) =>
    set('specialization', form.specialization.includes(s)
      ? form.specialization.filter(x => x !== s)
      : [...form.specialization, s]);
  const toggleLang = (l: string) =>
    set('languages', form.languages.includes(l)
      ? form.languages.filter(x => x !== l)
      : [...form.languages, l]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('Name, email and password are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const counselor = await api.admin.createCounselor({
        name: form.name.trim(), email: form.email.trim(), password: form.password,
        specialization: form.specialization, experience: parseInt(form.experience) || 0,
        phone: form.phone.trim() || undefined,
        nationality: form.nationality.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        title: form.title.trim() || undefined,
        bio: form.bio.trim() || undefined,
        languages: form.languages,
        certifications: form.certifications.split(',').map(s => s.trim()).filter(Boolean),
        linkedIn: form.linkedIn.trim() || undefined,
        website: form.website.trim() || undefined,
        address: {
          street: form.street.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          country: form.country.trim() || undefined,
          postalCode: form.postalCode.trim() || undefined,
        },
        educationBackground: {
          degree: form.degree || undefined,
          institution: form.institution.trim() || undefined,
          graduationYear: form.graduationYear || undefined,
        },
      });
      onCreated(counselor);
    } catch (err: any) { setError(err.message || 'Failed to create counselor.'); }
    setSaving(false);
  };

  const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400';
  const selectCls = `${inputCls} bg-white text-gray-700`;
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">{children}</p>
  );

  return (
    <div role="presentation" className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-linear-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-xs">
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Create New Counselor</h2>
          </div>
          <BtnClose onClick={onClose} />
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Account */}
          <SectionLabel>Account Details</SectionLabel>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Dr. Anita Sharma" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="counselor@eduabroad.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)}
                placeholder="Set a strong password" className={`${inputCls} pr-11`} />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Professional */}
          <SectionLabel>Professional Details</SectionLabel>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Job Title / Designation</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Senior Education Counselor" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Years of Experience</label>
              <input type="number" min="0" value={form.experience} onChange={e => set('experience', e.target.value)} placeholder="e.g. 5" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 9999999999" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Specialization</label>
            <div className="flex flex-wrap gap-2">
              {SPECIALIZATIONS.map(s => {
                const sel = form.specialization.includes(s);
                return (
                  <button key={s} type="button" onClick={() => toggleSpec(s)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-150 active:scale-95
                      ${sel ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400 hover:text-purple-600'}`}>
                    {sel && <Check className="w-3 h-3" />}{s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Personal Info */}
          <SectionLabel>Personal Information</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Birth</label>
              <input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} title="Date of Birth" className={selectCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Gender</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)} title="Gender" className={selectCls}>
                <option value="">Select…</option>
                {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nationality</label>
            <input value={form.nationality} onChange={e => set('nationality', e.target.value)} placeholder="e.g. Indian" className={inputCls} />
          </div>

          {/* Address */}
          <SectionLabel>Address</SectionLabel>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Street Address</label>
            <input value={form.street} onChange={e => set('street', e.target.value)} placeholder="e.g. 123 Main Street" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
              <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">State / Province</label>
              <input value={form.state} onChange={e => set('state', e.target.value)} placeholder="State" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
              <input value={form.country} onChange={e => set('country', e.target.value)} placeholder="Country" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Postal Code</label>
              <input value={form.postalCode} onChange={e => set('postalCode', e.target.value)} placeholder="e.g. 600001" className={inputCls} />
            </div>
          </div>

          {/* Education */}
          <SectionLabel>Education Background</SectionLabel>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Highest Degree</label>
            <select value={form.degree} onChange={e => set('degree', e.target.value)} title="Degree" className={selectCls}>
              <option value="">Select…</option>
              {COUNSELOR_DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Institution</label>
              <input value={form.institution} onChange={e => set('institution', e.target.value)} placeholder="University / College" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Graduation Year</label>
              <select value={form.graduationYear} onChange={e => set('graduationYear', e.target.value)} title="Graduation Year" className={selectCls}>
                <option value="">Select…</option>
                {GRAD_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Languages */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Languages Known</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(l => {
                const sel = form.languages.includes(l);
                return (
                  <button key={l} type="button" onClick={() => toggleLang(l)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-150 active:scale-95
                      ${sel ? 'bg-green-600 text-white border-green-600 shadow-xs' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400 hover:text-green-600'}`}>
                    {sel && <Check className="w-3 h-3" />}{l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Certifications */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Certifications</label>
            <input value={form.certifications} onChange={e => set('certifications', e.target.value)}
              placeholder="e.g. IELTS Trainer, British Council Certified (comma-separated)" className={inputCls} />
          </div>

          {/* About & Links */}
          <SectionLabel>About & Online Presence</SectionLabel>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">About / Bio</label>
            <textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={3}
              placeholder="Brief professional summary about the counselor…"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">LinkedIn URL</label>
              <input value={form.linkedIn} onChange={e => set('linkedIn', e.target.value)} placeholder="linkedin.com/in/…" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
              <input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://…" className={inputCls} />
            </div>
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</div>}
          <div className="flex gap-3 pt-2">
            <BtnGhost onClick={onClose} className="flex-1">Cancel</BtnGhost>
            <BtnPrimary type="submit" disabled={saving} className="flex-1">
              {saving ? <><Spinner size={4} white />Creating…</> : <><UserPlus className="w-4 h-4" />Create Counselor</>}
            </BtnPrimary>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── New student modal ────────────────────────────────────────────────────────

function NewStudentModal({ onClose, onCreated, counselors }: { onClose: () => void; onCreated: (s: any) => void; counselors: any[] }) {
  const [form, setForm] = useState(DEFAULT_STUDENT_FORM);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof DEFAULT_STUDENT_FORM, value: any) => setForm(f => ({ ...f, [key]: value }));
  const toggleArr = (key: 'preferredCountries' | 'interestedCourses', val: string) =>
    set(key, form[key].includes(val) ? form[key].filter((x: string) => x !== val) : [...form[key], val]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('Name, email and password are required.'); return;
    }
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

  return (
    <div role="presentation" className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-linear-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center shadow-xs">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Add New Student</h2>
          </div>
          <BtnClose onClick={onClose} />
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Account Details</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Aryan Sharma"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@example.com"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Set a password"
                className="w-full px-3.5 py-2.5 pr-11 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400" />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Personal Info</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 9999999999"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nationality</label>
              <input value={form.nationality} onChange={e => set('nationality', e.target.value)} placeholder="e.g. Indian"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400" />
            </div>
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Academic Profile</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Education Level</label>
            <select value={form.educationLevel} onChange={e => set('educationLevel', e.target.value)} title="Education Level"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-gray-700">
              <option value="">Select level…</option>
              {EDUCATION_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">GPA</label>
              <input type="number" step="0.01" min="0" max="10" value={form.gpa} onChange={e => set('gpa', e.target.value)} placeholder="e.g. 3.8"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Budget (USD)</label>
              <input type="number" min="0" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="e.g. 50000"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">English Test</label>
              <select value={form.englishType} onChange={e => set('englishType', e.target.value)} title="English Test Type"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-gray-700">
                <option value="">Select…</option>
                {ENGLISH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Score</label>
              <input type="number" step="0.5" value={form.englishScore} onChange={e => set('englishScore', e.target.value)} placeholder="e.g. 7.5"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Countries</label>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map(c => {
                const sel = form.preferredCountries.includes(c);
                return (
                  <button key={c} type="button" onClick={() => toggleArr('preferredCountries', c)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-150 active:scale-95
                      ${sel ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400 hover:text-purple-600'}`}>
                    {sel && <Check className="w-3 h-3" />}{c}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Interested Courses</label>
            <div className="flex flex-wrap gap-2">
              {COURSES.map(c => {
                const sel = form.interestedCourses.includes(c);
                return (
                  <button key={c} type="button" onClick={() => toggleArr('interestedCourses', c)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-150 active:scale-95
                      ${sel ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'}`}>
                    {sel && <Check className="w-3 h-3" />}{c}
                  </button>
                );
              })}
            </div>
          </div>

          {counselors.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign to Counselor</label>
              <select value={form.counselorId} onChange={e => set('counselorId', e.target.value)} title="Assign to Counselor"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-gray-700">
                <option value="">Unassigned</option>
                {counselors.map(c => <option key={normalId(c)} value={normalId(c)}>{c.name}</option>)}
              </select>
            </div>
          )}

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</div>}

          <div className="flex gap-3 pt-2">
            <BtnGhost onClick={onClose} className="flex-1">Cancel</BtnGhost>
            <BtnPrimary type="submit" disabled={saving} className="flex-1">
              {saving ? <><Spinner size={4} white />Adding…</> : <><GraduationCap className="w-4 h-4" />Add Student</>}
            </BtnPrimary>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Assign counselor to a student ───────────────────────────────────────────

function AssignCounselorModal({ student, counselors, onClose, onSaved }: {
  student: any; counselors: any[]; onClose: () => void; onSaved: () => void;
}) {
  const currentId = student.counselorId || '';
  const [selectedId, setSelectedId] = useState(currentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const unchanged = selectedId === currentId;
  const currentCounselor = counselors.find(c => normalId(c) === currentId);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await api.admin.assignCounselor(normalId(student), selectedId || null);
      onSaved();
    } catch (err: any) { setError(err.message || 'Failed to assign.'); setSaving(false); }
  };

  return (
    <div role="presentation" className="fixed inset-0 bg-black/50 backdrop-blur-xs z-60 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Assign Counselor</h2>
            <p className="text-sm text-gray-500 mt-0.5">{student.name}</p>
          </div>
          <BtnClose onClick={onClose} />
        </div>
        <div className="p-5 space-y-4">
          {currentCounselor && (
            <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2.5">
              <UserCog className="w-4 h-4 text-purple-500 shrink-0" />
              <div>
                <p className="text-xs text-purple-500 font-medium">Currently assigned to</p>
                <p className="text-sm font-semibold text-purple-900">{currentCounselor.name}</p>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {currentCounselor ? 'Reassign to' : 'Select Counselor'}
            </label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} title="Counselor"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-white text-gray-700">
              <option value="">— Unassigned —</option>
              {counselors.map(c => <option key={normalId(c)} value={normalId(c)}>{c.name}</option>)}
            </select>
          </div>
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

// ── Assign students to a counselor ───────────────────────────────────────────

function AssignStudentsModal({ counselor, students, allCounselors, onClose, onSaved }: {
  counselor: any; students: any[]; allCounselors: any[]; onClose: () => void; onSaved: () => void;
}) {
  const counselorId = normalId(counselor);
  const initialSet = new Set<string>((counselor.assignedStudents || []).map((id: any) => id.toString()));
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSet));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const filtered = students.filter(s =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toAdd = [...selected].filter(id => !initialSet.has(id));
  const toRemove = [...initialSet].filter(id => !selected.has(id));
  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      for (const sid of toAdd) await api.admin.assignCounselor(sid, counselorId);
      for (const sid of toRemove) await api.admin.assignCounselor(sid, null);
      onSaved();
    } catch (err: any) { setError(err.message || 'Failed to save.'); setSaving(false); }
  };

  const otherCounselorName = (s: any) =>
    allCounselors.find(c => normalId(c) === s.counselorId)?.name ?? 'another counselor';

  return (
    <div role="presentation" className="fixed inset-0 bg-black/50 backdrop-blur-xs z-60 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Assign Students</h2>
            <p className="text-sm text-gray-500 mt-0.5">{counselor.name}</p>
          </div>
          <BtnClose onClick={onClose} />
        </div>
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {filtered.length === 0
            ? <p className="text-sm text-gray-400 text-center py-8">No students found.</p>
            : filtered.map(s => {
              const sid = normalId(s);
              const checked = selected.has(sid);
              const elsewhere = s.counselorId && s.counselorId !== counselorId;
              return (
                <label key={sid}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors
                    ${checked ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-transparent hover:bg-gray-100'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(sid)}
                    className="w-4 h-4 accent-purple-600 shrink-0 cursor-pointer" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.email}</p>
                    {elsewhere && (
                      <p className="text-xs text-amber-600 font-medium mt-0.5">
                        Currently: {otherCounselorName(s)}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={s.status} />
                </label>
              );
            })}
        </div>
        {error && <p className="mx-4 mb-2 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
        <div className="p-4 border-t border-gray-100 flex gap-3 items-center">
          <span className="flex-1 text-xs text-gray-400">
            {hasChanges ? `+${toAdd.length} / −${toRemove.length}` : 'No changes'}
          </span>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? <><Spinner size={4} white />Saving…</> : 'Save'}
          </BtnPrimary>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard layout primitives ──────────────────────────────────────────────

// Rows shown in the Team / Students list before pointing to the full page
const ROW_LIMIT = 8;
const OFFER_STATUSES = ['offer_received', 'accepted', 'enrolled'];

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, hint, icon: Icon, to, loading, warn = false }: {
  label: string; value: React.ReactNode; hint: string; icon: React.ComponentType<{ className?: string }>;
  to: string; loading: boolean; warn?: boolean;
}) {
  return (
    <Link to={to}
      className="group bg-white/10 border border-white/20 rounded-xl p-4 backdrop-blur-xs hover:bg-white/20 transition-colors
        focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-purple-100">{label}</p>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/10
          ${warn ? 'text-amber-300' : 'text-white'}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      {loading
        ? <div className="h-8 w-16 bg-white/20 rounded-md animate-pulse mt-1" />
        : <p className="text-3xl font-bold tracking-tight text-white mt-1">{value}</p>}
      <p className={`text-xs mt-2 ${warn ? 'text-amber-300 font-medium' : 'text-purple-200'}`}>{loading ? ' ' : hint}</p>
    </Link>
  );
}

function IconBtn({ label, onClick, disabled, danger = false, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-400
        ${danger ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-purple-700 hover:bg-purple-50'}`}>
      {children}
    </button>
  );
}

function ViewBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-700 border border-purple-200 bg-white
        hover:bg-purple-50 hover:border-purple-300 transition-colors
        focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-400">
      View
    </button>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { portal } = usePortalName();
  const location = useLocation();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showNewCounselor, setShowNewCounselor] = useState(false);
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [activeTab, setActiveTab] = useState<'counselors' | 'students'>(
    location.pathname.includes('/students') ? 'students' : 'counselors'
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [assigningStudent, setAssigningStudent] = useState<any>(null);
  const [assigningCounselor, setAssigningCounselor] = useState<any>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentDateFilter, setStudentDateFilter] = useState('');
  const [counselorSearch, setCounselorSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [statsData, counselorData, studentData] = await Promise.all([
        api.admin.stats(),
        api.admin.counselors(),
        api.admin.students(),
      ]);
      setStats(statsData);
      setCounselors(counselorData);
      setStudents(studentData);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load data. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setActiveTab(location.pathname.includes('/students') ? 'students' : 'counselors');
  }, [location.pathname]);

  const handleDeleteCounselor = async (id: string) => {
    if (!window.confirm('Delete this counselor? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.admin.deleteCounselor(id);
      setCounselors(prev => prev.filter(c => normalId(c) !== id));
      setStats((s: any) => s ? { ...s, totalCounselors: s.totalCounselors - 1 } : s);
    } catch { alert('Failed to delete counselor. Please try again.'); }
    setDeletingId(null);
  };

  const handleDeleteStudent = async (id: string) => {
    if (!window.confirm('Delete this student? This cannot be undone.')) return;
    const student = students.find(s => normalId(s) === id);
    setDeletingId(id);
    try {
      await api.admin.deleteStudent(id);
      setStudents(prev => prev.filter(s => normalId(s) !== id));
      setStats((st: any) => {
        if (!st) return st;
        return {
          ...st,
          totalStudents: st.totalStudents - 1,
          activeStudents: student?.status === 'active' ? st.activeStudents - 1 : st.activeStudents,
        };
      });
    } catch { alert('Failed to delete student. Please try again.'); }
    setDeletingId(null);
  };

  const handleToggleStudentStatus = async (student: any) => {
    const id = normalId(student);
    const newStatus = student.status === 'active' ? 'inactive' : 'active';
    setTogglingId(id);
    try {
      const updated = await api.admin.updateStudentStatus(id, newStatus);
      setStudents(prev => prev.map(s => normalId(s) === id ? updated : s));
      setStats((st: any) => {
        if (!st) return st;
        return { ...st, activeStudents: st.activeStudents + (newStatus === 'active' ? 1 : -1) };
      });
    } catch { alert('Failed to update student status. Please try again.'); }
    setTogglingId(null);
  };

  const counselorNameById = Object.fromEntries(counselors.map(c => [normalId(c), c.name]));

  const filteredStudents = students.filter(s => {
    const matchesText = !studentSearch || (
      s.name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email?.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.nationality?.toLowerCase().includes(studentSearch.toLowerCase())
    );
    const matchesDate = !studentDateFilter || (
      s.joinedDate && s.joinedDate.slice(0, 10) === studentDateFilter
    );
    return matchesText && matchesDate;
  }).sort((a, b) => new Date(b.joinedDate || b.createdAt || 0).getTime() - new Date(a.joinedDate || a.createdAt || 0).getTime());

  const filteredCounselors = counselors.filter(c =>
    c.name?.toLowerCase().includes(counselorSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(counselorSearch.toLowerCase())
  ).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  // Summary figures for the stat cards
  const activeStudents = stats?.activeStudents ?? students.filter(s => s.status === 'active').length;
  const totalStudents = stats?.totalStudents ?? students.length;
  const totalCounselors = stats?.totalCounselors ?? counselors.length;
  const unassignedCount = students.filter(s => !s.counselorId).length;
  const offerCount = students.flatMap(s => s.applications || []).filter((a: any) => OFFER_STATUSES.includes(a.status)).length;
  const studentsPerMember = totalCounselors > 0 ? (students.length - unassignedCount) / totalCounselors : 0;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const isStudentsTab = activeTab === 'students';
  const listTotal = isStudentsTab ? filteredStudents.length : filteredCounselors.length;
  const visibleStudents = filteredStudents.slice(0, ROW_LIMIT);
  const visibleCounselors = filteredCounselors.slice(0, ROW_LIMIT);

  // Open the same full record pages the Students and Team pages use
  const openStudent = (id: string) => navigate(`/admin/students/${id}`, { state: { ids: filteredStudents.map(normalId) } });
  const openCounselor = (id: string) => navigate(`/admin/counselors/${id}/performance`);

  return (
    <>
      {showNewCounselor && (
        <NewCounselorModal
          onClose={() => setShowNewCounselor(false)}
          onCreated={c => {
            setCounselors(prev => [c, ...prev]);
            setStats((s: any) => s ? { ...s, totalCounselors: s.totalCounselors + 1 } : s);
            setShowNewCounselor(false);
          }}
        />
      )}
      {showNewStudent && (
        <NewStudentModal
          counselors={counselors}
          onClose={() => setShowNewStudent(false)}
          onCreated={s => {
            setStudents(prev => [s, ...prev]);
            setStats((st: any) => st ? { ...st, totalStudents: st.totalStudents + 1, activeStudents: st.activeStudents + 1 } : st);
            setShowNewStudent(false);
          }}
        />
      )}
      {assigningStudent && (
        <AssignCounselorModal
          student={assigningStudent}
          counselors={counselors}
          onClose={() => setAssigningStudent(null)}
          onSaved={() => { setAssigningStudent(null); loadData(); }}
        />
      )}
      {assigningCounselor && (
        <AssignStudentsModal
          counselor={assigningCounselor}
          students={students}
          allCounselors={counselors}
          onClose={() => setAssigningCounselor(null)}
          onSaved={() => { setAssigningCounselor(null); loadData(); }}
        />
      )}
      <div className="space-y-8">

        {/* Header */}
        <div className="bg-linear-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-xs shrink-0">
                <LayoutDashboard className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">{portal} · {today}</p>
                <h1 className="text-2xl font-bold leading-tight">Admin Dashboard</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={loadData} disabled={loading} title="Reload all figures"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/20
                  hover:bg-white/30 transition-colors disabled:opacity-50
                  focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
              </button>
              <button type="button" onClick={() => setShowNewCounselor(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/20
                  hover:bg-white/30 transition-colors
                  focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60">
                <UserPlus className="w-4 h-4" />New Counselor
              </button>
              <button type="button" onClick={() => setShowNewStudent(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-purple-700 bg-white
                  hover:bg-purple-50 shadow-xs transition-colors
                  focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60">
                <Plus className="w-4 h-4" />New Student
              </button>
            </div>
          </div>
          <p className="text-purple-200 text-sm mb-5">A summary of your students, team and applications.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Students" value={totalStudents} icon={Users} to="/admin/students" loading={loading}
              hint={`${activeStudents} active · ${Math.max(totalStudents - activeStudents, 0)} inactive`} />
            <StatCard label="Applications" value={stats?.totalApplications ?? 0} icon={FileText} to="/admin/applications" loading={loading}
              hint={`${offerCount} with an offer or acceptance`} />
            <StatCard label="Team members" value={totalCounselors} icon={UserCog} to="/admin/counselors" loading={loading}
              hint={totalCounselors > 0 ? `${studentsPerMember.toFixed(1)} students per member on average` : 'No team members yet'} />
            <StatCard label="Unassigned students" value={unassignedCount} icon={AlertTriangle} to="/admin/students" loading={loading}
              warn={unassignedCount > 0}
              hint={unassignedCount > 0 ? 'Need a counselor assigned' : 'Every student has a counselor'} />
          </div>
        </div>

        {/* Error state */}
        {loadError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-5">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Failed to load data</p>
              <p className="text-xs text-red-600 mt-0.5">{loadError}</p>
            </div>
            <button type="button" onClick={loadData}
              className="text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors">
              Retry
            </button>
          </div>
        )}

        <Section title="Pipeline" description="How leads move towards offers, and how that has changed recently.">
          <div className="grid gap-6 lg:grid-cols-2">
            <Funnel />
            <WeeklyTrends />
          </div>
          <ConversionReport />
        </Section>

        <Section title="Team & leads" description="Who is handling what, and which leads to follow up first.">
          <div className="grid gap-6 lg:grid-cols-2">
            <TeamWorkload />
            <LeadScores studentsPath="/admin/students" />
          </div>
          <ReferralsAdmin />
        </Section>

        <Section title="People" description="The newest team members and students. Use View all for the full list.">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            {/* Tabs + search */}
            <div className="flex flex-col gap-3 px-5 py-4 border-b border-gray-100 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit" role="tablist">
                {([
                  { key: 'counselors', label: 'Team', count: counselors.length },
                  { key: 'students', label: 'Students', count: students.length },
                ] as const).map(tab => (
                  <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors
                      ${activeTab === tab.key ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}>
                    {tab.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-md ${activeTab === tab.key ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-500'}`}>
                      {loading ? '…' : tab.count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  {isStudentsTab ? (
                    <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                      placeholder="Search name, email or nationality" aria-label="Search students"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  ) : (
                    <input value={counselorSearch} onChange={e => setCounselorSearch(e.target.value)}
                      placeholder="Search name or email" aria-label="Search team"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  )}
                </div>
                {isStudentsTab && (
                  <>
                    <input type="date" value={studentDateFilter} onChange={e => setStudentDateFilter(e.target.value)}
                      title="Filter by join date" aria-label="Filter by join date"
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                    {studentDateFilter && (
                      <button type="button" onClick={() => setStudentDateFilter('')}
                        className="text-xs font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                        Clear date
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Rows */}
            {loading ? (
              <div className="p-8 flex items-center justify-center gap-3 text-gray-400">
                <Spinner size={5} /><span className="text-sm">Loading…</span>
              </div>
            ) : listTotal === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                {isStudentsTab ? <Users className="w-8 h-8 mb-2 opacity-40" /> : <UserCog className="w-8 h-8 mb-2 opacity-40" />}
                <p className="text-sm">
                  {isStudentsTab
                    ? (studentSearch || studentDateFilter ? 'No students match your filters.' : 'No students yet.')
                    : (counselorSearch ? 'No team members match your search.' : 'No team members yet.')}
                </p>
              </div>
            ) : isStudentsTab ? (
              <ul className="divide-y divide-gray-100">
                {visibleStudents.map(s => {
                  const id = normalId(s);
                  const isActive = s.status === 'active';
                  const isToggling = togglingId === id;
                  const counselorName = counselorNameById[s.counselorId];
                  return (
                    <li key={id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                      <div className="w-9 h-9 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center font-semibold shrink-0">
                        {s.name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <button type="button" onClick={() => openStudent(id)}
                          className="font-medium text-gray-900 text-sm text-left hover:text-purple-700 truncate max-w-full">
                          {s.name}
                        </button>
                        <p className="text-xs text-gray-500 truncate">
                          {[s.email, s.nationality, s.educationLevel].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="hidden lg:block w-40 shrink-0">
                        <p className="text-xs text-gray-400">Counselor</p>
                        <p className={`text-sm truncate ${counselorName ? 'text-gray-700' : 'text-amber-700 font-medium'}`}>
                          {counselorName || 'Unassigned'}
                        </p>
                      </div>
                      <div className="hidden md:block w-20 shrink-0">
                        <p className="text-xs text-gray-400">Applications</p>
                        <p className="text-sm text-gray-700">{s.applications?.length ?? 0}</p>
                      </div>
                      <div className="hidden sm:block w-24 shrink-0"><StatusBadge status={s.status} /></div>
                      <div className="flex items-center gap-1 shrink-0">
                        <IconBtn label={`Chat with ${s.name}`}
                          onClick={() => navigate('/admin/chat', { state: { openChatWith: { _id: id, name: s.name } } })}>
                          <MessageSquare className="w-4 h-4" />
                        </IconBtn>
                        <IconBtn label="Assign counselor" onClick={() => setAssigningStudent(s)}>
                          <UserCheck className="w-4 h-4" />
                        </IconBtn>
                        <IconBtn label={isActive ? 'Deactivate student' : 'Activate student'} onClick={() => handleToggleStudentStatus(s)} disabled={isToggling}>
                          {isToggling ? <Spinner size={3} /> : isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </IconBtn>
                        <IconBtn label="Delete student" danger onClick={() => handleDeleteStudent(id)} disabled={deletingId === id}>
                          {deletingId === id ? <Spinner size={3} /> : <Trash2 className="w-4 h-4" />}
                        </IconBtn>
                        <ViewBtn onClick={() => openStudent(id)} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visibleCounselors.map(c => {
                  const id = normalId(c);
                  const perf = counselorPerf(c, students);
                  return (
                    <li key={id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                      <div className="w-9 h-9 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-semibold shrink-0">
                        {c.name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <button type="button" onClick={() => openCounselor(id)}
                          className="font-medium text-gray-900 text-sm text-left hover:text-purple-700 truncate max-w-full">
                          {c.name}
                        </button>
                        <p className="text-xs text-gray-500 truncate">
                          {[c.email, c.specialization?.length ? c.specialization.join(', ') : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="hidden md:block w-20 shrink-0">
                        <p className="text-xs text-gray-400">Students</p>
                        <p className="text-sm text-gray-700">{c.assignedStudents?.length ?? 0}</p>
                      </div>
                      <div className="hidden md:block w-20 shrink-0">
                        <p className="text-xs text-gray-400">Experience</p>
                        <p className="text-sm text-gray-700">{c.experience ?? 0} yrs</p>
                      </div>
                      <div className="hidden lg:block w-36 shrink-0" title="Based on offer rate, document review rate and caseload">
                        <p className="text-xs text-gray-400">Performance</p>
                        <p className={`text-sm font-medium ${perf.color}`}>{perf.score}/100 · {perf.tier}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <IconBtn label={`Chat with ${c.name}`}
                          onClick={() => navigate('/admin/chat', { state: { openChatWith: { _id: id, name: c.name } } })}>
                          <MessageSquare className="w-4 h-4" />
                        </IconBtn>
                        <IconBtn label="Assign students" onClick={() => setAssigningCounselor(c)}>
                          <UserCheck className="w-4 h-4" />
                        </IconBtn>
                        <IconBtn label="Delete team member" danger onClick={() => handleDeleteCounselor(id)} disabled={deletingId === id}>
                          {deletingId === id ? <Spinner size={3} /> : <Trash2 className="w-4 h-4" />}
                        </IconBtn>
                        <ViewBtn onClick={() => openCounselor(id)} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Footer */}
            {!loading && listTotal > 0 && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50/60 text-sm">
                <span className="text-gray-500">
                  Showing {Math.min(ROW_LIMIT, listTotal)} of {listTotal} {isStudentsTab ? 'students' : 'team members'}
                </span>
                <Link to={isStudentsTab ? '/admin/students' : '/admin/counselors'}
                  className="inline-flex items-center gap-1 font-semibold text-purple-700 hover:text-purple-800">
                  View all <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        </Section>

        <Section title="Activity" description="What is happening across the portal right now, and upcoming meetings.">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <ActivityFeed />
            </div>
            <div>
              <MeetingPanel theme="purple" meetingsPagePath="/admin/activities" />
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
