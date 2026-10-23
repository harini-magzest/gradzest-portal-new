import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { LEAD_STAGES, leadStageOf } from './LeadStageSelect';

// Bigin-style "Edit Student" form, shared by the admin, Application Team and counselor pages.
// Also used to add a lead who just phoned in: only Last Name and Mobile are required, and
// everything else can be filled in one field at a time later.

const ENGLISH_TESTS = ['IELTS', 'TOEFL', 'PTE', 'Duolingo', 'Other'];
const COURSE_LEVELS = ['Foundation', 'Diploma', "Bachelor's", 'PG Diploma', "Master's", 'PhD', 'Certificate'];
const GENDERS = ['Male', 'Female', 'Other'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const THIS_YEAR = new Date().getFullYear();
const INTAKES = [THIS_YEAR, THIS_YEAR + 1, THIS_YEAR + 2].flatMap(y => MONTHS.map(m => `${m} ${y}`));

const sid = (s: any) => String(s?._id || s?.id || '');
const list = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean);
const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Legacy students only have `name` — split it so the First/Last fields aren't empty. */
function splitName(s: any) {
  if (s?.firstName || s?.lastName) return { first: s.firstName || '', last: s.lastName || '' };
  const parts = String(s?.name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: '', last: parts[0] || '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function initialForm(s: any) {
  const { first, last } = splitName(s);
  return {
    firstName: first, lastName: last, title: s?.title || '',
    email: s?.email || '', secondaryEmail: s?.secondaryEmail || '', universityName: s?.universityName || '',
    phone: s?.phone || '', altPhone: s?.altPhone || '', dateOfBirth: s?.dateOfBirth || '',
    gender: s?.gender || '', nationality: s?.nationality || '', socialLeadId: s?.socialLeadId || '',
    street: s?.address?.street || '', city: s?.address?.city || '', state: s?.address?.state || '',
    country: s?.address?.country || '', postalCode: s?.address?.postalCode || '',
    destination: (s?.preferredCountries || []).join(', '),
    englishType: s?.englishScore?.type || '',
    englishScore: s?.englishScore?.score != null ? String(s.englishScore.score) : '',
    leadStage: s?.leadStage || 'new_enquiry',
    courses: (s?.interestedCourses || []).join(', '),
    preferredCourseLevel: s?.preferredCourseLevel || '', preferredIntake: s?.preferredIntake || '',
    qualification: s?.qualification || '', workSummary: s?.workSummary || '', branch: s?.branch || '',
    preferredUniversities: s?.preferredUniversities || '', preferredCities: s?.preferredCities || '',
    needsScholarship: s?.needsScholarship || '', needsLoan: s?.needsLoan || '', needsAccommodation: s?.needsAccommodation || '',
    preferenceNote: s?.preferenceNote || '',
  };
}
type Form = ReturnType<typeof initialForm>;

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500';

function Field({ label, required, children, htmlFor, stacked }: { label: string; required?: boolean; children: React.ReactNode; htmlFor: string; stacked?: boolean }) {
  return (
    <div className={stacked ? 'grid grid-cols-1 gap-1' : 'grid grid-cols-1 sm:grid-cols-[10rem_1fr] sm:items-center gap-1 sm:gap-5'}>
      <label htmlFor={htmlFor} className={stacked ? 'text-xs font-medium text-gray-600' : 'text-sm text-gray-700 sm:text-right'}>
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <div className={required ? 'border-l-[3px] border-red-400 rounded-l-sm' : ''}>{children}</div>
    </div>
  );
}

export default function StudentEditForm({ student, basePath, onClose, onSaved, inline = false }: {
  /** Omit to add a new student */
  student?: any;
  /** Render in place (the profile sidebar) instead of as a centred popup */
  inline?: boolean;
  /** e.g. '/admin/students' — used to link to an existing student with the same mobile */
  basePath: string;
  onClose: () => void;
  onSaved: (s: any) => void;
}) {
  const isEdit = !!student;
  const { user } = useAuth() as any;
  const isAdmin = user?.role === 'admin';
  // The reassign route is closed to Application Team accounts, so they can only pick an owner when adding
  const canPickOwner = isAdmin && (!isEdit || !user?.isAppTeam);
  const [form, setForm] = useState<Form>(() => initialForm(student));
  const [ownerId, setOwnerId] = useState<string>(student?.counselorId ? String(student.counselorId) : '');
  const [counselors, setCounselors] = useState<any[]>([]);
  const [showAddress, setShowAddress] = useState(() => !!(student?.address && Object.values(student.address).some(Boolean)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (canPickOwner) api.admin.counselors().then(setCounselors).catch(() => {});
  }, [canPickOwner]);
  useEffect(() => {
    if (inline) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, inline]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const ownerName = isEdit
    ? (student.counselorName || counselors.find(c => sid(c) === ownerId)?.name || (ownerId ? 'Assigned' : 'Unassigned'))
    : (user?.role === 'counselor' ? user?.name : 'Auto-assign');

  const submit = async (e: React.FormEvent | null, allowDuplicatePhone = false) => {
    e?.preventDefault();
    if (!form.lastName.trim()) { setError('Last Name is required.'); return; }
    if (!form.phone.trim()) { setError('Mobile is required.'); return; }
    if (form.englishScore && !form.englishType) { setError('Pick the English test for that score.'); return; }
    setSaving(true); setError(''); setDuplicate(null);
    const payload: any = {
      firstName: form.firstName, lastName: form.lastName, title: form.title,
      secondaryEmail: form.secondaryEmail, universityName: form.universityName,
      phone: form.phone, altPhone: form.altPhone, dateOfBirth: form.dateOfBirth, gender: form.gender,
      nationality: form.nationality, socialLeadId: form.socialLeadId,
      address: { street: form.street, city: form.city, state: form.state, country: form.country, postalCode: form.postalCode },
      preferredCountries: list(form.destination), interestedCourses: list(form.courses),
      englishScore: form.englishType ? { type: form.englishType, score: form.englishScore === '' ? undefined : Number(form.englishScore) } : null,
      preferredCourseLevel: form.preferredCourseLevel, preferredIntake: form.preferredIntake,
      qualification: form.qualification, workSummary: form.workSummary, branch: form.branch,
      preferredUniversities: form.preferredUniversities, preferredCities: form.preferredCities,
      needsScholarship: form.needsScholarship, needsLoan: form.needsLoan, needsAccommodation: form.needsAccommodation,
      preferenceNote: form.preferenceNote,
      allowDuplicatePhone,
    };
    // Email is the login ID: send it only when adding one (the server refuses to change an existing one)
    if (form.email.trim() && !student?.email) payload.email = form.email.trim();
    try {
      let saved: any;
      if (isEdit) {
        const id = sid(student);
        saved = await api.students.update(id, payload);
        if (form.leadStage !== (student.leadStage || 'new_enquiry')) {
          const u = await api.students.setLeadStage(id, form.leadStage);
          saved = { ...saved, leadStage: u.leadStage };
        }
        if (canPickOwner && ownerId !== String(student.counselorId || '')) {
          const u = await api.admin.assignCounselor(id, ownerId || null);
          saved = { ...saved, counselorId: u.counselorId, counselorName: counselors.find(c => sid(c) === ownerId)?.name || null };
        }
      } else {
        saved = await api.students.create({ ...payload, leadStage: form.leadStage, counselorId: canPickOwner ? ownerId || undefined : undefined });
      }
      onSaved(saved);
    } catch (err: any) {
      if (err.data?.duplicatePhone) setDuplicate({ id: err.data.existingId, message: err.message });
      else setError(err.message || 'Could not save the student.');
    } finally { setSaving(false); }
  };

  const text = (key: keyof Form, label: string, opts: { required?: boolean; type?: string; placeholder?: string; disabled?: boolean; title?: string } = {}) => (
    <Field label={label} required={opts.required} htmlFor={`sef-${key}`} stacked={inline}>
      <input id={`sef-${key}`} type={opts.type || 'text'} value={form[key]} onChange={set(key)} disabled={opts.disabled}
        placeholder={opts.placeholder} title={opts.title} className={inputCls} />
    </Field>
  );
  const select = (key: keyof Form, label: string, options: readonly (string | { value: string; label: string })[], none = '-None-') => (
    <Field label={label} htmlFor={`sef-${key}`} stacked={inline}>
      <select id={`sef-${key}`} value={form[key]} onChange={set(key)} className={inputCls}>
        {none && <option value="">{none}</option>}
        {/* Keep a legacy value selectable even if it's no longer in the list */}
        {form[key] && !options.some(o => (typeof o === 'string' ? o : o.value) === form[key]) && <option value={form[key]}>{form[key]}</option>}
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );

  const pad = inline ? 'px-4' : 'px-6';
  const h3 = inline ? 'text-sm font-semibold text-gray-900' : 'text-lg font-semibold text-gray-900';
  const formEl = (
      <form onSubmit={submit} aria-labelledby="sef-title" {...(inline ? {} : { role: 'dialog', 'aria-modal': true })}
        className={inline ? 'bg-white flex flex-col' : 'bg-white w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[92vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden'}>
        <div className={`flex items-center justify-between ${pad} py-4 border-b border-gray-100 shrink-0`}>
          <h2 id="sef-title" className={inline ? 'text-base font-bold text-gray-900' : 'text-xl font-bold text-gray-900'}>{isEdit ? 'Edit Student' : 'New Lead'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={inline ? `${pad} py-4 space-y-6` : `flex-1 overflow-y-auto ${pad} py-5 space-y-7`}>
          {/* ── Student Information ── */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className={h3}>Student Information</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Owner</span>
                {canPickOwner ? (
                  <select aria-label="Owner" value={ownerId} onChange={e => setOwnerId(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-full text-sm bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-500">
                    <option value="">{isEdit ? 'Unassigned' : 'Auto-assign'}</option>
                    {counselors.map(c => <option key={sid(c)} value={sid(c)}>{c.name}</option>)}
                  </select>
                ) : (
                  <span className="px-3 py-1.5 border border-gray-200 rounded-full text-sm bg-gray-50 text-gray-700">{ownerName}</span>
                )}
              </div>
            </div>
            {text('firstName', 'First Name')}
            {text('lastName', 'Last Name', { required: true })}
            {text('title', 'Title')}
            {text('email', 'Email', {
              type: 'email', disabled: !!student?.email, placeholder: isEdit ? 'Add an email to give the student a login' : 'Optional',
              title: student?.email ? "Email is the student's login and can't be changed here" : undefined,
            })}
            {text('secondaryEmail', 'Secondary Email', { type: 'email' })}
            {text('universityName', 'University Name')}
            {text('phone', 'Mobile', { required: true, type: 'tel', placeholder: '+91 98765 43210' })}
            {text('altPhone', 'Phone', { type: 'tel' })}
            {text('dateOfBirth', 'Date of Birth', { type: !form.dateOfBirth || isIsoDate(form.dateOfBirth) ? 'date' : 'text' })}
            {select('gender', 'Gender', GENDERS)}
            {text('nationality', 'Nationality')}
            {text('socialLeadId', 'Social Lead ID')}
          </section>

          {/* ── Address Information ── */}
          <section className="space-y-4">
            <button type="button" onClick={() => setShowAddress(v => !v)} aria-expanded={showAddress}
              className={`flex items-center gap-1.5 ${h3}`}>
              Address Information {showAddress ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {showAddress && <>
              {text('street', 'Street')}
              {text('city', 'City')}
              {text('state', 'State')}
              {text('country', 'Country')}
              {text('postalCode', 'Postal Code')}
            </>}
          </section>

          {/* ── Additional Information ── */}
          <section className="space-y-4">
            <h3 className={h3}>Additional Information</h3>
            {text('destination', 'Destination', { placeholder: 'e.g. Canada, UK' })}
            {select('englishType', 'English Language Test', ENGLISH_TESTS)}
            {form.englishType && text('englishScore', 'Test Score', { type: 'number', placeholder: 'e.g. 7.5' })}
            {select('leadStage', 'Lead Stage', LEAD_STAGES.map(s => ({ value: s.value, label: s.label })), '')}
            {text('courses', 'Preferred Courses', { placeholder: 'e.g. Data Science, MBA' })}
            {select('preferredCourseLevel', 'Preferred Course Level', COURSE_LEVELS)}
            <Field label="Preferred Intake" htmlFor="sef-preferredIntake" stacked={inline}>
              <input id="sef-preferredIntake" list="sef-intakes" value={form.preferredIntake} onChange={set('preferredIntake')}
                placeholder="e.g. September 2026" className={inputCls} />
              <datalist id="sef-intakes">{INTAKES.map(i => <option key={i} value={i} />)}</datalist>
            </Field>
            {text('qualification', 'Qualification and YOP', { placeholder: 'e.g. B.Tech CSE (2024)' })}
            <Field label="Work" htmlFor="sef-workSummary" stacked={inline}>
              <textarea id="sef-workSummary" value={form.workSummary} onChange={set('workSummary')} rows={2} className={`${inputCls} resize-y`} />
            </Field>
            {text('branch', 'Branch', { placeholder: 'Unassigned' })}
          </section>

          {/* ── Student's Preferences (the student can also fill these in from their own profile) ── */}
          <section className="space-y-4">
            <h3 className={h3}>Student's Preferences</h3>
            {text('preferredUniversities', 'Preferred Universities', { placeholder: 'e.g. University of Toronto, Monash' })}
            {text('preferredCities', 'Preferred Cities', { placeholder: 'e.g. Toronto, Melbourne' })}
            {select('needsScholarship', 'Needs Scholarship', YES_NO_OPTIONS)}
            {select('needsLoan', 'Needs Education Loan', YES_NO_OPTIONS)}
            {select('needsAccommodation', 'Needs Accommodation', YES_NO_OPTIONS)}
            <Field label="Notes" htmlFor="sef-preferenceNote" stacked={inline}>
              <textarea id="sef-preferenceNote" value={form.preferenceNote} onChange={set('preferenceNote')} rows={3} maxLength={2000}
                placeholder="Goals, constraints, anything the student told you" className={`${inputCls} resize-y`} />
            </Field>
          </section>
        </div>

        {(error || duplicate) && (
          <div className={`${pad} py-3 border-t border-red-100 bg-red-50 text-sm text-red-700 shrink-0`} role="alert">
            {duplicate ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{duplicate.message}.</span>
                <Link to={`${basePath}/${duplicate.id}`} onClick={onClose} className="font-semibold underline">Open existing student</Link>
                <button type="button" onClick={() => submit(null, true)} disabled={saving} className="font-semibold underline">Save anyway</button>
              </div>
            ) : error}
          </div>
        )}

        {/* Inline: stick to the bottom of the scrolling sidebar so Save is always reachable */}
        <div className={`flex items-center justify-end gap-3 ${pad} py-4 border-t border-gray-100 shrink-0 ${inline ? 'sticky bottom-0 bg-white' : ''}`}>
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-full border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
  );

  if (inline) return formEl;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-0 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      {formEl}
    </div>
  );
}

// ── Read-only view of the same fields, for the student page sidebar ─────────
function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 wrap-break-word min-w-0">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

export function StudentProfileFields({ student }: { student: any }) {
  const a = student.address || {};
  const address = [a.street, a.city, a.state, a.country, a.postalCode].filter(Boolean).join(', ');
  const english = student.englishScore?.type
    ? `${student.englishScore.type}${student.englishScore.score != null ? ` – ${student.englishScore.score}` : ''}` : '';
  return (
    <>
      <div className="p-5 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Student Information</p>
        <Row label="Title" value={student.title} />
        <Row label="Email" value={student.email} />
        <Row label="Secondary Email" value={student.secondaryEmail} />
        <Row label="University Name" value={student.universityName} />
        <Row label="Mobile" value={student.phone && <a href={`tel:${student.phone}`} className="hover:text-blue-600">{student.phone}</a>} />
        <Row label="Phone" value={student.altPhone && <a href={`tel:${student.altPhone}`} className="hover:text-blue-600">{student.altPhone}</a>} />
        <Row label="Date of Birth" value={student.dateOfBirth} />
        <Row label="Gender" value={student.gender} />
        <Row label="Nationality" value={student.nationality} />
        <Row label="Social Lead ID" value={student.socialLeadId} />
        <Row label="Address" value={address} />
      </div>
      <div className="p-5 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Additional Information</p>
        <Row label="Destination" value={(student.preferredCountries || []).join(', ')} />
        <Row label="English Test" value={english} />
        <Row label="Lead Stage" value={leadStageOf(student).label} />
        <Row label="Preferred Courses" value={(student.interestedCourses || []).join(', ')} />
        <Row label="Course Level" value={student.preferredCourseLevel} />
        <Row label="Preferred Intake" value={student.preferredIntake} />
        <Row label="Qualification & YOP" value={student.qualification} />
        <Row label="Work" value={student.workSummary && <span className="whitespace-pre-wrap">{student.workSummary}</span>} />
        <Row label="Branch" value={student.branch} />
      </div>
      <div className="p-5 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Student's Preferences</p>
        <Row label="Universities" value={student.preferredUniversities} />
        <Row label="Cities" value={student.preferredCities} />
        <Row label="Scholarship" value={YES_NO_LABEL[student.needsScholarship]} />
        <Row label="Education Loan" value={YES_NO_LABEL[student.needsLoan]} />
        <Row label="Accommodation" value={YES_NO_LABEL[student.needsAccommodation]} />
        {student.preferenceNote && (
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap wrap-break-word bg-rose-50/60 border border-rose-100 rounded-lg p-2.5">
            {student.preferenceNote}
          </p>
        )}
      </div>
    </>
  );
}

const YES_NO_LABEL: Record<string, string> = { yes: 'Yes', no: 'No', not_sure: 'Not sure' };
const YES_NO_OPTIONS = Object.entries(YES_NO_LABEL).map(([value, label]) => ({ value, label }));
