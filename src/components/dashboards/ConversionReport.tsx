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

function Rate({ value }: { value: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden sm:block w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-violet-600 rounded-full" style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="w-10 text-right tabular-nums">{value}%</span>
    </div>
  );
}

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

  const dateCls = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-violet-500 focus:border-transparent';

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
      <div className="flex flex-col gap-4 px-6 pt-6 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Conversion report</h2>
          <p className="text-xs text-gray-500 mt-0.5">Of the leads created in the period, how many applied, received an offer and enrolled</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex p-0.5 bg-gray-100 rounded-lg" role="group" aria-label="Group by">
            {GROUPS.map(g => (
              <button key={g.key} type="button" onClick={() => setGroupBy(g.key)} aria-pressed={groupBy === g.key}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${groupBy === g.key ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className={dateCls} />
            <span className="text-gray-400">to</span>
            <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className={dateCls} />
          </div>
          <button type="button" onClick={download} disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="px-6 pb-6 text-sm text-red-600">{error}</p>
      ) : !data ? (
        <p className="px-6 pb-6 text-sm text-gray-400 py-6 text-center">Loading…</p>
      ) : data.rows.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-gray-400 py-6 text-center">No leads in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500 border-y border-gray-100">
                <th className="px-6 py-2.5 font-medium">{GROUPS.find(g => g.key === groupBy)!.label}</th>
                <th className="px-3 py-2.5 font-medium text-right">Leads</th>
                <th className="px-3 py-2.5 font-medium text-right">Applied</th>
                <th className="px-3 py-2.5 font-medium text-right">Offers</th>
                <th className="px-3 py-2.5 font-medium text-right">Enrolled</th>
                <th className="px-6 py-2.5 font-medium text-right">Lead → enrolled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.map(r => (
                <tr key={r.group} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-900 font-medium">{r.group}</td>
                  <td className="px-3 py-3 text-right text-gray-700 tabular-nums">{r.leads}</td>
                  <td className="px-3 py-3 text-right text-gray-700 tabular-nums">
                    {r.applied} <span className="text-xs text-gray-400">({r.leadToApplied}%)</span>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700 tabular-nums" title={`${r.appliedToOffer}% of applied leads received an offer`}>
                    {r.offers} <span className="text-xs text-gray-400">({r.appliedToOffer}%)</span>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700 tabular-nums">{r.enrolled}</td>
                  <td className="px-6 py-3 text-gray-900"><Rate value={r.leadToEnrolled} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-900">
                <td className="px-6 py-3">Total</td>
                <td className="px-3 py-3 text-right tabular-nums">{data.totals.leads}</td>
                <td className="px-3 py-3 text-right tabular-nums">{data.totals.applied} <span className="text-xs font-normal text-gray-500">({data.totals.leadToApplied}%)</span></td>
                <td className="px-3 py-3 text-right tabular-nums">{data.totals.offers} <span className="text-xs font-normal text-gray-500">({data.totals.appliedToOffer}%)</span></td>
                <td className="px-3 py-3 text-right tabular-nums">{data.totals.enrolled}</td>
                <td className="px-6 py-3"><Rate value={data.totals.leadToEnrolled} /></td>
              </tr>
            </tfoot>
          </table>
          <p className="px-6 py-3 text-xs text-gray-400 border-t border-gray-100">
            Applied % is of all leads; offer % is of applied leads.{groupBy === 'country' ? ' A student interested in several countries counts under each, so rows can add up to more than the total.' : ''}
          </p>
        </div>
      )}
    </section>
  );
}
