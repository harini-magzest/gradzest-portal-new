import { useEffect, useState } from 'react';
import { api } from '../../api';

type FunnelData = Awaited<ReturnType<typeof api.dashboards.funnel>>;
type Totals = Awaited<ReturnType<typeof api.dashboards.conversion>>['totals'];

// Lead funnel: the all-time journey from lead to enrolment (with the conversion between each step), then how many
// leads sit at each pipeline stage right now, as a proportion of all leads.
export default function Funnel() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    api.dashboards.funnel()
      .then(d => { if (live) setData(d); })
      .catch(err => { if (live) setError(err.message || 'Could not load the funnel.'); });
    // The journey is optional: without it the card still shows the stage breakdown
    api.dashboards.conversion({ groupBy: 'counselor', from: '', to: '' })
      .then(d => { if (live) setTotals(d.totals); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (error) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;

  const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
  // Empty stages are hidden by default so the card shows where leads actually are
  const activeStages = data ? data.stages.filter(s => s.count > 0) : [];
  const emptyCount = data ? data.stages.length - activeStages.length : 0;
  const shown = showAll ? data?.stages ?? [] : activeStages;

  const journey = totals ? [
    { label: 'Leads', value: totals.leads },
    { label: 'Applied', value: totals.applied },
    { label: 'Offers', value: totals.offers },
    { label: 'Enrolled', value: totals.enrolled },
  ] : null;

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Lead funnel</h2>
          <p className="text-xs text-gray-500 mt-0.5">From first enquiry to enrolment, and where leads sit today</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{data ? data.total : '–'}</p>
          <p className="text-xs text-gray-500 mt-1">total leads</p>
        </div>
      </div>

      {/* Journey: each step as a share of all leads, with the conversion from the step before */}
      {journey && journey[0].value > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-6">
          {journey.map((step, i) => {
            const prev = journey[i - 1];
            return (
              <div key={step.label} className="relative rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-3"
                title={prev ? `${pct(step.value, prev.value)}% of ${prev.label.toLowerCase()} reached ${step.label.toLowerCase()}` : 'All leads'}>
                <p className="text-xs text-gray-500">{step.label}</p>
                <p className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{step.value}</p>
                <div className="h-1.5 bg-gray-200/70 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-violet-600 rounded-full" style={{ width: step.value > 0 ? `max(${pct(step.value, journey[0].value)}%, 4px)` : '0%' }} />
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 tabular-nums">
                  {prev ? `${pct(step.value, prev.value)}% of ${prev.label.toLowerCase()}` : '100%'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!data ? (
        <ul className="space-y-4" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => <li key={i} className="h-4 bg-gray-100 rounded animate-pulse" />)}
        </ul>
      ) : data.total === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No leads yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,9rem)_1fr_3rem_3rem] gap-x-3 text-[11px] font-medium uppercase tracking-wide text-gray-400 pb-2 border-b border-gray-100">
            <span>Current stage</span><span>Share of all leads</span><span className="text-right">Leads</span><span className="text-right">%</span>
          </div>
          <ul className="divide-y divide-gray-50">
            {shown.map(s => (
              <li key={s.key} title={`${s.label}: ${s.count} leads (${pct(s.count, data.total)}% of all leads)`}
                className="grid grid-cols-[minmax(0,9rem)_1fr_3rem_3rem] items-center gap-x-3 py-3 text-sm">
                <span className={`truncate ${s.count > 0 ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{s.label}</span>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-600 rounded-full transition-[width] duration-500"
                    style={{ width: s.count > 0 ? `max(${pct(s.count, data.total)}%, 6px)` : '0%' }} />
                </div>
                <span className={`text-right tabular-nums ${s.count > 0 ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{s.count}</span>
                <span className="text-right text-gray-500 tabular-nums">{pct(s.count, data.total)}%</span>
              </li>
            ))}
          </ul>
          {emptyCount > 0 && (
            <div className="mt-auto pt-4 flex items-center justify-between gap-3 border-t border-gray-100 text-xs">
              <span className="text-gray-500">
                {showAll ? `Showing all ${data.stages.length} stages` : `${emptyCount} other stage${emptyCount === 1 ? '' : 's'} with no leads`}
              </span>
              <button type="button" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}
                className="font-semibold text-violet-700 hover:text-violet-800">
                {showAll ? 'Hide empty stages' : 'Show all stages'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
