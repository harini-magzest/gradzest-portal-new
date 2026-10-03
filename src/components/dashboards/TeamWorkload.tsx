import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../../api';

// Admin view of each counselor's load: how many leads they hold, how many have stalled,
// open daily alerts, and overdue tasks. Sorted so the most stretched counselors appear first.
export default function TeamWorkload() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.dashboards.teamWorkload>>['rows'] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.dashboards.teamWorkload()
      .then(d => { if (live) setRows(d.rows); })
      .catch(err => { if (live) setError(err.message || 'Could not load team workload.'); });
    return () => { live = false; };
  }, []);

  if (error) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!rows) return <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-sm text-gray-400">Loading team workload…</div>;

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4"><Users className="w-4 h-4" /> Team workload</h2>
      {rows.length === 0 ? <p className="text-sm text-gray-400">No counselors yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-2 font-medium">Counselor</th><th className="py-2 font-medium text-right">Leads</th>
              <th className="py-2 font-medium text-right">Stalled</th><th className="py-2 font-medium text-right">Open alerts</th>
              <th className="py-2 font-medium text-right">Overdue tasks</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.counselorId} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2.5 text-right text-gray-600">{r.leads}</td>
                  <td className={`py-2.5 text-right ${r.staleLeads > 0 ? 'text-amber-700 font-semibold' : 'text-gray-600'}`}>{r.staleLeads}</td>
                  <td className="py-2.5 text-right text-gray-600">{r.openAlerts}</td>
                  <td className={`py-2.5 text-right ${r.overdueTasks > 0 ? 'text-red-700 font-semibold' : 'text-gray-600'}`}>{r.overdueTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
