import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, UserCog, Plus, Trash2, X, GraduationCap,
  Eye, EyeOff, Check, Search, ExternalLink, Pencil,
  AlertTriangle, MessageSquare, ChevronDown, ChevronUp,
  BookOpen, DollarSign, MapPin, CheckCircle, Download, RefreshCw,
  ChevronLeft, ChevronRight, UserX, Activity, Video, Copy, ArrowLeft, Phone,
} from 'lucide-react';
import { api, type StudentCounts } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { checkCourseEligibility, ELIGIBILITY_BADGE } from '../../utils/eligibility';
import StatusBadge from '../../components/StatusBadge';
import LeadStageSelect, { LEAD_STAGES, leadStageOf } from '../../components/LeadStageSelect';
import { RECORD_TABS, RecordTab, StudentRecordPanel, useStudentRecord } from '../../components/StudentRecord';
import { notifyLeadsChanged } from '../../hooks/useNewLeadCount';
import RecordNavArrows from '../../components/RecordNavArrows';
import StudentEditForm, { StudentProfileFields } from '../../components/StudentEditForm';
import BulkActionBar from '../../components/BulkActionBar';
import { usePortalName } from '../../hooks/usePortalName';
import { useToast } from '../../context/ToastContext';
import { exportRowsToCsv } from '../../utils/exportCsv';
import { downloadStudentProfilePdf } from '../../utils/studentProfilePdf';
import { openExternal } from '../../lib/safeUrl';
import SignedFileLink from '../../components/SignedFileLink';

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

const LEAD_SOURCE_LABELS: Record<string, string> = { self_signup: 'email', web_form: 'website form', zest_chat: 'Zest chat' };

function Spinner({ size = 4, white = false }: { size?: number; white?: boolean }) {
  return <span className={`w-${size} h-${size} border-2 ${white ? 'border-white/40 border-t-white' : 'border-gray-600 border-t-gray-300'} rounded-full animate-spin inline-block`} />;
}

function DetailRow({ label, value }: { label: string; value?: any }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-36 shrink-0">{label}</span>
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
        bg-linear-to-r shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 ${colors} ${className}`}>
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
        focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 ${className}`}>
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

