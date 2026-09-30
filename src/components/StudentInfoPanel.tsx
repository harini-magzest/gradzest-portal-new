import { useState } from 'react';
import { Mail, Phone, MessageCircle, MapPin, Plus, X, Pencil, Check } from 'lucide-react';
import { api } from '../api';
import { leadStageOf } from './LeadStageSelect';

// Bigin-style left column: contact basics, tags, a short description and key profile facts.

const SUGGESTED_TAGS = ['Study Visa', 'Work Visa', 'Scholarship', 'Loan Required', 'Hot Lead', 'IELTS Pending', 'Documents Pending', 'Follow-up'];

const TAG_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-amber-50 text-amber-800 border-amber-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
];
const tagColor = (t: string) => TAG_COLORS[[...t.toLowerCase()].reduce((h, c) => h + c.charCodeAt(0), 0) % TAG_COLORS.length];

const SOURCE: Record<string, string> = {
  self_signup: 'Website sign-up', github: 'GitHub sign-up', facebook: 'Facebook sign-up',
  admin_created: 'Added by admin', counselor_created: 'Added by counselor',
};

const sid = (s: any) => String(s?._id || s?.id || '');
const humanize = (v?: string) => v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
const fmtDateTime = (d: any) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// wa.me needs digits only; assumes India (+91) for bare 10-digit numbers
function whatsappNumber(phone: string) {
  let digits = (phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function qualification(s: any) {
  const acad = [...(s.academicDetails || [])].sort((a: any, b: any) => Number(b.yearOfPassing || b.year || 0) - Number(a.yearOfPassing || a.year || 0))[0];
  if (acad) {
    const level = acad.level === 'Other' ? acad.customLevel : acad.level;
    const yop = acad.yearOfPassing || acad.year;
    return [level, acad.course].filter(Boolean).join(' – ') + (yop ? ` (${yop})` : '');
  }
  return s.educationLevel || '';
}

function englishTest(s: any) {
  if (s.englishScore?.type) return `${s.englishScore.type}${s.englishScore.score != null ? ` – ${s.englishScore.score}` : ''}`;
  if (s.englishProficiencyTest?.name) return `${s.englishProficiencyTest.name}${s.englishProficiencyTest.score ? ` – ${s.englishProficiencyTest.score}` : ''}`;
  if (s.moi?.institution) return `MOI – ${s.moi.institution}`;
  return '';
}

function workExperience(s: any) {
  const exp = s.experienceDetails || [];
  if (!exp.length) return '';
  const cur = exp.find((e: any) => e.current) || exp[0];
  const first = [cur.role, cur.company].filter(Boolean).join(' at ');
  return exp.length > 1 ? `${first} (+${exp.length - 1} more)` : first;
}

function preferredIntake(s: any) {
  const intakes = (s.applications || []).map((a: any) => a.intake).filter(Boolean);
  return Array.from(new Set(intakes)).join(', ');
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="py-4 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 break-words min-w-0">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

function ContactRow({ icon: Icon, children }: { icon: any; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm min-w-0">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <span className="min-w-0 truncate">{children || <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

export default function StudentInfoPanel({ student, owner, canEdit, onStudentChange }: {
  student: any;
  owner?: { name: string; title?: string } | null;
  canEdit: boolean;
  onStudentChange: (s: any) => void;
}) {
  const tags: string[] = student.tags || [];
  const [addingTag, setAddingTag] = useState(false);
  const [tagText, setTagText] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [summary, setSummary] = useState(student.summary || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const saveMeta = async (data: { tags?: string[]; summary?: string }) => {
    setSaving(true); setError('');
    try {
      const u = await api.students.setMeta(sid(student), data);
      onStudentChange({ ...student, tags: u.tags, summary: u.summary, updatedAt: u.updatedAt });
      return true;
    } catch (err: any) {
      setError(err.message || 'Could not save.');
      return false;
    } finally { setSaving(false); }
  };

  const addTag = async (t: string) => {
    const tag = t.trim();
    if (!tag || tags.some(x => x.toLowerCase() === tag.toLowerCase())) { setTagText(''); return; }
    if (await saveMeta({ tags: [...tags, tag] })) { setTagText(''); setAddingTag(false); }
  };

  const location = [student.address?.city, student.address?.state, student.address?.country].filter(Boolean).join(', ') || student.nationality;

  return (
    <div className="px-5">
      <Section title="Basic Info">
        <ContactRow icon={Mail}>
          {student.email && <a href={`mailto:${student.email}`} className="text-blue-600 hover:underline">{student.email}</a>}
        </ContactRow>
        <ContactRow icon={Phone}>
          {student.phone && <a href={`tel:${student.phone}`} className="text-gray-900 hover:text-blue-600">{student.phone}</a>}
        </ContactRow>
        <ContactRow icon={MessageCircle}>
          {student.phone && (
            <a href={`https://wa.me/${whatsappNumber(student.phone)}`} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">
              WhatsApp
            </a>
          )}
        </ContactRow>
        <ContactRow icon={MapPin}>{location}</ContactRow>
      </Section>

      <Section title="Tags" action={canEdit && !addingTag && (
        <button type="button" onClick={() => setAddingTag(true)} aria-label="Add tag"
          className="w-6 h-6 flex items-center justify-center rounded-full text-blue-600 hover:bg-blue-50">
          <Plus className="w-4 h-4" />
        </button>
      )}>
        {tags.length === 0 && !addingTag && <p className="text-sm text-gray-300">No tags</p>}
        <div className="flex flex-wrap gap-1.5">
          {tags.map(t => (
            <span key={t} className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${tagColor(t)}`}>
              {t}
              {canEdit && (
                <button type="button" onClick={() => saveMeta({ tags: tags.filter(x => x !== t) })} disabled={saving}
                  aria-label={`Remove tag ${t}`} className="opacity-60 hover:opacity-100">
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        {addingTag && (
          <div className="mt-2.5 space-y-2">
            <div className="flex gap-1.5">
              <input autoFocus value={tagText} onChange={e => setTagText(e.target.value)} maxLength={40}
                onKeyDown={e => { if (e.key === 'Enter') addTag(tagText); if (e.key === 'Escape') setAddingTag(false); }}
                placeholder="New tag…" className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => addTag(tagText)} disabled={saving || !tagText.trim()} aria-label="Save tag"
                className="px-2.5 rounded-lg bg-blue-600 text-white disabled:opacity-50"><Check className="w-4 h-4" /></button>
              <button type="button" onClick={() => { setAddingTag(false); setTagText(''); }} aria-label="Cancel"
                className="px-2.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_TAGS.filter(s => !tags.some(t => t.toLowerCase() === s.toLowerCase())).map(s => (
                <button key={s} type="button" onClick={() => addTag(s)} disabled={saving}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600">
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Description" action={canEdit && !editingSummary && (
        <button type="button" onClick={() => { setSummary(student.summary || ''); setEditingSummary(true); }} aria-label="Edit description"
          className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}>
        {editingSummary ? (
          <div className="space-y-2">
            <textarea autoFocus value={summary} onChange={e => setSummary(e.target.value)} rows={4} maxLength={2000}
              placeholder="Quick summary: goals, situation, anything the team should know…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setEditingSummary(false)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" disabled={saving}
                onClick={async () => { if (await saveMeta({ summary })) setEditingSummary(false); }}
                className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : student.summary
          ? <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{student.summary}</p>
          : <p className="text-sm text-gray-300">No description</p>}
      </Section>

      {error && <p className="text-xs text-red-600 -mt-2 mb-2">{error}</p>}

      <Section title="Other Info">
        <InfoRow label="Counselor" value={owner ? <>{owner.name}{owner.title && <span className="text-gray-400"> · {owner.title}</span>}</> : 'Unassigned'} />
        <InfoRow label="Lead Stage" value={leadStageOf(student).label} />
        <InfoRow label="Status" value={humanize(student.status)} />
        <InfoRow label="Lead Source" value={SOURCE[student.source]} />
        <InfoRow label="Destination" value={(student.preferredCountries || []).join(', ')} />
        <InfoRow label="Preferred Courses" value={(student.interestedCourses || []).join(', ')} />
        <InfoRow label="Preferred Intake" value={preferredIntake(student)} />
        <InfoRow label="Qualification & YOP" value={qualification(student)} />
        <InfoRow label="GPA" value={student.gpa != null ? `${student.gpa}/10` : ''} />
        <InfoRow label="English Test" value={englishTest(student)} />
        <InfoRow label="Work" value={workExperience(student)} />
        <InfoRow label="Budget" value={student.budget ? `$${Number(student.budget).toLocaleString()}/yr` : ''} />
        <InfoRow label="Date of Birth" value={student.dateOfBirth} />
        <InfoRow label="Gender" value={humanize(student.gender)} />
        <InfoRow label="Nationality" value={student.nationality} />
        <InfoRow label="Passport No." value={student.passport?.number} />
        <InfoRow label="Joined" value={student.joinedDate || (student.createdAt && new Date(student.createdAt).toLocaleDateString())} />
      </Section>

      {student.updatedAt && (
        <p className="text-xs text-gray-400 pb-4">Last modified {fmtDateTime(student.updatedAt)}</p>
      )}
    </div>
  );
}
