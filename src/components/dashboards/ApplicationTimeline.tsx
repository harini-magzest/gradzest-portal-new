import { useEffect, useState } from 'react';
import { Check, XCircle } from 'lucide-react';
import { api } from '../../api';

interface Step { key: string; label: string; state: 'done' | 'current' | 'upcoming'; at: string | null }
interface AppTimeline {
  id: string;
  universityName: string;
  courseName: string;
  intake: string;
  status: string;
  rejected: boolean;
  steps: Step[];
  daysInStage: number | null;
  daysToIntake: number | null;
  intakePassed: boolean;
  next: string;
}

function fmtDate(d: string | null) {
  if (!d) return '';
  const t = new Date(d);
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function intakeText(a: AppTimeline) {
  if (!a.intake || a.daysToIntake === null) return a.intake ? `Intake: ${a.intake}` : '';
  if (a.intakePassed) return `Intake ${a.intake} has passed`;
  return `Intake ${a.intake}, in ${a.daysToIntake} day${a.daysToIntake === 1 ? '' : 's'}`;
}

// One card per application showing how far it has got, how long it has sat at the current stage, and what to do
// next. With `studentId` it is the staff view of that student; without it, the signed-in student's own.
export default function ApplicationTimeline({ studentId }: { studentId?: string }) {
  const [apps, setApps] = useState<AppTimeline[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (studentId ? api.students.timeline(studentId) : api.students.myTimeline())
      .then(r => { if (live) setApps(r.applications); })
      .catch(err => { if (live) setError(err.message || 'Could not load the application timeline.'); });
    return () => { live = false; };
  }, [studentId]);

  if (error) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!apps) return <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-xs text-sm text-gray-400">Loading applications…</div>;

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-xs">
      <h2 className="font-semibold text-gray-900 mb-4">Application progress</h2>
      {apps.length === 0 ? (
        <p className="text-sm text-gray-400">No applications yet.</p>
      ) : (
        <div className="space-y-6">
          {apps.map(a => (
            <article key={a.id} className="rounded-xl border border-gray-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium text-gray-900">{a.universityName || 'University'}</h3>
                  <p className="text-sm text-gray-500">{a.courseName}</p>
                </div>
                <p className="text-xs text-gray-500 text-right">
                  {intakeText(a)}
                  {a.daysInStage !== null && <span className="block">{a.daysInStage === 0 ? 'Updated today' : `${a.daysInStage} day${a.daysInStage === 1 ? '' : 's'} at this stage`}</span>}
                </p>
              </div>

              {a.rejected ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-red-700"><XCircle className="w-4 h-4" /> This application was not successful.</p>
              ) : (
                <ol className="mt-4 grid grid-cols-5 gap-1">
                  {a.steps.map(s => (
                    <li key={s.key} className="flex flex-col items-center text-center">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                          s.state === 'done' ? 'bg-emerald-500 border-emerald-500 text-white'
                            : s.state === 'current' ? 'bg-white border-blue-600 text-blue-600'
                            : 'bg-white border-gray-200 text-gray-300'
                        }`}
                        aria-current={s.state === 'current' ? 'step' : undefined}
                      >
                        {s.state === 'done' ? <Check className="w-4 h-4" /> : s.state === 'current' ? '•' : ''}
                      </span>
                      <span className={`mt-1 text-[11px] leading-tight ${s.state === 'upcoming' ? 'text-gray-400' : 'text-gray-700 font-medium'}`}>{s.label}</span>
                      <span className="text-[10px] text-gray-400">{fmtDate(s.at)}</span>
                    </li>
                  ))}
                </ol>
              )}

              {a.next && <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2"><span className="font-medium text-gray-800">Next: </span>{a.next}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
