import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { api } from '../../api';

type Week = { week: string; newLeads: number; offers: number };

const SERIES = [
  { key: 'newLeads', label: 'New leads', bar: 'bg-violet-600' },
  { key: 'offers', label: 'Offers', bar: 'bg-emerald-600' },
] as const;

// Round the axis maximum up to a readable number (1, 2, 5, 10, 20, 50, …)
function niceMax(n: number) {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 5, 10].find(m => m * pow >= n)!;
  return step * pow;
}

function Delta({ now, before }: { now: number; before?: number }) {
  if (before === undefined) return null;
  const diff = now - before;
  if (diff === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-gray-500"><Minus className="w-3 h-3" />same as last week</span>;
  const up = diff > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-700' : 'text-red-600'}`}>
      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {up ? '+' : ''}{diff} vs last week
    </span>
  );
}

// Eight-week view of new leads and offers, for admin, App Team and Board.
export default function WeeklyTrends() {
  const [weeks, setWeeks] = useState<Week[] | null>(null);
  const [error, setError] = useState('');
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    api.dashboards.trends()
      .then(d => { if (live) setWeeks(d.weeks); })
      .catch(err => { if (live) setError(err.message || 'Could not load weekly trends.'); });
    return () => { live = false; };
  }, []);

  if (error) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;

  const latest = weeks?.[weeks.length - 1];
  const previous = weeks?.[weeks.length - 2];
  const top = weeks ? niceMax(Math.max(...weeks.flatMap(w => [w.newLeads, w.offers]), 1)) : 4;
  const ticks = [top, top / 2, 0];
  const weekLabel = (w: string) => `W${w.split('-W')[1] ?? w}`;

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Weekly activity</h2>
          <p className="text-xs text-gray-500 mt-0.5">New leads and offers over the last 8 weeks</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          {SERIES.map(s => (
            <span key={s.key} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-xs ${s.bar}`} />{s.label}</span>
          ))}
        </div>
      </div>

      {/* This week at a glance */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {SERIES.map(s => (
          <div key={s.key} className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
            <p className="text-xs text-gray-500">{s.label} this week</p>
            <p className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{latest ? latest[s.key] : '–'}</p>
            {latest && <Delta now={latest[s.key]} before={previous?.[s.key]} />}
          </div>
        ))}
      </div>

      {!weeks ? (
        <div className="h-44 bg-gray-50 rounded-lg animate-pulse" aria-hidden />
      ) : (
        <div className="flex gap-3">
          {/* Y axis */}
          <div className="flex flex-col justify-between h-40 text-[11px] text-gray-400 tabular-nums text-right w-6 -mt-1.5">
            {ticks.map(t => <span key={t}>{t}</span>)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="relative h-40" onMouseLeave={() => setHover(null)}>
              {/* Gridlines */}
              {ticks.map((t, i) => (
                <div key={t} className={`absolute inset-x-0 border-t ${i === ticks.length - 1 ? 'border-gray-300' : 'border-dashed border-gray-100'}`}
                  style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
              ))}
              {/* Bars */}
              <div className="absolute inset-0 flex">
                {weeks.map((w, i) => (
                  <div key={w.week} className={`relative flex-1 flex items-end justify-center gap-0.5 px-1.5 rounded-md transition-colors ${hover === i ? 'bg-violet-50/70' : ''}`}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
                    aria-label={`${weekLabel(w.week)}: ${w.newLeads} new leads, ${w.offers} offers`}>
                    {SERIES.map(s => (
                      <div key={s.key} className={`w-full max-w-[14px] rounded-t ${s.bar}`}
                        style={{ height: w[s.key] > 0 ? `max(${(w[s.key] / top) * 100}%, 2px)` : 0 }} />
                    ))}
                    {hover === i && (
                      <div className={`absolute bottom-full mb-2 z-10 w-36 rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-lg pointer-events-none
                        ${i < 2 ? 'left-0' : i > weeks.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
                        <p className="font-semibold mb-1">Week {w.week.split('-W')[1]}{i === weeks.length - 1 ? ' (this week)' : ''}</p>
                        {SERIES.map(s => (
                          <p key={s.key} className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-gray-300"><span className={`w-2 h-2 rounded-xs ${s.bar}`} />{s.label}</span>
                            <span className="font-semibold tabular-nums">{w[s.key]}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* X axis */}
            <div className="flex mt-2">
              {weeks.map((w, i) => (
                <span key={w.week} className={`flex-1 text-center text-[11px] tabular-nums ${i === weeks.length - 1 ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>
                  {weekLabel(w.week)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
