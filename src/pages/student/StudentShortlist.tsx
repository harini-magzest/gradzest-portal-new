import { Link } from 'react-router-dom';
import { Heart, Trash2 } from 'lucide-react';
import { useShortlist } from '../../hooks/useShortlist';

function money(fee: number | null, currency: string): string {
  if (fee === null || fee === undefined) return '—';
  return `${currency ? `${currency} ` : ''}${Number(fee).toLocaleString('en-IN')}`;
}

// Courses the student saved, side by side. The cheapest and the best-ranked are flagged.
export default function StudentShortlist() {
  const { data, error, toggle, busyKey } = useShortlist();
  const key = (universityId: string, courseId: string) => `${universityId}:${courseId}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Heart className="w-5 h-5 text-rose-500" /> My shortlist</h1>
        <p className="text-sm text-gray-500 mt-1">Save courses from the <Link to="/student/courses" className="text-blue-700 hover:underline">Courses</Link> page, then compare them here.</p>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {!data && !error && <p className="text-sm text-gray-400">Loading…</p>}

      {data && data.courses.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-500">
          <p>Nothing saved yet</p>
          <Link to="/student/courses" className="inline-block mt-3 text-blue-700 hover:underline">Browse courses</Link>
        </div>
      )}

      {data && data.courses.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.courses.map(c => {
            const k = key(c.universityId, c.courseId);
            const busy = busyKey === k;
            return (
              <li key={k} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">{c.courseName}</p>
                    <Link to={`/university/${c.universityId}`} className="text-xs text-blue-700 hover:underline">{c.universityName}</Link>
                    <p className="text-xs text-gray-500">{[c.city, c.country].filter(Boolean).join(', ')}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(c.universityId, c.courseId)}
                    aria-label={`Remove ${c.courseName} from shortlist`}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {k === data.cheapest && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Lowest fee</span>}
                  {k === data.bestRanked && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Best ranked</span>}
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <dt className="text-gray-500">Tuition</dt>
                  <dd className="font-semibold text-gray-900">{money(c.tuitionFee, c.currency)}</dd>
                  <dt className="text-gray-500">Application fee</dt>
                  <dd className="text-gray-800">{money(c.applicationFee, c.currency)}</dd>
                  <dt className="text-gray-500">Level</dt>
                  <dd className="text-gray-800">{c.level || '—'}</dd>
                  <dt className="text-gray-500">Duration</dt>
                  <dd className="text-gray-800">{c.duration || '—'}</dd>
                  <dt className="text-gray-500">Ranking</dt>
                  <dd className="text-gray-800">{c.ranking ? `#${c.ranking}` : '—'}</dd>
                  <dt className="text-gray-500">Intakes</dt>
                  <dd className="text-gray-800">{c.intake?.join(', ') || '—'}</dd>
                </dl>

                {c.englishRequirements?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {c.englishRequirements.map(r => (
                      <span key={r.test} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{`${r.test} ${r.minScore}`}</span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data && data.courses.length > 0 && (
        <p className="text-xs text-gray-400">Fees and deadlines can change, so confirm them with your counselor or the university.</p>
      )}
    </div>
  );
}
