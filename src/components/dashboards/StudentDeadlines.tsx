import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Circle, Clock } from 'lucide-react';
import { api } from '../../api';

// Counting down to each application's intake, and a checklist of the documents most
// applications ask for, marked by whether the student has uploaded and had them verified.
const CHECKLIST: { label: string; keywords: string[] }[] = [
  { label: 'Passport', keywords: ['passport'] },
  { label: 'Academic transcripts', keywords: ['transcript'] },
  { label: 'Degree certificate', keywords: ['degree'] },
  { label: 'English test score', keywords: ['english', 'ielts', 'toefl', 'pte', 'duolingo'] },
  { label: 'Bank statement', keywords: ['bank'] },
  { label: 'Reference letters', keywords: ['reference'] },
  { label: 'Statement of purpose', keywords: ['sop', 'statement'] },
];

// Accepts "September 2027", "Sep 2027", "2027-09-01" — the same formats the deadline reminder job reads.
function parseIntake(intake: string): Date | null {
  if (!intake) return null;
  const d = new Date(intake);
  if (!isNaN(d.getTime())) return d;
  const m = intake.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const p = new Date(`${m[1]} 1, ${m[2]}`);
    if (!isNaN(p.getTime())) return p;
  }
  return null;
}

export default function StudentDeadlines() {
  const [profile, setProfile] = useState<any | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.students.me()
      .then(p => { if (live) setProfile(p); })
      .catch(err => { if (live) setError(err.message || 'Could not load your deadlines.'); });
    return () => { live = false; };
  }, []);

  if (error) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!profile) return <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-sm text-gray-400">Loading deadlines…</div>;

  const openApps = (profile.applications || []).filter((a: any) => !['rejected', 'enrolled'].includes(a.status));
  const docs: any[] = profile.documents || [];

  const checklist = CHECKLIST.map(item => {
    const matches = docs.filter(d => item.keywords.some(k => `${d.type || ''} ${d.name || ''}`.toLowerCase().includes(k)));
    const state = matches.some(d => d.status === 'verified') ? 'verified' : matches.length ? 'pending' : 'missing';
    return { ...item, state };
  });

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm grid gap-6 md:grid-cols-2">
      <div>
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3"><CalendarClock className="w-4 h-4" /> Intake deadlines</h2>
        {openApps.length === 0 ? <p className="text-sm text-gray-400">No open applications with an intake date.</p> : (
          <ul className="space-y-2 text-sm">
            {openApps.map((a: any) => {
              const when = parseIntake(a.intake);
              const days = when ? Math.ceil((when.getTime() - Date.now()) / 86400000) : null;
              return (
                <li key={a._id || a.universityName} className="flex items-center justify-between gap-3">
                  <span className="text-gray-800 truncate">{a.universityName || 'Application'}{a.intake ? ` · ${a.intake}` : ''}</span>
                  <span className={`text-xs font-semibold whitespace-nowrap ${days === null ? 'text-gray-400' : days <= 30 ? 'text-red-700' : 'text-gray-600'}`}>
                    {days === null ? 'No date' : days < 0 ? 'Passed' : `${days} day${days === 1 ? '' : 's'} left`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Document checklist</h2>
        <ul className="space-y-2 text-sm">
          {checklist.map(c => (
            <li key={c.label} className="flex items-center gap-2">
              {c.state === 'verified' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : c.state === 'pending' ? <Clock className="w-4 h-4 text-amber-500" /> : <Circle className="w-4 h-4 text-gray-300" />}
              <span className={c.state === 'verified' ? 'text-gray-500 line-through' : 'text-gray-800'}>{c.label}</span>
              <span className="ml-auto text-xs text-gray-400">{c.state === 'verified' ? 'Verified' : c.state === 'pending' ? 'Awaiting check' : 'Not uploaded'}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
