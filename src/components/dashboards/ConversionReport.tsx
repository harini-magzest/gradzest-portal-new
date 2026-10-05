import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../../api';

type Report = Awaited<ReturnType<typeof api.dashboards.conversion>>;
type GroupBy = 'counselor' | 'country' | 'source';

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: 'counselor', label: 'Counselor' },
  { key: 'country', label: 'Country' },
  { key: 'source', label: 'Lead source' },
];

// Of the leads created in the period, how many applied, got an offer and enrolled. A student interested in
// several countries counts under each, so country rows can add up to more than the total.
export default function ConversionReport() {
  const [groupBy, setGroupBy] = useState<GroupBy>('counselor');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let live = true;
    setError('');
    Promise.resolve()
      .then(() => api.dashboards.conversion({ groupBy, from, to }))
      .then(d => { if (live) setData(d); })
      .catch(err => { if (live) setError(err?.message || 'Could not load the conversion report.'); });
    return () => { live = false; };
  }, [groupBy, from, to]);

  const download = async () => {
    setDownloading(true);
    try { await api.dashboards.conversionCsv({ groupBy, from, to }); }
    catch (err: any) { setError(err?.message || 'Download failed.'); }
    finally { setDownloading(false); }
  };

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-gray-900">Conversion report</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="Group by">
            {GROUPS.map(g => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGroupBy(g.key)}
                aria-pressed={groupBy === g.key}
                className={`px-3 py-1.5 ${groupBy === g.key ? 'bg-[#0d1b4b] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <label className="text-gray-500">From <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1" /></label>
          <label className="text-gray-500">To <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1" /></label>
          <button type="button" onClick={download} disabled={downloading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      ) : !data ? (
        <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
      ) : data.rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No leads in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 font-medium">{GROUPS.find(g => g.key === groupBy)!.label}</th>
                <th className="py-2 font-medium text-right">Leads</th>
                <th className="py-2 font-medium text-right">Applied</th>
                <th className="py-2 font-medium text-right">Offers</th>
                <th className="py-2 font-medium text-right">Enrolled</th>
                <th className="py-2 font-medium text-right">Lead → enrolled</th>
              </tr>
            </thead>
            <tbody>
              {[...data.rows, { ...data.totals, group: 'Total' }].map((r, i, all) => (
                <tr key={r.group} className={`border-b border-gray-50 last:border-0 ${i === all.length - 1 ? 'font-semibold bg-gray-50' : ''}`}>
                  <td className="py-2.5 text-gray-800">{r.group}</td>
                  <td className="py-2.5 text-right text-gray-600">{r.leads}</td>
                  <td className="py-2.5 text-right text-gray-600">{r.applied} <span className="text-xs text-gray-400">({r.leadToApplied}%)</span></td>
                  <td className="py-2.5 text-right text-gray-600">{r.offers} <span className="text-xs text-gray-400">({r.appliedToOffer}% of applied)</span></td>
                  <td className="py-2.5 text-right text-gray-600">{r.enrolled}</td>
                  <td className="py-2.5 text-right text-gray-800">{r.leadToEnrolled}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
