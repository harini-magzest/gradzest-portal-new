import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Plus, X, Check, UserCheck, MessageSquare,
  RefreshCw, Users, Star, TrendingUp, UserCog, ChevronDown,
  GraduationCap, BadgeCheck, Percent, ClipboardList, Pencil, Trash2,
} from 'lucide-react';
import { api } from '../../api';
import { useCallContext } from '../../context/CallContext';
import { PresenceLabel } from '../../components/Presence';
import { usePortalName } from '../../hooks/usePortalName';

// ── Constants ────────────────────────────────────────────────────────────────

const SPECIALIZATIONS = [
  'UK Universities', 'Canada Universities', 'Australia Universities',
  'Germany', 'Netherlands', 'Singapore', 'Medical Programs', 'Engineering', 'Business',
  'USA', 'Ireland', 'New Zealand',
];

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-blue-500 to-cyan-600',
  'from-orange-400 to-amber-500',
  'from-pink-500 to-rose-600',
  'from-violet-500 to-purple-600',
  'from-green-500 to-emerald-600',
  'from-red-500 to-rose-600',
];

const TITLE_OPTIONS = ['Education Counselor', 'Associate Counselor', 'Senior Counselor', 'Lead Counselor'];

const DEFAULT_FORM = {
  name: '', email: '', password: '',
  specialization: [] as string[],
  experience: '', title: '', phone: '', bio: '', smartfloAgent: '',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function normalId(obj: any) { return (obj?._id || obj?.id)?.toString() ?? ''; }

export function initials(name: string) {
  return (name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export function avatarColor(name: string) {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function counselorMetrics(counselor: any, allStudents: any[], allApplications: any[]) {
  const cid = normalId(counselor);
  const myStudents = allStudents.filter(s =>
    s.counselorId?.toString() === cid || (counselor.assignedStudents || []).includes(normalId(s))
  );
  const myStudentIds = new Set(myStudents.map(s => normalId(s)));

  const myApps = allApplications.filter(a => myStudentIds.has(a.studentId?.toString()));
  const submitted = myApps.filter(a => a.status !== 'draft').length;
  const enrolled = myApps.filter(a => ['accepted', 'enrolled'].includes(a.status)).length;
  const visaRate = submitted > 0 ? Math.round((enrolled / submitted) * 100) : 0;

  const studentCount = myStudents.length;
  const workloadPct = Math.min(100, Math.round((studentCount / 40) * 100));
  const workloadLabel =
    workloadPct >= 80 ? 'High' : workloadPct >= 50 ? 'Normal' : workloadPct >= 30 ? 'Moderate' : 'Low';
  const workloadColor =
    workloadPct >= 80 ? 'bg-red-500' : workloadPct >= 50 ? 'bg-green-500' : workloadPct >= 30 ? 'bg-amber-500' : 'bg-blue-400';
  const workloadText =
    workloadPct >= 80 ? 'text-red-600' : workloadPct >= 50 ? 'text-green-600' : workloadPct >= 30 ? 'text-amber-600' : 'text-blue-500';

  // Performance score
  const offerRate = submitted > 0 ? enrolled / submitted : 0;
  const allDocs = myStudents.flatMap(s => s.documents || []);
  const docRate = allDocs.length > 0
    ? allDocs.filter((d: any) => d.status === 'verified').length / allDocs.length : 0;
  const portfolioRate = Math.min(studentCount / 8, 1);
  const score = Math.min(100, Math.round(offerRate * 45 + docRate * 30 + portfolioRate * 25));
  const scoreColor =
    score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-amber-500' : 'bg-gray-400';
  const scoreText =
    score >= 80 ? 'text-green-600' : score >= 60 ? 'text-blue-600' : score >= 40 ? 'text-amber-600' : 'text-gray-500';

  // Enrolled student details
  const enrolledApps = myApps.filter(a => ['accepted', 'enrolled'].includes(a.status));
  const enrolledStudentIds = new Set(enrolledApps.map(a => a.studentId?.toString()));
  const enrolledStudents = myStudents.filter(s => enrolledStudentIds.has(normalId(s)));
  const submittedApps = myApps.filter(a => a.status !== 'draft');
  const rejectedApps = myApps.filter(a => a.status === 'rejected');

  return {
    studentCount, enrolled, visaRate,
    workloadPct, workloadLabel, workloadColor, workloadText,
    score, scoreColor, scoreText,
    myStudents, enrolledStudents, enrolledApps, submittedApps, rejectedApps, myApps,
  };
}

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 4, white = false }: { size?: number; white?: boolean }) {
  return (
    <span className={`w-${size} h-${size} border-2 ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-gray-600'} rounded-full animate-spin inline-block`} />
  );
}

// ── New / Edit Counselor Modal ───────────────────────────────────────────────

function CounselorFormModal({
  initial, onClose, onSaved,
}: {
  initial?: any;
  onClose: () => void;
  onSaved: (c: any) => void;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    ...DEFAULT_FORM,
    ...(initial ? {
      name: initial.name || '',
      email: initial.email || '',
      password: '',
      specialization: initial.specialization || [],
      experience: String(initial.experience || ''),
      title: initial.title || '',
      phone: initial.phone || '',
      bio: initial.bio || '',
      smartfloAgent: initial.smartfloAgent || '',
    } : {}),
  });
  // Whether the Title field shows the free-text box instead of the preset dropdown —
  // starts open when editing someone whose title isn't one of the presets.
  const [customTitle, setCustomTitle] = useState(
    Boolean(initial?.title) && !TITLE_OPTIONS.includes(initial.title)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof DEFAULT_FORM, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleSpec = (s: string) =>
    set('specialization', form.specialization.includes(s)
      ? form.specialization.filter((x: string) => x !== s)
      : [...form.specialization, s]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.'); return;
    }
    if (!isEdit && !form.password.trim()) {
      setError('Password is required for new counselors.'); return;
    }
    setSaving(true); setError('');
    try {
      let result: any;
      const payload: any = {
        name: form.name.trim(),
        email: form.email.trim(),
        specialization: form.specialization,
        experience: parseInt(form.experience) || 0,
        title: form.title.trim() || undefined,
        phone: form.phone.trim() || undefined,
        bio: form.bio.trim() || undefined,
        smartfloAgent: form.smartfloAgent.trim(),
      };
      if (!isEdit || form.password.trim()) payload.password = form.password;
      if (isEdit) {
        result = await api.admin.updateCounselor(normalId(initial), payload);
      } else {
        result = await api.admin.createCounselor(payload);
      }
      onSaved(result);
    } catch (err: any) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div role="presentation" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
              <UserCog className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? 'Edit Counselor' : 'New Counselor'}
            </h2>
          </div>
          <button aria-label="Close" type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Preethi Nair" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="counselor@example.com" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password {isEdit && <span className="text-gray-400 font-normal">(leave blank to keep unchanged)</span>}
                {!isEdit && ' *'}
              </label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Min. 8 characters'} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              {customTitle ? (
                <div className="flex gap-2">
                  <input value={form.title} onChange={e => set('title', e.target.value)}
                    placeholder="Custom title" className={inputCls} autoFocus />
                  <button type="button" onClick={() => { setCustomTitle(false); set('title', ''); }}
                    className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap shrink-0">
                    Use preset
                  </button>
                </div>
              ) : (
                <select
                  value={TITLE_OPTIONS.includes(form.title) ? form.title : ''}
                  onChange={e => {
                    if (e.target.value === '__other__') setCustomTitle(true);
                    else set('title', e.target.value);
                  }}
                  className={inputCls}
                >
                  <option value="">Select a title…</option>
                  {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__other__">Other (custom)…</option>
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Experience (years)</label>
              <input type="number" min="0" value={form.experience} onChange={e => set('experience', e.target.value)}
                placeholder="e.g. 5" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+91 98765 43210" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <input value={form.bio} onChange={e => set('bio', e.target.value)}
                placeholder="Short description" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Smartflo agent</label>
              <input value={form.smartfloAgent} onChange={e => set('smartfloAgent', e.target.value)}
                placeholder="Agent number or name in Smartflo" className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Used to match their Tata Smartflo calls on the Performance page.</p>
            </div>
          </div>

          {/* Specializations */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Specializations</label>
            <div className="flex flex-wrap gap-2">
              {SPECIALIZATIONS.map(s => {
                const sel = form.specialization.includes(s);
                return (
                  <button key={s} type="button" onClick={() => toggleSpec(s)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all active:scale-95
                      ${sel ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400 hover:text-purple-600'}`}>
                    {sel && <Check className="w-3 h-3" />}{s}
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit as any} disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-xl shadow-md disabled:opacity-50 transition-all">
            {saving ? <><Spinner size={4} white />Saving…</> : isEdit ? 'Save Changes' : 'Create Counselor'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New / Edit Application Team Member Modal ────────────────────────────────
// Deliberately just name/email/password — App Team members are plain admin accounts
// doing application processing, none of the counselor-specific fields apply.

const APPTEAM_DEFAULT_FORM = { name: '', email: '', password: '' };

function AppTeamFormModal({
  initial, onClose, onSaved,
}: {
  initial?: any;
  onClose: () => void;
  onSaved: (m: any) => void;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    ...APPTEAM_DEFAULT_FORM,
    ...(initial ? { name: initial.name || '', email: initial.email || '' } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof APPTEAM_DEFAULT_FORM, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.'); return;
    }
    if (!isEdit && !form.password.trim()) {
      setError('Password is required for new Application Team members.'); return;
    }
    setSaving(true); setError('');
    try {
      let result: any;
      if (isEdit) {
        const payload: any = { name: form.name.trim(), email: form.email.trim() };
        if (form.password.trim()) payload.password = form.password;
        result = await api.admin.updateAppTeamMember(normalId(initial), payload);
      } else {
        result = await api.admin.createAppTeamMember({
          name: form.name.trim(), email: form.email.trim(), password: form.password,
        });
      }
      onSaved(result);
    } catch (err: any) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500 focus:border-transparent';

  return (
    <div role="presentation" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-orange-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? 'Edit Application Team Member' : 'New Application Team Member'}
            </h2>
          </div>
          <button aria-label="Close" type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Meera Iyer" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="appteam@example.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {isEdit && <span className="text-gray-400 font-normal">(leave blank to keep unchanged)</span>}
              {!isEdit && ' *'}
            </label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
              placeholder={isEdit ? '••••••••' : 'Min. 8 characters'} className={inputCls} />
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit as any} disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-linear-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 rounded-xl shadow-md disabled:opacity-50 transition-all">
            {saving ? <><Spinner size={4} white />Saving…</> : isEdit ? 'Save Changes' : 'Create Member'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign Students Modal ────────────────────────────────────────────────────

function AssignStudentsModal({
  counselor, students, onClose, onSaved,
}: {
  counselor: any; students: any[]; onClose: () => void; onSaved: () => void;
}) {
  const counselorId = normalId(counselor);
  const [selected, setSelected] = useState<Set<string>>(
    new Set((counselor.assignedStudents || []).map((id: any) => id.toString()))
  );
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = students.filter(s =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const prev = new Set<string>((counselor.assignedStudents || []).map((id: any) => id.toString() as string));
      const toAdd = [...selected].filter(id => !prev.has(id));
      const toRemove = [...prev].filter(id => !selected.has(id));
      for (const sid of toAdd) await api.admin.assignCounselor(sid, counselorId);
      for (const sid of toRemove) await api.admin.assignCounselor(sid, null);
      onSaved();
    } catch { alert('Failed to save assignments.'); }
    setSaving(false);
  };

  return (
    <div role="presentation" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Assign Students</h2>
            <p className="text-sm text-gray-500 mt-0.5">to {counselor.name}</p>
          </div>
          <button aria-label="Close" type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search students…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-50">
          {filtered.map(s => {
            const id = normalId(s);
            const checked = selected.has(id);
            return (
              <label key={id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => toggle(id)}
                  className="w-4 h-4 rounded-sm border-gray-300 text-purple-600 focus:ring-purple-500" />
                <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {initials(s.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400 truncate">{s.email}</p>
                </div>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No students found</p>
          )}
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
          <span className="text-sm text-gray-500">{selected.size} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-xl shadow-md disabled:opacity-50 transition-all">
              {saving ? <><Spinner size={4} white />Saving…</> : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Counselor Detail Modal ───────────────────────────────────────────────────

function CounselorDetailModal({
  counselor, metrics, onClose, onChat, onStatClick,
}: {
  counselor: any; metrics: ReturnType<typeof counselorMetrics>; onClose: () => void; onChat: () => void;
  onStatClick?: (type: StatType) => void;
}) {
  const color = avatarColor(counselor.name);
  return (
    <div role="presentation" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Banner */}
        <div className="bg-linear-to-r from-purple-600 via-purple-700 to-indigo-700 px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 bg-linear-to-br ${color} rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg`}>
                {initials(counselor.name)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{counselor.name}</h2>
                <p className="text-purple-200 text-sm">{counselor.title || 'Education Counselor'}</p>
                {counselor.email && <p className="text-purple-300 text-xs mt-0.5">{counselor.email}</p>}
              </div>
            </div>
            <button aria-label="Close" type="button" onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white transition-all shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {([
              { key: 'students' as StatType, label: 'Students', value: metrics.studentCount },
              { key: 'enrolled' as StatType, label: 'Enrolled', value: metrics.enrolled },
              { key: 'visa'     as StatType, label: 'Visa Rate', value: `${metrics.visaRate}%` },
            ]).map(stat => (
              <button key={stat.key} type="button" disabled={!onStatClick} onClick={() => onStatClick?.(stat.key)}
                className={`bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-center transition-colors ${onStatClick ? 'hover:bg-white/20 cursor-pointer' : ''}`}>
                <p className="text-lg font-bold text-white">{stat.value}</p>
                <p className="text-xs text-purple-200 mt-0.5">{stat.label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {counselor.specialization?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Specializations</p>
              <div className="flex flex-wrap gap-2">
                {counselor.specialization.map((s: string) => (
                  <span key={s} className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full font-medium border border-purple-100">{s}</span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {counselor.phone && (
              <div><span className="text-gray-400">Phone: </span><span className="text-gray-800">{counselor.phone}</span></div>
            )}
            {counselor.experience !== undefined && counselor.experience !== null && (
              <div><span className="text-gray-400">Experience: </span><span className="text-gray-800">{counselor.experience} years</span></div>
            )}
          </div>
          {counselor.bio && (
            <p className="text-sm text-gray-600">{counselor.bio}</p>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Performance Score</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${metrics.scoreColor}`} style={{ width: `${metrics.score}%` }} />
              </div>
              <span className={`text-sm font-bold ${metrics.scoreText}`}>{metrics.score}/100</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Workload</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${metrics.workloadColor}`} style={{ width: `${metrics.workloadPct}%` }} />
              </div>
              <span className={`text-sm font-semibold ${metrics.workloadText}`}>
                {metrics.workloadLabel} — {metrics.workloadPct}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 pb-5">
          <button type="button" onClick={onChat}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 transition-colors">
            <MessageSquare className="w-4 h-4" />Chat
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border text-gray-700 bg-white border-gray-200 hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Counselor Profile Card (inline, used on the Performance page) ────────────

export function CounselorProfileCard({
  counselor, metrics, onChat, onStatClick,
}: {
  counselor: any; metrics: ReturnType<typeof counselorMetrics>; onChat: () => void;
  onStatClick: (type: StatType) => void;
}) {
  const color = avatarColor(counselor.name);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
      {/* Banner */}
      <div className="bg-linear-to-r from-purple-600 via-purple-700 to-indigo-700 px-6 py-5 flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-4 flex-1 min-w-[240px]">
          <div className={`w-16 h-16 bg-linear-to-br ${color} rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shrink-0`}>
            {initials(counselor.name)}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{counselor.name}</h2>
            <p className="text-purple-200 text-sm">{counselor.title || 'Education Counselor'}</p>
            {counselor.email && <p className="text-purple-300 text-xs mt-0.5 truncate">{counselor.email}</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 w-full sm:w-auto">
          {([
            { key: 'students' as StatType, label: 'Students', value: metrics.studentCount },
            { key: 'enrolled' as StatType, label: 'Enrolled', value: metrics.enrolled },
            { key: 'visa'     as StatType, label: 'Visa Rate', value: `${metrics.visaRate}%` },
          ]).map(stat => (
            <button key={stat.key} type="button" onClick={() => onStatClick(stat.key)}
              className="bg-white/10 border border-white/20 rounded-xl px-5 py-2.5 text-center hover:bg-white/20 transition-colors">
              <p className="text-lg font-bold text-white">{stat.value}</p>
              <p className="text-xs text-purple-200 mt-0.5">{stat.label}</p>
            </button>
          ))}
        </div>
        <button type="button" onClick={onChat}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white text-indigo-700 hover:bg-indigo-50 transition-colors">
          <MessageSquare className="w-4 h-4" />Chat
        </button>
      </div>

      {/* Body */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {counselor.specialization?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Specializations</p>
              <div className="flex flex-wrap gap-2">
                {counselor.specialization.map((s: string) => (
                  <span key={s} className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full font-medium border border-purple-100">{s}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {counselor.phone && (
              <div><span className="text-gray-400">Phone: </span><span className="text-gray-800">{counselor.phone}</span></div>
            )}
            {counselor.experience !== undefined && counselor.experience !== null && (
              <div><span className="text-gray-400">Experience: </span><span className="text-gray-800">{counselor.experience} years</span></div>
            )}
          </div>
          {counselor.bio && <p className="text-sm text-gray-600">{counselor.bio}</p>}
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Performance Score</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${metrics.scoreColor}`} style={{ width: `${metrics.score}%` }} />
              </div>
              <span className={`text-sm font-bold ${metrics.scoreText}`}>{metrics.score}/100</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Workload</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${metrics.workloadColor}`} style={{ width: `${metrics.workloadPct}%` }} />
              </div>
              <span className={`text-sm font-semibold ${metrics.workloadText}`}>
                {metrics.workloadLabel} — {metrics.workloadPct}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  active:         { bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500',   label: 'Active' },
  inactive:       { bg: 'bg-gray-100',    text: 'text-gray-600',    dot: 'bg-gray-400',    label: 'Inactive' },
  enrolled:       { bg: 'bg-indigo-100',  text: 'text-indigo-700',  dot: 'bg-indigo-500',  label: 'Enrolled' },
  accepted:       { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'Accepted' },
  submitted:      { bg: 'bg-sky-100',     text: 'text-sky-700',     dot: 'bg-sky-500',     label: 'Submitted' },
  under_review:   { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Under Review' },
  offer_received: { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500',  label: 'Offer Received' },
  rejected:       { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Rejected' },
  draft:          { bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-400',    label: 'Draft' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_COLORS[status] || { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400', label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── Student Info Modal ───────────────────────────────────────────────────────

type StudentTab = 'personal' | 'applications' | 'documents' | 'more';

const APP_STATUS: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft:          { label: 'Draft',          bg: 'bg-gray-100',    text: 'text-gray-600',   dot: 'bg-gray-400' },
  submitted:      { label: 'Submitted',      bg: 'bg-sky-100',     text: 'text-sky-700',    dot: 'bg-sky-500' },
  under_review:   { label: 'Under Review',   bg: 'bg-amber-100',   text: 'text-amber-700',  dot: 'bg-amber-500' },
  offer_received: { label: 'Offer Received', bg: 'bg-purple-100',  text: 'text-purple-700', dot: 'bg-purple-500' },
  accepted:       { label: 'Accepted',       bg: 'bg-blue-100',    text: 'text-blue-700',   dot: 'bg-blue-500' },
  rejected:       { label: 'Rejected',       bg: 'bg-red-100',     text: 'text-red-700',    dot: 'bg-red-500' },
  enrolled:       { label: 'Enrolled',       bg: 'bg-indigo-100',  text: 'text-indigo-700', dot: 'bg-indigo-500' },
};

function StudentInfoModal({ student, onClose }: { student: any; onClose: () => void }) {
  const [tab, setTab] = useState<StudentTab>('personal');
  const apps: any[] = student.applications || [];
  const docs: any[] = student.documents || [];

  function InfoRow({ label, value }: { label: string; value?: any }) {
    if (value === null || value === undefined || value === '') return null;
    return (
      <div className="flex gap-3 py-2.5 border-b border-gray-100 last:border-0">
        <span className="text-xs text-gray-400 w-36 shrink-0 pt-0.5">{label}</span>
        <span className="text-sm text-gray-800 font-medium flex-1">{String(value)}</span>
      </div>
    );
  }

  const TABS: { key: StudentTab; label: string; badge?: number | string }[] = [
    { key: 'personal',     label: 'Personal Info' },
    { key: 'applications', label: 'Applications', badge: apps.length },
    { key: 'documents',    label: 'Documents',    badge: docs.length },
    { key: 'more',         label: 'More Info' },
  ];

  return (
    <div role="presentation" className="fixed inset-0 bg-black/70 backdrop-blur-xs z-60 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Banner */}
        <div className="bg-linear-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 pt-5 pb-4 shrink-0 rounded-t-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 border border-white/30 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg shrink-0">
                {initials(student.name)}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">{student.name}</h2>
                <p className="text-blue-200 text-xs mt-0.5">{student.email}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <StatusPill status={student.status || 'active'} />
                  {student.nationality && (
                    <span className="text-xs bg-white/15 text-white px-2 py-0.5 rounded-full font-medium border border-white/20">
                      {student.nationality}
                    </span>
                  )}
                  {student.educationLevel && (
                    <span className="text-xs bg-white/15 text-white px-2 py-0.5 rounded-full font-medium border border-white/20">
                      {student.educationLevel}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button aria-label="Close" type="button" onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white transition-all shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Clickable quick-stat cards */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {([
              { key: 'applications' as StudentTab, label: 'Applications', value: apps.length },
              { key: 'documents'    as StudentTab, label: 'Documents',    value: docs.length },
              { key: 'personal'     as StudentTab, label: 'GPA',          value: student.gpa ?? '—' },
              { key: 'more'         as StudentTab, label: 'Budget',        value: student.budget ? `$${Number(student.budget).toLocaleString()}` : '—' },
            ]).map(card => (
              <button key={card.key} type="button" onClick={() => setTab(card.key)}
                className={`rounded-xl px-2 py-2.5 text-center transition-all border
                  ${tab === card.key
                    ? 'bg-white border-white shadow-md'
                    : 'bg-white/10 border-white/20 hover:bg-white/20'}`}>
                <p className={`text-base font-bold leading-tight ${tab === card.key ? 'text-blue-700' : 'text-white'}`}>
                  {card.value}
                </p>
                <p className={`text-[10px] font-medium mt-0.5 ${tab === card.key ? 'text-blue-500' : 'text-blue-200'}`}>
                  {card.label}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 px-2 shrink-0 bg-gray-50/60">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap
                ${tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
              {t.badge !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── Personal Info ── */}
          {tab === 'personal' && (
            <div className="p-5 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Personal Information</p>
              <div className="bg-gray-50 rounded-2xl px-4 py-1 border border-gray-100">
                <InfoRow label="Full Name"     value={student.name} />
                <InfoRow label="Email"         value={student.email} />
                <InfoRow label="Phone"         value={student.phone} />
                <InfoRow label="Nationality"   value={student.nationality} />
                <InfoRow label="Date of Birth" value={student.dateOfBirth} />
                <InfoRow label="Gender"        value={student.gender} />
                <InfoRow label="Status"        value={student.status} />
                <InfoRow label="Joined Date"   value={student.joinedDate} />
              </div>
              <div className="pt-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Academic Profile</p>
                <div className="bg-gray-50 rounded-2xl px-4 py-1 border border-gray-100">
                  <InfoRow label="Education Level" value={student.educationLevel} />
                  <InfoRow label="GPA"             value={student.gpa} />
                  <InfoRow label="English Test"    value={student.englishScore?.type} />
                  <InfoRow label="English Score"   value={student.englishScore?.score} />
                  <InfoRow label="Budget"          value={student.budget ? `$${Number(student.budget).toLocaleString()}` : undefined} />
                </div>
              </div>
            </div>
          )}

          {/* ── Applications ── */}
          {tab === 'applications' && (
            <div className="p-5">
              {apps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                  <GraduationCap className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No applications yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...apps].sort((a: any, b: any) => new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime() - new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime()).map((app: any, i: number) => {
                    const st = APP_STATUS[app.status] || { label: app.status, bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
                    return (
                      <div key={app._id || i} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{app.universityName || 'Unknown University'}</p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{app.courseName || '—'}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap shrink-0 ${st.bg} ${st.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                          {app.intake && <p className="text-xs text-gray-400">Intake: <span className="text-gray-600 font-medium">{app.intake}</span></p>}
                          {app.submittedDate && <p className="text-xs text-gray-400">Submitted: <span className="text-gray-600 font-medium">{app.submittedDate}</span></p>}
                          {app.studyMode && <p className="text-xs text-gray-400">Mode: <span className="text-gray-600 font-medium">{app.studyMode}</span></p>}
                          {app.notes && <p className="text-xs text-gray-400 col-span-2 mt-1">Notes: <span className="text-gray-600">{app.notes}</span></p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Documents ── */}
          {tab === 'documents' && (
            <div className="p-5">
              {docs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                  <BadgeCheck className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No documents uploaded</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {docs.map((doc: any, i: number) => (
                    <div key={doc._id || i} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-100">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                        ${doc.status === 'verified' ? 'bg-green-100' : doc.status === 'rejected' ? 'bg-red-100' : 'bg-amber-100'}`}>
                        <BadgeCheck className={`w-4 h-4 ${doc.status === 'verified' ? 'text-green-600' : doc.status === 'rejected' ? 'text-red-600' : 'text-amber-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{doc.name || doc.type || 'Document'}</p>
                        {doc.uploadedDate && <p className="text-xs text-gray-400 mt-0.5">Uploaded: {doc.uploadedDate}</p>}
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0
                        ${doc.status === 'verified' ? 'bg-green-100 text-green-700' :
                          doc.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {doc.status ? doc.status.charAt(0).toUpperCase() + doc.status.slice(1) : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── More Info ── */}
          {tab === 'more' && (
            <div className="p-5 space-y-5">
              {student.preferredCountries?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Preferred Countries</p>
                  <div className="flex flex-wrap gap-2">
                    {student.preferredCountries.map((c: string) => (
                      <span key={c} className="text-xs bg-sky-50 text-blue-700 px-3 py-1.5 rounded-full font-medium border border-blue-100">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {student.interestedCourses?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Interested Courses</p>
                  <div className="flex flex-wrap gap-2">
                    {student.interestedCourses.map((c: string) => (
                      <span key={c} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full font-medium border border-indigo-100">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Financial & Budget</p>
                <div className="bg-gray-50 rounded-2xl px-4 py-1 border border-gray-100">
                  <InfoRow label="Budget" value={student.budget ? `$${Number(student.budget).toLocaleString()}` : undefined} />
                  <InfoRow label="Counselor ID" value={student.counselorId} />
                </div>
              </div>
              {!student.preferredCountries?.length && !student.interestedCourses?.length && !student.budget && (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <Users className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No additional information</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Counselor Stats Modal ─────────────────────────────────────────────────────

export type StatType = 'students' | 'enrolled' | 'visa';

export function CounselorStatsModal({
  counselor, metrics, type, onClose,
}: {
  counselor: any;
  metrics: ReturnType<typeof counselorMetrics>;
  type: StatType;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<StatType>(type);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const tabs: { key: StatType; label: string; icon: React.ReactNode; count: number | string }[] = [
    { key: 'students', label: 'Students',  icon: <Users className="w-3.5 h-3.5" />,      count: metrics.studentCount },
    { key: 'enrolled', label: 'Enrolled',  icon: <BadgeCheck className="w-3.5 h-3.5" />, count: metrics.enrolled },
    { key: 'visa',     label: 'Visa Rate', icon: <Percent className="w-3.5 h-3.5" />,     count: `${metrics.visaRate}%` },
  ];

  return (
    <>
    {selectedStudent && (
      <StudentInfoModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
    )}
    <div role="presentation" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{counselor.name}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{counselor.title || 'Education Counselor'}</p>
          </div>
          <button aria-label="Close" type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-0 shrink-0">
          {tabs.map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition-all
                ${activeTab === tab.key
                  ? 'border-purple-600 text-purple-700 bg-purple-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              {tab.icon}{tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold
                ${activeTab === tab.key ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 border-t border-gray-100">

          {/* Students tab */}
          {activeTab === 'students' && (
            <div className="divide-y divide-gray-50">
              {metrics.myStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Users className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No students assigned yet</p>
                </div>
              ) : metrics.myStudents.map((s: any) => (
                <button key={normalId(s)} type="button" onClick={() => setSelectedStudent(s)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-blue-50 active:bg-blue-100 transition-colors text-left group">
                  <div className="w-9 h-9 bg-linear-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {initials(s.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 truncate transition-colors">{s.name}</p>
                    <p className="text-xs text-gray-400 truncate">{s.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{s.applications?.length ?? 0} apps</span>
                    <StatusPill status={s.status || 'active'} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Enrolled tab */}
          {activeTab === 'enrolled' && (
            <div className="divide-y divide-gray-50">
              {metrics.enrolledApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <BadgeCheck className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No enrolled students yet</p>
                </div>
              ) : metrics.enrolledApps.map((app: any, i: number) => {
                const student = metrics.myStudents.find((s: any) => normalId(s) === app.studentId?.toString());
                return (
                  <button key={app._id || i} type="button"
                    onClick={() => student && setSelectedStudent(student)}
                    className="w-full flex items-start gap-3 px-5 py-3 hover:bg-green-50 active:bg-green-100 transition-colors text-left group">
                    <div className="w-9 h-9 bg-linear-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5">
                      {initials(student?.name || '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 group-hover:text-green-700 truncate transition-colors">
                        {student?.name || 'Unknown Student'}
                      </p>
                      <p className="text-xs text-gray-500 truncate font-medium">{app.universityName || '—'}</p>
                      <p className="text-xs text-gray-400 truncate">{app.courseName || '—'}</p>
                    </div>
                    <StatusPill status={app.status} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Visa Rate tab */}
          {activeTab === 'visa' && (
            <div className="p-5 space-y-5">
              {/* Big rate display */}
              <div className="bg-linear-to-br from-purple-50 to-indigo-50 rounded-2xl p-5 text-center border border-purple-100">
                <p className="text-5xl font-black text-purple-700">{metrics.visaRate}%</p>
                <p className="text-sm text-purple-500 font-medium mt-1">Visa Success Rate</p>
              </div>

              {/* Breakdown cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Submitted', value: metrics.submittedApps.length, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
                  { label: 'Enrolled', value: metrics.enrolledApps.length, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-100' },
                  { label: 'Rejected', value: metrics.rejectedApps.length, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-100' },
                ].map(card => (
                  <div key={card.label} className={`${card.bg} border ${card.border} rounded-xl p-3 text-center`}>
                    <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${card.color}`}>{card.label}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1.5">
                  <span>Conversion rate</span>
                  <span>{metrics.enrolledApps.length} / {metrics.submittedApps.length} apps</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-linear-to-r from-purple-500 to-indigo-500 rounded-full transition-all"
                    style={{ width: `${metrics.visaRate}%` }} />
                </div>
              </div>

              {/* Per-student breakdown */}
              {metrics.myStudents.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Student Breakdown</p>
                  <div className="space-y-2">
                    {metrics.myStudents.map((s: any) => {
                      const sApps = metrics.myApps.filter((a: any) => a.studentId?.toString() === normalId(s));
                      const sEnrolled = sApps.filter((a: any) => ['accepted', 'enrolled'].includes(a.status)).length;
                      const sSubmitted = sApps.filter((a: any) => a.status !== 'draft').length;
                      const rate = sSubmitted > 0 ? Math.round((sEnrolled / sSubmitted) * 100) : null;
                      return (
                        <button key={normalId(s)} type="button" onClick={() => setSelectedStudent(s)}
                          className="w-full flex items-center gap-3 bg-gray-50 hover:bg-purple-50 rounded-xl px-3 py-2 transition-colors text-left group">
                          <div className="w-7 h-7 bg-linear-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                            {initials(s.name)}
                          </div>
                          <p className="text-xs font-medium text-gray-800 group-hover:text-purple-700 flex-1 min-w-0 truncate transition-colors">{s.name}</p>
                          <span className="text-xs text-gray-400 shrink-0">{sSubmitted} apps</span>
                          {rate !== null ? (
                            <span className={`text-xs font-bold shrink-0 ${rate >= 50 ? 'text-green-600' : 'text-amber-600'}`}>{rate}%</span>
                          ) : (
                            <span className="text-xs text-gray-300 shrink-0">—</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AdminCounselors() {
  const { portal } = usePortalName();
  const navigate = useNavigate();
  const [activeRole, setActiveRole] = useState<'counselor' | 'appteam'>('counselor');
  const [counselors, setCounselors] = useState<any[]>([]);
  const [appTeamMembers, setAppTeamMembers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [filterSpec, setFilterSpec] = useState('');
  const [onlyOnline, setOnlyOnline] = useState(false);
  const { isOnline } = useCallContext();
  const [showSpecMenu, setShowSpecMenu] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [assigning, setAssigning] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statsModal, setStatsModal] = useState<{ counselor: any; type: StatType } | null>(null);
  const [showCreateAppTeam, setShowCreateAppTeam] = useState(false);
  const [editingAppTeam, setEditingAppTeam] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [c, s, a, at] = await Promise.all([
        api.admin.counselors(),
        api.admin.students(),
        api.admin.applications(),
        api.admin.appteamUsers(),
      ]);
      setCounselors(c); setStudents(s); setApplications(a);
      setAppTeamMembers(at.filter((u: any) => u.isAppTeam));
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ?view=<id> (from the top search) opens that Application Team member's profile
  const [params, setParams] = useSearchParams();
  const viewId = params.get('view');
  useEffect(() => {
    if (!viewId || loading) return;
    const member = appTeamMembers.find(m => normalId(m) === viewId);
    if (member) { setActiveRole('appteam'); setEditingAppTeam(member); }
    setParams(p => { p.delete('view'); return p; }, { replace: true });
  }, [viewId, loading, appTeamMembers, setParams]);

  // Compute metrics for each counselor
  const metricsMap = useMemo(() => {
    const m: Record<string, ReturnType<typeof counselorMetrics>> = {};
    for (const c of counselors) {
      m[normalId(c)] = counselorMetrics(c, students, applications);
    }
    return m;
  }, [counselors, students, applications]);

  // Top-level stats
  const totalCounselors = counselors.length;
  const avgStudents = totalCounselors > 0
    ? Math.round(counselors.reduce((sum, c) => sum + (c.assignedStudents?.length ?? 0), 0) / totalCounselors)
    : 0;
  const topPerformer = counselors.reduce<any>((best, c) => {
    const score = metricsMap[normalId(c)]?.score ?? 0;
    return !best || score > (metricsMap[normalId(best)]?.score ?? 0) ? c : best;
  }, null);
  const unassignedStudents = students.filter(s => !s.counselorId).length;

  // Filter + sort
  const filtered = useMemo(() => {
    let list = counselors.filter(c => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q) && !c.phone?.toLowerCase().includes(q)) return false;
      }
      if (filterSpec && !(c.specialization || []).some((s: string) => s.toLowerCase().includes(filterSpec.toLowerCase()))) return false;
      if (onlyOnline && !isOnline(normalId(c))) return false;
      return true;
    });
    // Online counselors first, then by performance score
    list = [...list].sort((a, b) =>
      Number(isOnline(normalId(b))) - Number(isOnline(normalId(a))) ||
      (metricsMap[normalId(b)]?.score ?? 0) - (metricsMap[normalId(a)]?.score ?? 0)
    );
    return list;
  }, [counselors, search, filterSpec, metricsMap, onlyOnline, isOnline]);
  const onlineCount = counselors.filter(c => isOnline(normalId(c))).length;

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this counselor? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.admin.deleteCounselor(id);
      setCounselors(prev => prev.filter(c => normalId(c) !== id));
    } catch { alert('Failed to delete counselor.'); }
    setDeletingId(null);
  };

  // Filtered Application Team list — search only, none of the counselor-specific filters apply
  const filteredAppTeam = useMemo(() => {
    const q = search.toLowerCase();
    return appTeamMembers
      .filter(m => !q || m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q))
      .filter(m => !onlyOnline || isOnline(normalId(m)))
      .sort((a, b) => Number(isOnline(normalId(b))) - Number(isOnline(normalId(a))));
  }, [appTeamMembers, search, onlyOnline, isOnline]);
  const appTeamOnlineCount = appTeamMembers.filter(m => isOnline(normalId(m))).length;

  const handleDeleteAppTeam = async (id: string) => {
    if (!window.confirm('Delete this Application Team member? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.admin.deleteAppTeamMember(id);
      setAppTeamMembers(prev => prev.filter(m => normalId(m) !== id));
    } catch { alert('Failed to delete Application Team member.'); }
    setDeletingId(null);
  };

return (
    <>
      {/* Modals */}
      {showCreate && (
        <CounselorFormModal
          onClose={() => setShowCreate(false)}
          onSaved={c => { setCounselors(prev => [...prev, c]); setShowCreate(false); }}
        />
      )}
      {editing && (
        <CounselorFormModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={updated => { setCounselors(prev => prev.map(c => normalId(c) === normalId(updated) ? updated : c)); setEditing(null); }}
        />
      )}
      {viewing && (
        <CounselorDetailModal
          counselor={viewing}
          metrics={metricsMap[normalId(viewing)] ?? counselorMetrics(viewing, students, applications)}
          onClose={() => setViewing(null)}
          onChat={() => {
            navigate('/admin/chat', { state: { openChatWith: { _id: normalId(viewing), name: viewing.name } } });
            setViewing(null);
          }}
          onStatClick={type => { setStatsModal({ counselor: viewing, type }); setViewing(null); }}
        />
      )}
      {statsModal && (
        <CounselorStatsModal
          counselor={statsModal.counselor}
          metrics={metricsMap[normalId(statsModal.counselor)] ?? counselorMetrics(statsModal.counselor, students, applications)}
          type={statsModal.type}
          onClose={() => setStatsModal(null)}
        />
      )}
      {assigning && (
        <AssignStudentsModal
          counselor={assigning}
          students={students}
          onClose={() => setAssigning(null)}
          onSaved={() => { setAssigning(null); loadData(); }}
        />
      )}
      {showCreateAppTeam && (
        <AppTeamFormModal
          onClose={() => setShowCreateAppTeam(false)}
          onSaved={m => { setAppTeamMembers(prev => [...prev, m]); setShowCreateAppTeam(false); }}
        />
      )}
      {editingAppTeam && (
        <AppTeamFormModal
          initial={editingAppTeam}
          onClose={() => setEditingAppTeam(null)}
          onSaved={updated => { setAppTeamMembers(prev => prev.map(m => normalId(m) === normalId(updated) ? updated : m)); setEditingAppTeam(null); }}
        />
      )}

      <div className="space-y-6">

        {/* Header */}
        <div className="bg-linear-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-xs">
                {activeRole === 'counselor' ? <UserCog className="w-5 h-5 text-white" /> : <ClipboardList className="w-5 h-5 text-white" />}
              </div>
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
                <h1 className="text-2xl font-bold leading-tight">Team</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={loadData} disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
              </button>
              <button type="button" onClick={() => activeRole === 'counselor' ? setShowCreate(true) : setShowCreateAppTeam(true)}
                className="flex items-center gap-2 px-3 py-2 bg-white text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-50 transition-colors shadow-xs">
                <Plus className="w-4 h-4" />{activeRole === 'counselor' ? 'New Counselor' : 'New Application Team Member'}
              </button>
            </div>
          </div>

          {/* Role tabs */}
          <div className="flex gap-1 mt-5 bg-black/15 rounded-xl p-1 w-fit">
            <button type="button" onClick={() => setActiveRole('counselor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeRole === 'counselor' ? 'bg-white text-purple-700 shadow-xs' : 'text-purple-100 hover:text-white'
              }`}>
              <UserCog className="w-4 h-4" />Counselors
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeRole === 'counselor' ? 'bg-purple-100 text-purple-700' : 'bg-white/15'}`}>{counselors.length}</span>
            </button>
            <button type="button" onClick={() => setActiveRole('appteam')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeRole === 'appteam' ? 'bg-white text-purple-700 shadow-xs' : 'text-purple-100 hover:text-white'
              }`}>
              <ClipboardList className="w-4 h-4" />Application Team
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeRole === 'appteam' ? 'bg-purple-100 text-purple-700' : 'bg-white/15'}`}>{appTeamMembers.length}</span>
            </button>
          </div>
        </div>

        {/* Error */}
        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-red-700">
            {loadError}
            <button type="button" onClick={loadData} className="ml-auto font-semibold underline">Retry</button>
          </div>
        )}

        {/* Stat cards */}
        {!loading && activeRole === 'counselor' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                icon: <UserCog className="w-5 h-5 text-purple-600" />,
                bg: 'bg-purple-50',
                label: 'Total counselors',
                value: totalCounselors,
                sub: 'All active',
                subColor: 'text-green-600',
              },
              {
                icon: <Users className="w-5 h-5 text-purple-600" />,
                bg: 'bg-purple-50',
                label: 'Avg students',
                value: avgStudents,
                sub: 'per counselor',
                subColor: 'text-gray-500',
              },
              {
                icon: <Star className="w-5 h-5 text-purple-500" />,
                bg: 'bg-purple-50',
                label: 'Top performer',
                value: topPerformer?.name
                  ? topPerformer.name.split(' ')[0] + (topPerformer.name.split(' ')[1] ? ' ' + topPerformer.name.split(' ')[1][0] + '.' : '')
                  : '—',
                sub: topPerformer ? `Score ${metricsMap[normalId(topPerformer)]?.score ?? 0}` : '—',
                subColor: 'text-green-600',
              },
              {
                icon: <TrendingUp className="w-5 h-5 text-purple-500" />,
                bg: 'bg-purple-50',
                label: 'Unassigned students',
                value: unassignedStudents,
                sub: unassignedStudents > 0 ? 'Needs action' : 'All assigned',
                subColor: unassignedStudents > 0 ? 'text-rose-600' : 'text-green-600',
              },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-2xl border border-purple-100 shadow-xs p-4 flex items-start gap-3 hover:border-purple-300 hover:shadow-md transition-all">
                <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center shrink-0`}>
                  {card.icon}
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900 leading-tight">{card.value}</p>
                  <p className={`text-xs font-semibold mt-0.5 ${card.subColor}`}>{card.sub}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && activeRole === 'appteam' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-orange-100 shadow-xs p-4 flex items-start gap-3">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Application Team members</p>
                <p className="text-2xl font-bold text-gray-900 leading-tight">{appTeamMembers.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        {!loading && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={activeRole === 'counselor' ? 'Search by name, email or phone...' : 'Search by name or email...'}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-xs" />
            </div>

            {/* Specialization dropdown — counselors only, App Team has no specialization field */}
            {activeRole === 'counselor' && (
              <div className="relative">
                <button type="button" onClick={() => setShowSpecMenu(v => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-xs transition-colors">
                  {filterSpec || 'Specialization'}<ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showSpecMenu && (
                  <div className="absolute top-full mt-1 left-0 bg-white rounded-xl border border-gray-200 shadow-lg z-10 min-w-[200px] py-1">
                    <button type="button" onClick={() => { setFilterSpec(''); setShowSpecMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">All specializations</button>
                    {SPECIALIZATIONS.map(s => (
                      <button key={s} type="button" onClick={() => { setFilterSpec(s); setShowSpecMenu(false); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${filterSpec === s ? 'text-purple-700 font-semibold' : 'text-gray-700'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}


            {/* Live presence: how many counselors / App Team members have Gradzest open right now */}
            {(() => {
              const n = activeRole === 'counselor' ? onlineCount : appTeamOnlineCount;
              const total = activeRole === 'counselor' ? counselors.length : appTeamMembers.length;
              return (
                <button type="button" onClick={() => setOnlyOnline(v => !v)} aria-pressed={onlyOnline}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border shadow-xs transition-colors ${
                    onlyOnline ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${n > 0 ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
                  {n} of {total} online{onlyOnline ? ' · showing online only' : ''}
                </button>
              );
            })()}

{(search || filterSpec || onlyOnline) && (
              <button type="button" onClick={() => { setSearch(''); setFilterSpec(''); setOnlyOnline(false); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors border border-dashed border-gray-200">
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded-sm w-3/4" />
                    <div className="h-3 bg-gray-100 rounded-sm w-1/2" />
                  </div>
                </div>
                <div className="h-3 bg-gray-100 rounded-sm w-full" />
                <div className="h-3 bg-gray-100 rounded-sm w-4/5" />
                <div className="flex gap-2 pt-1">
                  <div className="h-7 bg-gray-100 rounded-lg flex-1" />
                  <div className="h-7 bg-gray-100 rounded-lg flex-1" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grid — Counselors */}
        {activeRole === 'counselor' && (!loading && filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-14 flex flex-col items-center justify-center text-gray-400">
            <UserCog className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">{search || filterSpec ? 'No counselors match your search.' : 'No counselors yet.'}</p>
            {!search && !filterSpec && (
              <button type="button" onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors">
                <Plus className="w-4 h-4" />Add first counselor
              </button>
            )}
          </div>
        ) : !loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
            <div className="divide-y divide-gray-50">
              {filtered.map(c => {
                const id = normalId(c);
                const color = avatarColor(c.name);
                const tags = (c.specialization || []).slice(0, 2);
                return (
                  <div key={id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
                    <button type="button" onClick={() => navigate(`/admin/counselors/${id}/performance`)} aria-label={`Open ${c.name}'s profile`}
                      className={`w-11 h-11 bg-linear-to-br ${color} rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                      {initials(c.name)}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => navigate(`/admin/counselors/${id}/performance`)}
                          className="text-sm font-semibold text-gray-900 truncate hover:text-purple-700 hover:underline transition-colors">
                          {c.name}
                        </button>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Active" />
                      </div>
                      <p className="text-xs text-gray-400 truncate">{c.title || 'Education Counselor'} · {c.experience ?? 0} yrs exp</p>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tags.map((t: string) => (
                            <span key={t} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => navigate('/admin/chat', { state: { openChatWith: { _id: id, name: c.name } } })} title="Chat"
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors">
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setAssigning(c)} title="Assign"
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors">
                        <UserCheck className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setEditing(c)} title="Edit"
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(id)} disabled={deletingId === id} title="Delete"
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50">
                        {deletingId === id ? <Spinner size={4} /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* List — Application Team (simple: no counselor-style metrics apply here) */}
        {activeRole === 'appteam' && (!loading && filteredAppTeam.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-14 flex flex-col items-center justify-center text-gray-400">
            <ClipboardList className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">{search ? 'No Application Team members match your search.' : 'No Application Team members yet.'}</p>
            {!search && (
              <button type="button" onClick={() => setShowCreateAppTeam(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors">
                <Plus className="w-4 h-4" />Add first Application Team member
              </button>
            )}
          </div>
        ) : !loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
            <div className="divide-y divide-gray-50">
              {filteredAppTeam.map(m => {
                const id = normalId(m);
                const color = avatarColor(m.name);
                return (
                  <div key={id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
                    <button type="button" onClick={() => setEditingAppTeam(m)} aria-label={`Open ${m.name}'s profile`}
                      className={`w-11 h-11 bg-linear-to-br ${color} rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                      {initials(m.name)}
                    </button>
                    <div className="flex-1 min-w-0">
                      <button type="button" onClick={() => setEditingAppTeam(m)}
                        className="text-sm font-semibold text-gray-900 truncate hover:text-orange-700 hover:underline transition-colors block">
                        {m.name}
                      </button>
                      <p className="text-xs text-gray-400 truncate">{m.email}</p>
                    </div>
                    <div className="hidden sm:block shrink-0"><PresenceLabel userId={id} /></div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => navigate('/admin/chat', { state: { openChatWith: { _id: id, name: m.name } } })}
                        title="Chat"
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors">
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setEditingAppTeam(m)} title="Edit"
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDeleteAppTeam(id)} disabled={deletingId === id} title="Delete"
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50">
                        {deletingId === id ? <Spinner size={4} /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Close dropdowns on outside click */}
      {showSpecMenu && (
        <div role="presentation" className="fixed inset-0 z-5" onClick={() => setShowSpecMenu(false)} />
      )}
    </>
  );
}
