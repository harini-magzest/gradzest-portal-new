import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { api } from '../../api';

// Eight-week view of new leads and offers, for admin, App Team and Board.
export default function WeeklyTrends() {
  const [weeks, setWeeks] = useState<{ week: string; newLeads: number; offers: number }[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.dashboards.trends()
      .then(d => { if (live) setWeeks(d.weeks); })
      .catch(err => { if (live) setError(err.message || 'Could not load weekly trends.'); });
    return () => { live = false; };
  }, []);

  if (error) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!weeks) return <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-sm text-gray-400">Loading trends…</div>;

  const max = Math.max(...weeks.flatMap(w => [w.newLeads, w.offers]), 1);
  const latest = weeks[weeks.length - 1];
  const previous = weeks[weeks.length - 2];
  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4" /> Last 8 weeks</h2>
      <p className="text-xs text-gray-500 mb-4">This week: {latest.newLeads} new leads, {latest.offers} offers{previous ? ` (last week: ${previous.newLeads} and ${previous.offers})` : ''}</p>
      <div className="flex items-end gap-2 h-32">
        {weeks.map(w => (
          <div key={w.week} className="flex-1 flex flex-col items-center gap-1" title={`${w.week}: ${w.newLeads} new leads, ${w.offers} offers`}>
            <div className="w-full flex items-end gap-0.5 h-24">
              <div className="flex-1 bg-[#0d1b4b] rounded-t" style={{ height: `${(w.newLeads / max) * 100}%` }} />
              <div className="flex-1 bg-emerald-500 rounded-t" style={{ height: `${(w.offers / max) * 100}%` }} />
            </div>
            <span className="text-[10px] text-gray-400">{w.week.split('-W')[1]}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#0d1b4b] rounded-sm" /> New leads</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" /> Offers</span>
      </div>
    </section>
  );
}
