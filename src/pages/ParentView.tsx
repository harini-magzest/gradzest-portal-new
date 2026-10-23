import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, XCircle } from 'lucide-react';
import { api } from '../api';

type View = Awaited<ReturnType<typeof api.parent.view>>;

function intakeText(a: View['applications'][number]) {
  if (!a.intake) return '';
  if (a.daysToIntake === null) return `Intake: ${a.intake}`;
  if (a.intakePassed) return `Intake ${a.intake} has passed`;
  return `Intake ${a.intake}, in ${a.daysToIntake} day${a.daysToIntake === 1 ? '' : 's'}`;
}

function when(date: string, time: string) {
  return new Date(`${date}T${time}`).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// What a parent sees through the link their child shared: progress only, no personal records. Needs no account.
export default function ParentView() {
  const { token = '' } = useParams();
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState('');

  // The link is private: keep it out of search engines
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  useEffect(() => {
    let live = true;
    api.parent.view(token)
      .then(d => { if (live) setData(d); })
      .catch(err => { if (live) setError(err?.message || 'This link is not valid.'); });
    return () => { live = false; };
  }, [token]);

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Gradzest · Parent view</p>
          <h1 className="text-2xl font-bold text-gray-900">{data ? `${data.studentName}'s progress` : 'Student progress'}</h1>
          {data?.counselorName && <p className="text-sm text-gray-500">Counselor: {data.counselorName}</p>}
        </header>

        {error && <div role="alert" className="bg-white border border-red-200 text-red-700 rounded-2xl px-5 py-4 text-sm">{error}</div>}
        {!data && !error && <p className="text-sm text-gray-400">Loading…</p>}

        {data && (
          <>
            <section className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Applications</h2>
              {data.applications.length === 0 ? <p className="text-sm text-gray-400">No applications yet.</p> : (
                <div className="space-y-5">
                  {data.applications.map((a, i) => (
                    <article key={i}>
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <h3 className="font-medium text-gray-900">{a.universityName}</h3>
                          <p className="text-sm text-gray-500">{a.courseName}</p>
                        </div>
                        <p className="text-xs text-gray-500 text-right">{intakeText(a)}</p>
                      </div>
                      {a.rejected ? (
                        <p className="mt-2 flex items-center gap-2 text-sm text-red-700"><XCircle className="w-4 h-4" /> This application was not successful.</p>
                      ) : (
                        <ol className="mt-3 grid grid-cols-5 gap-1">
                          {a.steps.map(s => (
                            <li key={s.label} className="flex flex-col items-center text-center">
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${s.state === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : s.state === 'current' ? 'bg-white border-blue-600 text-blue-600' : 'bg-white border-gray-200 text-gray-300'}`}>
                                {s.state === 'done' ? <Check className="w-4 h-4" /> : s.state === 'current' ? '•' : ''}
                              </span>
                              <span className={`mt-1 text-[11px] leading-tight ${s.state === 'upcoming' ? 'text-gray-400' : 'text-gray-700 font-medium'}`}>{s.label}</span>
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

            {data.documents && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
                <h2 className="font-semibold text-gray-900 mb-2">Documents</h2>
                <p className="text-sm text-gray-600">{data.documents.verified} verified · {data.documents.uploaded} awaiting review · {data.documents.missing} still needed</p>
                {data.documents.stillNeeded.length > 0 && (
                  <>
                    <p className="text-xs text-gray-500 mt-3 mb-1">Still needed:</p>
                    <ul className="list-disc list-inside text-sm text-gray-700">{data.documents.stillNeeded.map(d => <li key={d}>{d}</li>)}</ul>
                  </>
                )}
              </section>
            )}

            {data.upcomingMeetings.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
                <h2 className="font-semibold text-gray-900 mb-2">Upcoming calls</h2>
                <ul className="text-sm text-gray-700 space-y-1">{data.upcomingMeetings.map((m, i) => <li key={i}>{m.title} <span className="text-gray-400">· {when(m.date, m.time)}</span></li>)}</ul>
              </section>
            )}

            <p className="text-xs text-gray-400 text-center">Shared by the student. This link shows progress only and expires on {new Date(data.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>
          </>
        )}
      </div>
    </main>
  );
}
