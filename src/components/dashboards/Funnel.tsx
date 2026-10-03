import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import { api } from '../../api';

// Lead-stage funnel: how many leads sit at each pipeline stage, as a proportion of all leads.
export default function Funnel() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.dashboards.funnel>> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.dashboards.funnel()
      .then(d => { if (live) setData(d); })
      .catch(err => { if (live) setError(err.message || 'Could not load the funnel.'); });
    return () => { live = false; };
  }, []);

  if (error) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!data) return <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-sm text-gray-400">Loading funnel…</div>;

  const max = Math.max(...data.stages.map(s => s.count), 1);
  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Filter className="w-4 h-4" /> Lead funnel</h2>
        <span className="text-xs text-gray-500">{data.total} leads</span>
      </div>
      <ul className="space-y-2">
        {data.stages.map(s => (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            <span className="w-36 text-gray-600 truncate">{s.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className="bg-[#0d1b4b] h-2.5 rounded-full" style={{ width: `${(s.count / max) * 100}%` }} />
            </div>
            <span className="w-10 text-right font-semibold text-gray-800">{s.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
