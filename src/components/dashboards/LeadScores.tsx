import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { api } from '../../api';

type Data = Awaited<ReturnType<typeof api.dashboards.leadScores>>;

const BAND: Record<string, { label: string; cls: string }> = {
  hot: { label: 'Hot', cls: 'bg-red-50 text-red-700' },
  warm: { label: 'Warm', cls: 'bg-amber-50 text-amber-700' },
  cool: { label: 'Cool', cls: 'bg-blue-50 text-blue-700' },
  cold: { label: 'Cold', cls: 'bg-gray-100 text-gray-600' },
};

// Who to call first: each open lead scored 0-100 on pipeline stage, applications, profile and documents,
// meetings, recent activity and momentum. Hover a score for the reasons behind it.
export default function LeadScores({ studentsPath = '/counselor/students' }: { studentsPath?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => api.dashboards.leadScores())
      .then(d => { if (live) setData(d); })
      .catch(err => { if (live) setError(err?.message || 'Could not load lead scores.'); });
    return () => { live = false; };
  }, []);

  if (error) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!data) return <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-sm text-gray-400">Loading lead scores…</div>;

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Flame className="w-4 h-4" /> Lead priority</h2>
        <div className="flex gap-1.5 text-xs">
          {(['hot', 'warm', 'cool', 'cold'] as const).map(b => (
            <span key={b} className={`px-2 py-0.5 rounded-full font-medium ${BAND[b].cls}`}>{BAND[b].label} {data.bands[b]}</span>
          ))}
        </div>
      </div>
      {data.leads.length === 0 ? (
        <p className="text-sm text-gray-400">No open leads to score.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {data.leads.map(l => (
            <li key={l.studentId} className="py-2.5 flex items-center gap-3 text-sm">
              <span
                className={`w-12 text-center text-xs font-bold px-2 py-1 rounded-lg ${BAND[l.band]?.cls || ''}`}
                title={l.reasons.map(r => `${r.points > 0 ? '+' : ''}${r.points}  ${r.text}`).join('\n')}
              >
                {l.score}
              </span>
              <div className="flex-1 min-w-0">
                <Link className="text-blue-700 hover:underline font-medium" to={`${studentsPath}?lead=${l.studentId}`}>{l.name}</Link>
                <p className="text-xs text-gray-400 truncate">{l.leadStage.replace(/_/g, ' ')}{l.reasons.find(r => !r.text.startsWith('Pipeline stage'))?.text ? ` · ${l.reasons.find(r => !r.text.startsWith('Pipeline stage'))!.text}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.total > data.leads.length && <p className="text-xs text-gray-400 mt-3">Showing the top {data.leads.length} of {data.total} open leads.</p>}
    </section>
  );
}