// ── Group meeting modal ──────────────────────────────────────────────────────
// Creates one Jitsi room for the student plus the staff the admin ticks. Everyone
// invited gets the same link (notification + email); the student sees it on their Meetings page.
function localDateTime(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function GroupMeetingModal({ student, counselors, onClose }: { student: any; counselors: any[]; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(student.counselorId ? [String(student.counselorId)] : []),
  );
  const [title, setTitle] = useState(`Welcome call – ${student.name}`);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [date, setDate] = useState(localDateTime().date);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('60');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.admin.appteamUsers().then(setAdminUsers).catch(() => toast.error('Failed to load staff list.')); }, [toast]);

  const selfId = String(user?.id ?? '');
  const groups = [
    { key: 'admin', label: 'Admins', people: adminUsers.filter(u => !u.isAppTeam && normalId(u) !== selfId) },
    { key: 'appteam', label: 'Application Team (HR)', people: adminUsers.filter(u => u.isAppTeam && normalId(u) !== selfId) },
    { key: 'counselor', label: 'Counselors', people: counselors },
  ];

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const create = async () => {
    if (when === 'later' && (!date || !time)) { setError('Pick a date and time.'); return; }
    setCreating(true); setError('');
    const at = when === 'now' ? localDateTime() : { date, time };
    const staff = groups.flatMap(g => g.people
      .filter(p => selected.has(normalId(p)))
      .map(p => ({ userId: normalId(p), name: p.name, role: g.key, email: p.email })));
    try {
      const meeting = await api.meetings.create({
        title: title.trim() || `Meeting – ${student.name}`,
        scheduledDate: at.date, scheduledTime: at.time,
        duration: parseInt(duration), platform: 'jitsi',
        participants: [
          { userId: selfId, name: user?.name, role: user?.isAppTeam ? 'appteam' : 'admin', email: user?.email },
          { userId: normalId(student), name: student.name, role: 'student', email: student.email },
          ...staff,
        ],
      });
      setCreated({ ...meeting, invited: staff });
      if (when === 'now' && meeting.meetingLink) openExternal(meeting.meetingLink);
    } catch (err: any) {
      setError(err.message || 'Failed to create meeting.');
    } finally { setCreating(false); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(created.meetingLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  return (
    <div role="presentation" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="presentation" className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center"><Video className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold text-gray-900">Group meeting</h3>
              <p className="text-xs text-gray-500">with {student.name}</p>
            </div>
          </div>
          <BtnClose onClick={onClose} />
        </div>

        {created ? (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm font-medium">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Meeting created — {created.invited.length + 1} people invited
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Meeting link</p>
              <div className="flex gap-2">
                <input readOnly value={created.meetingLink} aria-label="Meeting link"
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-700" />
                <button type="button" onClick={copyLink}
                  className="px-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium inline-flex items-center gap-1.5">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              <p><span className="text-gray-400">When:</span> {created.scheduledDate} at {created.scheduledTime} · {created.duration} min</p>
              <p className="mt-1"><span className="text-gray-400">Invited:</span> {[student.name, ...created.invited.map((p: any) => p.name)].join(', ')}</p>
            </div>
            <div className="flex gap-3 pt-1">
              <BtnGhost onClick={onClose} className="flex-1">Close</BtnGhost>
              <BtnPrimary variant="blue" className="flex-1" onClick={() => openExternal(created.meetingLink)}>
                <Video className="w-4 h-4" /> Join now
              </BtnPrimary>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label htmlFor="gm-title" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Title</label>
                <input id="gm-title" value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">When</p>
                <div className="flex gap-2">
                  {([['now', 'Start now'], ['later', 'Schedule']] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setWhen(k)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${when === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                      {label}
                    </button>
                  ))}
                  <select value={duration} onChange={e => setDuration(e.target.value)} title="Duration"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500">
                    {['30', '45', '60', '90'].map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
                {when === 'later' && (
                  <div className="flex gap-2 mt-2">
                    <input type="date" value={date} min={localDateTime().date} onChange={e => setDate(e.target.value)} aria-label="Date"
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                    <input type="time" value={time} onChange={e => setTime(e.target.value)} aria-label="Time"
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Invite staff <span className="normal-case font-normal text-gray-400">({selected.size} selected)</span></p>
                <div className="space-y-3">
                  {groups.map(g => (
                    <div key={g.key}>
                      <p className="text-xs font-semibold text-gray-700 mb-1">{g.label}</p>
                      {g.people.length === 0 ? (
                        <p className="text-xs text-gray-400">None available</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {g.people.map(p => {
                            const id = normalId(p);
                            const on = selected.has(id);
                            const isAssigned = g.key === 'counselor' && String(student.counselorId) === id;
                            return (
                              <button key={id} type="button" onClick={() => toggle(id)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                {on && <Check className="w-3 h-3" />}{p.name}{isAssigned && <span className="text-[10px] text-gray-400">(assigned)</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                A free Jitsi link is generated automatically. Everyone gets the same link. The student sees it on their Meetings page, and staff get a notification. Everyone is also emailed when email (SMTP) is set up.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <BtnGhost onClick={onClose} className="flex-1">Cancel</BtnGhost>
              <BtnPrimary variant="blue" className="flex-1" onClick={create} disabled={creating}>
                {creating ? <Spinner white /> : <Video className="w-4 h-4" />}
                {when === 'now' ? 'Start meeting' : 'Schedule meeting'}
              </BtnPrimary>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Student detail modal ─────────────────────────────────────────────────────
type DetailTab = 'overview' | 'courses' | RecordTab;
const DETAIL_TAB_KEYS: string[] = ['overview', 'courses', ...RECORD_TABS.map(t => t.key)];

// ── Status picker ────────────────────────────────────────────────────────────
const STUDENT_STATUSES = ['active', 'inactive'];

/** Inline Active/Inactive picker; saves as soon as the value changes. */
function StudentStatusSelect({ value, onSave }: { value?: string; onSave: (status: string) => Promise<unknown> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = value === 'inactive' ? 'inactive' : 'active';
  const tone = current === 'active'
    ? 'bg-green-100 text-green-700 border-green-200'
    : 'bg-gray-100 text-gray-600 border-gray-200';
  const change = async (next: string) => {
    if (next === value) return;
    setSaving(true); setError('');
    try { await onSave(next); }
    catch (err: any) { setError(err.message || 'Could not update status'); }
    finally { setSaving(false); }
  };
  return (
    <span className="inline-flex flex-col">
      <select value={current} disabled={saving} onChange={e => change(e.target.value)}
        aria-label="Student status" title={error || 'Change status'}
        className={`text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-60 ${tone}`}>
        {STUDENT_STATUSES.map(st => <option key={st} value={st}>{st === 'active' ? 'Active' : 'Inactive'}</option>)}
      </select>
      {error && <span className="text-[11px] text-red-600 mt-0.5">{error}</span>}
    </span>
  );
}

function StudentDetailModal({ student, onClose, onChat, onNewApplication, onLeadStage, onStatusChange, onEdit, editPanel, onStudentChange, asPage = false, initialTab }: {
  onStatusChange?: (status: string) => Promise<unknown>;
  onEdit?: () => void;
  /** When set (page mode), replaces the sidebar details — used for inline editing */
  editPanel?: React.ReactNode;
  student: any; onClose: () => void; onChat?: () => void; onNewApplication?: () => void;
  onLeadStage?: (stage: string) => Promise<unknown>;
  onStudentChange?: (s: any) => void;
  /** Render inline as a full page (no overlay / close buttons) */
  asPage?: boolean;
  initialTab?: string | null;
}) {
  const [tab, setTab] = useState<DetailTab>(
    initialTab && DETAIL_TAB_KEYS.includes(initialTab) ? initialTab as DetailTab : 'overview'
  );
  const { record, loading: recordLoading, error: recordError, reload: reloadRecord } = useStudentRecord(normalId(student));
  const recordTab = RECORD_TABS.find(t => t.key === tab)?.key;
  const { toast } = useToast();
  const [universities, setUniversities] = useState<any[]>([]);
  const [eligFilter, setEligFilter] = useState('');

  useEffect(() => {
    api.universities.list().then(setUniversities).catch(() => toast.error('Failed to load universities for eligibility checks.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const header = (
        <div className="bg-linear-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 pt-6 pb-5 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 border border-white/30 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shrink-0">{initials}</div>
              <div>
                <h2 className="text-xl font-bold text-white">{student.name}</h2>
                <p className="text-blue-200 text-sm mt-0.5">{student.email}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <StatusBadge status={student.status} />
                  {onLeadStage && <LeadStageSelect value={student.leadStage} onSave={onLeadStage} />}
                  {student.nationality && <span className="text-xs bg-white/15 text-white px-2.5 py-1 rounded-full font-medium border border-white/20">{student.nationality}</span>}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white transition-all shrink-0"><X className="w-5 h-5" /></button>
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
  );
  const tabBar = (
        <div className="flex border-b border-gray-100 shrink-0 px-6 bg-white overflow-x-auto">
          {[{ key: 'overview', label: 'Overview' }, ...RECORD_TABS, { key: 'courses', label: 'Course Eligibility' }].map(t => (
            <button key={t.key} type="button" onClick={() => { setTab(t.key as any); setEligFilter(''); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
  );
  const body = (
        <div className="flex-1 overflow-y-auto min-h-0">
          {recordTab ? (
            <div className="p-6">
              <StudentRecordPanel tab={recordTab} student={student} record={record} reload={reloadRecord}
                loading={recordLoading} error={recordError} canEdit canReply
                onStudentChange={s => onStudentChange?.(s)} />
            </div>
          ) : tab === 'overview' ? (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {!asPage && <div className="space-y-5">
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
              </div>}
              <div className={asPage ? 'contents' : 'space-y-5'}>
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
                          {doc.url && <SignedFileLink href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md hover:bg-gray-200 font-medium"><ExternalLink className="w-3 h-3" />Open</SignedFileLink>}
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
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${badge.classes}`}>
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
  );
  const footer = (
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0 flex gap-3">
          {onChat && <button type="button" onClick={onChat} className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-md active:scale-[0.98] transition-all"><MessageSquare className="w-4 h-4" />Chat</button>}
          {onNewApplication && <button type="button" onClick={onNewApplication} className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-linear-to-r from-sky-500 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 shadow-md active:scale-[0.98] transition-all"><Plus className="w-4 h-4" />New Application</button>}
          <BtnGhost onClick={onClose} className="flex-1">Close</BtnGhost>
        </div>
  );

  // Full page: student details on the left, tabs on the right (Bigin-style)
  if (asPage) return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        <div className="bg-linear-to-br from-blue-600 to-indigo-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-white/20 border border-white/30 rounded-2xl flex items-center justify-center text-white font-bold text-xl shrink-0">{initials}</div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white truncate" title={student.name}>{student.name}</h2>
              <p className="flex items-center gap-1 text-xs text-blue-100 mt-0.5 min-w-0" title="Assigned counselor">
                <UserCog className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{student.counselorName || 'Unassigned'}</span>
              </p>
              <div className="mt-1">{onStatusChange ? <StudentStatusSelect value={student.status} onSave={onStatusChange} /> : <StatusBadge status={student.status} />}</div>
            </div>
          </div>
          {onLeadStage && (
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs font-medium text-blue-100">Lead Stage</span>
              <LeadStageSelect value={student.leadStage} onSave={onLeadStage} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 border-b border-gray-100">
          {onChat && <button type="button" onClick={onChat} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-xs transition-all"><MessageSquare className="w-4 h-4" />Chat</button>}
          {onNewApplication && <button type="button" onClick={onNewApplication} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-linear-to-r from-sky-500 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 shadow-xs transition-all"><Plus className="w-4 h-4" />Application</button>}
          {onEdit && !editPanel && <button type="button" onClick={onEdit} className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-xs transition-all"><Pencil className="w-4 h-4" />Edit Profile</button>}
          <button type="button" onClick={() => downloadStudentProfilePdf(student, { counselorName: student.counselorName || undefined })}
            className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-xs transition-all"><Download className="w-4 h-4" />Download Profile PDF</button>
        </div>
        {editPanel ?? (<>
        <StudentProfileFields student={student} />
        <div className="p-5 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Academic Profile</p>
          <DetailRow label="Education Level" value={student.educationLevel} />
          <DetailRow label="GPA" value={student.gpa} />
          <DetailRow label="Budget" value={student.budget ? `$${Number(student.budget).toLocaleString()}` : undefined} />
        </div>
        <div className="p-5">
          <DetailRow label="Joined" value={student.joinedDate} />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-gray-50 border border-gray-100 rounded-xl py-2 text-center"><p className="text-lg font-bold text-gray-900">{student.applications?.length ?? 0}</p><p className="text-[11px] text-gray-500">Applications</p></div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl py-2 text-center"><p className="text-lg font-bold text-gray-900">{student.documents?.length ?? 0}</p><p className="text-[11px] text-gray-500">Documents</p></div>
          </div>
        </div>
        </>)}
      </aside>

      <div className="flex-1 min-w-0 w-full bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden flex flex-col min-h-[calc(100vh-10rem)]">
        {tabBar}
        {body}
      </div>
    </div>
  );

  return (
    <div role="presentation" className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-4xl h-[93vh] flex flex-col shadow-2xl overflow-hidden">
        {header}
        {tabBar}
        {body}
        {footer}
      </div>
    </div>
  );
}

// ── Student page (/admin/students/:studentId) ────────────────────────────────
// Full-page student profile with Bigin-style ‹ › arrows to step through the list it was opened from.
function AdminStudentPage({ studentId, listStudent, onChat, onNewApplication, onStudentChange }: {
  studentId: string; listStudent?: any;
  onChat: (s: any) => void; onNewApplication: (s: any) => void;
  onStudentChange: (id: string, patch: any) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [student, setStudent] = useState<any>(listStudent || null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  // Reload whenever the student changes (incl. via the ‹ › arrows).
  // Show the list's copy straight away, then swap in the full profile.
  useEffect(() => {
    let cancelled = false;
    setError('');
    setEditing(false);
    setStudent(listStudent || null);
    api.students.get(studentId)
      .then(s => { if (!cancelled) setStudent(s); })
      .catch(err => { if (!cancelled && !listStudent) setError(err.message || 'Could not load this student.'); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Back returns to wherever the page was opened from (students list, applications, …)
  const goBack = () => { if (location.key !== 'default') navigate(-1); else navigate('/admin/students'); };

  const update = (patch: any) => {
    setStudent((prev: any) => prev ? { ...prev, ...patch } : prev);
    onStudentChange(studentId, patch);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={goBack} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <RecordNavArrows currentId={studentId} basePath="/admin/students" />
      </div>
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-sm font-semibold text-red-800">Failed to load student</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
        </div>
      ) : !student ? (
        <div className="text-center py-16"><Spinner size={8} /></div>
      ) : (
        <StudentDetailModal asPage initialTab={searchParams.get('tab')} student={student} onClose={goBack}
          onChat={() => onChat(student)}
          onNewApplication={() => onNewApplication(student)}
          onLeadStage={async stage => { const u = await api.students.setLeadStage(studentId, stage); update({ leadStage: u.leadStage }); }}
          onStatusChange={async status => { const u = await api.admin.updateStudentStatus(studentId, status); update({ status: u.status }); }}
          onEdit={() => setEditing(true)}
          editPanel={editing ? (
            <StudentEditForm inline student={student} basePath="/admin/students" onClose={() => setEditing(false)}
              onSaved={u => { update(u); setEditing(false); }} />
          ) : undefined}
          onStudentChange={update} />
      )}
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

  const inp = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400';
  return (
    <div role="presentation" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-linear-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-xs"><GraduationCap className="w-4 h-4 text-white" /></div>
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

// ── New application modal ────────────────────────────────────────────────────
function NewApplicationModal({ initialStudent, onClose, onCreated }: {
  initialStudent?: any; onClose: () => void; onCreated: () => void;
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

  // The first 8 students whose name, email or phone matches, searched on the server as the admin types
  const [matchedStudents, setMatchedStudents] = useState<any[]>([]);
  useEffect(() => {
    const q = studentQuery.trim();
    if (!q) { setMatchedStudents([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.admin.studentsPage({ q, page: 1, limit: 8 })
        .then(res => { if (!cancelled) setMatchedStudents(res.items); })
        .catch(() => { if (!cancelled) setMatchedStudents([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [studentQuery]);

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
    <div role="presentation" className="fixed inset-0 bg-black/70 backdrop-blur-xs z-70 flex items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-linear-to-r from-sky-500 to-cyan-600 px-6 py-5 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sky-200 text-xs font-medium uppercase tracking-wide">New Application</p>
              <h2 className="text-xl font-bold text-white mt-0.5">Select Student & Course</h2>
              {selectedStudent && <p className="text-sky-100 text-sm mt-1">Eligibility checked against <span className="font-semibold">{selectedStudent.name}</span>'s profile</p>}
            </div>
            <button aria-label="Close" type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white transition-all shrink-0"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Student selector */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0 bg-gray-50/60">
          {selectedStudent ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {selectedStudent.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{selectedStudent.name}</p>
                  <p className="text-xs text-gray-500 truncate">{selectedStudent.email}</p>
                </div>
                {loadingProfile
                  ? <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin shrink-0" />
                  : studentProfile && (
                    <span className="text-xs text-blue-600 font-medium shrink-0 hidden sm:block">
                      {[studentProfile.educationLevel, studentProfile.gpa ? `GPA ${studentProfile.gpa}` : null, studentProfile.englishScore?.type ? `${studentProfile.englishScore.type} ${studentProfile.englishScore.score}` : null].filter(Boolean).join(' · ')}
                    </span>
                  )
                }
              </div>
              <button type="button"
                onClick={() => { setSelectedStudent(null); setStudentProfile(null); setStudentQuery(''); setAppliedIds(new Set()); }}
                className="px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shrink-0">
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
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  autoFocus
                />
              </div>
              {showDropdown && matchedStudents.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-52 overflow-y-auto">
                  {matchedStudents.map(s => (
                    <button key={normalId(s)} type="button"
                      onMouseDown={() => { setSelectedStudent(s); setStudentQuery(s.name); setShowDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left">
                      <div className="w-7 h-7 bg-linear-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {s.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        <p className="text-xs text-gray-400 truncate">{s.email}</p>
                      </div>
                      {s.educationLevel && <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{s.educationLevel}</span>}
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
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input value={uniSearch} onChange={e => setUniSearch(e.target.value)} placeholder="Search universities…" className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>

        {applySuccess && <div className="mx-5 mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 shrink-0"><CheckCircle className="w-4 h-4 text-green-600 shrink-0" /><p className="text-sm text-green-700 font-medium">{applySuccess}</p></div>}
        {applyError && <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 shrink-0"><AlertTriangle className="w-4 h-4 text-red-500 shrink-0" /><p className="text-sm text-red-700">{applyError}</p></div>}

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
                <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-200 rounded-sm w-2/3" />
                    <div className="h-3 bg-gray-100 rounded-sm w-1/2" />
                  </div>
                  <div className="h-7 w-16 bg-gray-200 rounded-lg" />
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
                  <div className="w-10 h-10 bg-linear-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">{uni.name?.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{uni.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {uni.country && <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{uni.country}</span>}
                      <span className="flex items-center gap-1 text-xs text-gray-400"><BookOpen className="w-3 h-3" />{courses.length} courses</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
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
                            <span className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border bg-red-50 text-red-600 border-red-200 cursor-not-allowed">
                              <X className="w-3.5 h-3.5" />Not Eligible
                            </span>
                          ) : (
                            <button type="button" disabled={isApplied || isApplying || loadingProfile} onClick={() => handleApply(uni, course)}
                              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${isApplied ? 'bg-green-50 text-green-700 border-green-200 cursor-default' : 'bg-[#0d1b4b] text-white border-[#0d1b4b] hover:bg-[#152258] shadow-xs disabled:opacity-60'}`}>
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
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0"><BtnGhost onClick={onClose} className="w-full">Close</BtnGhost></div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AdminStudents() {
  const { portal } = usePortalName();
  const navigate = useNavigate();
  const openStudentId = useMatch('/admin/students/:studentId')?.params.studentId;
  const [searchParams, setSearchParams] = useSearchParams();
  const filterLead = searchParams.get('lead') === 'new';
  const setFilterLead = (on: boolean) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    if (on) next.set('lead', 'new'); else next.delete('lead');
    return next;
  }, { replace: true });
  // One page of students, filtered and sorted by the server (server/lib/adminLists.js), with the totals the tiles show
  const [students, setStudents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<StudentCounts>({ total: 0, active: 0, inactive: 0, enrolled: 0, unassigned: 0, newLeads: 0 });
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showNewApp, setShowNewApp] = useState(false);
  const [newAppStudent, setNewAppStudent] = useState<any>(null);
  const [meetingStudent, setMeetingStudent] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [assigningIds, setAssigningIds] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterCounselorId, setFilterCounselorId] = useState('');
  const [filterIntake, setFilterIntake] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('2025-01-01');
  const [filterDateEnd, setFilterDateEnd] = useState(new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // The filters as the server reads them. The joined-date range does not apply to the new-leads view.
  const listQuery = useMemo(() => ({
    q: search, status: filterStatus, stage: filterStage, country: filterCountry,
    counselorId: filterCounselorId === '__unassigned__' ? 'unassigned' : filterCounselorId,
    lead: filterLead ? 'new' : undefined,
    from: filterLead ? undefined : filterDateStart, to: filterLead ? undefined : filterDateEnd,
  }), [search, filterStatus, filterStage, filterCountry, filterCounselorId, filterLead, filterDateStart, filterDateEnd]);

  // Only the newest request may fill the table, however the answers arrive
  const latestRequest = useRef(0);
  const loadPage = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const res = await api.admin.studentsPage({ ...listQuery, page, limit: pageSize });
      if (request !== latestRequest.current) return;
      setStudents(res.items); setTotal(res.total); setCounts(res.counts); setCountryOptions(res.countries);
      setLoadError('');
    } catch (err: any) {
      if (request === latestRequest.current) setLoadError(err.message || 'Failed to load data.');
    }
  }, [listQuery, page, pageSize]);

  // First load and Refresh: the counselors and the page that is showing, behind the loading spinner
  const loadData = async () => {
    setLoading(true); setLoadError('');
    try { setCounselors(await api.admin.counselors()); } catch (err: any) { setLoadError(err.message || 'Failed to load data.'); }
    await loadPage();
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page opens; a new page or filter is fetched below
  useEffect(() => { loadData(); }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, filterStage, filterCountry, filterCounselorId, filterIntake, filterDateStart, filterDateEnd, filterLead]);
  // A new page or filter: fetch it, keeping the table on screen meanwhile
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) { firstPage.current = false; return; }
    loadPage();
  }, [loadPage]);

  const counselorNameById = Object.fromEntries(counselors.map(c => [normalId(c), c.name]));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginated = students;
  const pct = (n: number) => counts.total > 0 ? `${Math.round((n / counts.total) * 100)}%` : '0%';

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this student? This cannot be undone.')) return;
    setDeletingId(id);
    try { await api.admin.deleteStudent(id); setStudents(prev => prev.filter(s => normalId(s) !== id)); notifyLeadsChanged(); loadPage(); }
    catch { alert('Failed to delete student.'); }
    setDeletingId(null);
  };

  // Throws on failure so the status picker can show the error
  const handleStatusChange = async (id: string, status: string) => {
    const updated = await api.admin.updateStudentStatus(id, status);
    setStudents(prev => prev.map(s => normalId(s) === id ? updated : s));
    loadPage(); // the counts, and whether the student still matches the filters
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
      loadPage();
    } catch { alert('Failed to assign counselor.'); }
    setAssigningIds(prev => { const n = new Set(prev); n.delete(studentId); return n; });
  };

  // Throws on failure so the stage picker can show the error
  const handleLeadStage = async (id: string, leadStage: string) => {
    const updated = await api.students.setLeadStage(id, leadStage);
    setStudents(prev => prev.map(s => normalId(s) === id ? { ...s, leadStage: updated.leadStage } : s));
    loadPage();
  };

  // Open the full student page; pass every match, in list order, so ‹ › can step through them
  const openStudent = async (id: string) => {
    let ids = students.map(normalId);
    if (total > students.length) {
      try { ids = (await api.admin.studentIds(listQuery)).ids; } catch { /* step through this page only */ }
    }
    navigate(`/admin/students/${id}`, { state: { ids } });
  };

  const handleMarkContacted = async (id: string) => {
    setMarkingId(id);
    try {
      const updated = await api.admin.setLeadStatus(id, 'contacted');
      setStudents(prev => prev.map(s => normalId(s) === id ? updated : s));
      notifyLeadsChanged();
      loadPage();
    } catch { alert('Failed to update lead.'); }
    setMarkingId(null);
  };

  // Every match, not just this page
  const handleExport = async () => {
    let rows: any[];
    try { rows = (await api.admin.studentsExport(listQuery)).items; } catch { alert('Failed to export students.'); return; }
    exportRowsToCsv('students.csv', rows.map(s => ({
      Name: s.name || '', Email: s.email || '', Nationality: s.nationality || '',
      Status: s.status || '', 'Lead Stage': leadStageOf(s).label, Counselor: counselorNameById[s.counselorId] || 'Unassigned',
      'Joined Date': s.joinedDate || '',
    })));
  };

  const activeTags: { label: string; clear: () => void }[] = [];
  if (filterLead) activeTags.push({ label: 'New leads', clear: () => setFilterLead(false) });
  if (filterStatus) activeTags.push({ label: filterStatus, clear: () => setFilterStatus('') });
  if (filterStage) activeTags.push({ label: `Stage: ${leadStageOf({ leadStage: filterStage }).label}`, clear: () => setFilterStage('') });
  if (filterCountry) activeTags.push({ label: filterCountry, clear: () => setFilterCountry('') });
  if (filterIntake) activeTags.push({ label: filterIntake, clear: () => setFilterIntake('') });
  if (filterCounselorId) activeTags.push({ label: `Counselor: ${filterCounselorId === '__unassigned__' ? 'Unassigned' : counselorNameById[filterCounselorId] || ''}`, clear: () => setFilterCounselorId('') });
  if (search) activeTags.push({ label: `"${search}"`, clear: () => { setSearch(''); setSearchInput(''); } });
  const clearAll = () => { setFilterLead(false); setFilterStatus(''); setFilterStage(''); setFilterCountry(''); setFilterCounselorId(''); setFilterIntake(''); setSearch(''); setSearchInput(''); };

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
  const dSel = 'appearance-none px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer';

  return (
    <>
      {showNewLead && (
        <StudentEditForm basePath="/admin/students" onClose={() => setShowNewLead(false)}
          onSaved={s => { loadPage(); setShowNewLead(false); navigate(`/admin/students/${normalId(s)}`); }} />
      )}
      {showNewStudent && <NewStudentModal counselors={counselors} onClose={() => setShowNewStudent(false)} onCreated={() => { loadPage(); setShowNewStudent(false); }} />}
      {openStudentId && (
        <AdminStudentPage studentId={openStudentId}
          listStudent={(() => {
            const s = students.find(st => normalId(st) === openStudentId);
            return s && { ...s, counselorName: counselorNameById[s.counselorId] || null };
          })()}
          onChat={st => navigate('/admin/chat', { state: { openChatWith: { _id: normalId(st), name: st.name } } })}
          onNewApplication={st => { setNewAppStudent(st); setShowNewApp(true); }}
          onStudentChange={(id, patch) => setStudents(prev => prev.map(s => normalId(s) === id ? { ...s, ...patch } : s))} />
      )}
      {showNewApp && <NewApplicationModal initialStudent={newAppStudent || undefined} onClose={() => { setShowNewApp(false); setNewAppStudent(null); }} onCreated={() => loadData()} />}
      {meetingStudent && <GroupMeetingModal student={meetingStudent} counselors={counselors} onClose={() => setMeetingStudent(null)} />}

      {/* Page wrapper — kept mounted (hidden) while a student page is open so filters survive Back */}
      <div className={openStudentId ? 'hidden' : 'space-y-6'}>

        {/* ── Header ── */}
        <div className="bg-linear-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-xs">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
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
              <button type="button" onClick={() => setShowNewLead(true)} title="Add a lead from a phone call — only a name and mobile number are needed"
                className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors">
                <Phone className="w-4 h-4" />New Lead
              </button>
              <button type="button" onClick={() => setShowNewStudent(true)}
                className="flex items-center gap-2 px-3 py-2 bg-white text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-50 transition-colors shadow-xs">
                <GraduationCap className="w-4 h-4" />Register Student
              </button>
            </div>
          </div>
        </div>

        {/* ── Error ── */}
        {loadError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-5">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
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
            <div key={card.label} className="bg-white rounded-2xl p-4 border border-purple-100 shadow-xs flex items-start gap-3 hover:border-purple-300 hover:shadow-md transition-all">
              <div className={`w-11 h-11 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>{card.icon}</div>
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
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs space-y-3">
          {/* Row 1 */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filterDateStart}
                onChange={e => setFilterDateStart(e.target.value)}
                title="From date"
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-gray-400 text-sm font-medium">–</span>
              <input
                type="date"
                value={filterDateEnd}
                onChange={e => setFilterDateEnd(e.target.value)}
                title="To date"
                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            {/* Lead stage */}
            <div className="relative">
              <select value={filterStage} onChange={e => setFilterStage(e.target.value)} title="Lead stage" className={dSel}>
                <option value="">Lead Stage</option>
                {LEAD_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            </div>
            {/* Status */}
            <div className="relative">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} title="Status" className={dSel}>
                <option value="">Status</option>
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
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <button type="button" onClick={() => setSearch(searchInput)}
              className="px-5 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-sm font-semibold transition-colors shadow-xs">
              Search
            </button>
            {activeTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500 text-xs">Active filters:</span>
                {activeTags.map(tag => (
                  <span key={tag.label} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium">
                    {tag.label}
                    <button aria-label="Close" type="button" onClick={tag.clear} className="hover:text-blue-900 leading-none"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                <button type="button" onClick={clearAll} className="text-xs text-blue-600 hover:text-blue-800 underline">Clear all</button>
              </div>
            )}
          </div>
        </div>

        <BulkActionBar ids={[...selectedIds]} counselors={counselors} onClear={() => setSelectedIds(new Set())} onDone={loadData} />

        {/* ── Table ── */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-12 flex items-center justify-center gap-3 text-gray-400">
            <Spinner size={5} /><span className="text-sm">Loading students…</span>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="w-10 px-4 py-3.5">
                      <input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="w-4 h-4 rounded-sm cursor-pointer accent-blue-500" />
                    </th>
                    {['STUDENT', 'JOINED', 'EMAIL', 'PHONE', 'ASSIGNED TO', 'LEAD STAGE', 'STATUS', 'ACTIONS'].map(h => (
                      <th key={h} className={`px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${h === 'ACTIONS' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-16">
                      <Users className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                      <p className="text-sm text-gray-500">{filterLead ? 'No new leads right now.' : search || filterStatus || filterCountry || filterCounselorId ? 'No students match your filters.' : 'No students yet.'}</p>
                    </td></tr>
                  ) : paginated.map((s, idx) => {
                    const id = normalId(s);
                    const words = (s.name || '').trim().split(' ');
                    const initials = words.length >= 2 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : (s.name?.slice(0, 2) || '??').toUpperCase();
                    const isAssigning = assigningIds.has(id);
                    const isDeleting = deletingId === id;
                    return (
                      <tr key={id} className="border-b border-gray-50 hover:bg-sky-50/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggleOne(id)} className="w-4 h-4 rounded-sm cursor-pointer accent-blue-600" />
                        </td>
                        {/* Student */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 bg-linear-to-br ${avatarPalette[idx % avatarPalette.length]} rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0`}>
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <button type="button" onClick={() => openStudent(id)} title="Open profile"
                                  className="text-sm font-semibold text-gray-900 truncate hover:text-blue-700 hover:underline text-left">{s.name}</button>
                                {s.leadStatus === 'new' && (
                                  <span title={'New lead · signed up via ' + (LEAD_SOURCE_LABELS[s.source] || 'the website')}
                                    className="shrink-0 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold uppercase tracking-wide">
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
                              className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50 min-w-[100px] max-w-[130px] cursor-pointer">
                              <option value="">Unassigned</option>
                              {counselors.map(c => <option key={normalId(c)} value={normalId(c)}>{c.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                          </div>
                        </td>
                        {/* Lead stage */}
                        <td className="px-4 py-3.5"><LeadStageSelect value={s.leadStage} onSave={stage => handleLeadStage(id, stage)} /></td>
                        {/* Status */}
                        <td className="px-4 py-3.5"><StudentStatusSelect value={s.status} onSave={next => handleStatusChange(id, next)} /></td>
                        {/* Actions */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 justify-end">
                            {s.leadStatus === 'new' && (
                              <button type="button" onClick={() => handleMarkContacted(id)} disabled={markingId === id} title="Mark as contacted"
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 border border-green-200 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50">
                                {markingId === id ? <Spinner size={3} /> : <CheckCircle className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <button type="button" onClick={() => navigate('/admin/chat', { state: { openChatWith: { _id: id, name: s.name } } })} title="Chat"
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-sky-50 border border-sky-200 text-sky-600 hover:bg-sky-100 transition-colors">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => setMeetingStudent(s)} title="Start group meeting"
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors">
                              <Video className="w-3.5 h-3.5" />
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
                    className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer">
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                <span>entries</span>
                <span className="hidden sm:inline text-gray-300 mx-1">·</span>
                <span className="hidden sm:inline text-gray-400 text-xs">
                  Showing {total === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`} of {total.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button aria-label="Previous page" type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pageNums.map((p, i) =>
                  p === '...' ? (
                    <span key={`d${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm select-none">…</span>
                  ) : (
                    <button key={p} type="button" onClick={() => setPage(p as number)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors
                        ${page === p ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                      {p}
                    </button>
                  )
                )}
                <button aria-label="Next page" type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
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
