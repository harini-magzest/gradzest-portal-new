import { useState, useEffect } from 'react';
import { Timer, Hourglass, AlarmClock, Flag } from 'lucide-react';
import { api } from '../../api';
import { TYPE_LABEL, humanDuration } from './incidentShared';

export type Period = '24h' | '7d' | '30d';

// "+18% vs previous 24h" style delta. For threat counts, up is bad (red).
export function deltaLabel(current: number, previous: number | undefined, period: Period): { text: string; up: boolean | null } {
  if (previous === undefined) return { text: '', up: null };
  const vs = `vs previous ${period}`;
  if (previous === 0) return current === 0 ? { text: `no change ${vs}`, up: null } : { text: `new ${vs}`, up: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct === 0 ? { text: `no change ${vs}`, up: null } : { text: `${pct > 0 ? '+' : ''}${pct}% ${vs}`, up: pct > 0 };
}

function MiniStat({ icon: Icon, label, value, sub, alert }: { icon: any; label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${alert ? 'bg-red-50 text-red-600' : 'bg-purple-50 text-purple-600'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-bold ${alert ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
        <p className="text-xs font-medium text-gray-600">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-sm font-bold text-gray-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-gray-400 italic py-4 text-center">{text}</p>;

function Bar({ label, value, max, right }: { label: React.ReactNode; value: number; max: number; right?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1 gap-2">
        <span className="text-gray-700 truncate">{label}</span>
        <span className="text-gray-500 font-semibold flex-shrink-0">{right ?? value}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

export default function OverviewInsights({ stats, period }: { stats: any; period: Period }) {
  const [geo, setGeo] = useState<{ countries: { country: string; countryCode: string; count: number; ips: number }[]; unresolved: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState(true);

  // Geolocation does live lookups, so it loads separately and never blocks the rest.
  useEffect(() => {
    let cancelled = false;
    setGeoLoading(true);
    api.soc.statsGeo(period).then(d => { if (!cancelled) setGeo(d); }).catch(() => { if (!cancelled) setGeo(null); })
      .finally(() => { if (!cancelled) setGeoLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  const age = stats.openByAge || {};
  const ageRows = [
    { label: 'Under 1 day', value: age.lt1d || 0 }, { label: '1–3 days', value: age.d1to3 || 0 },
    { label: '3–7 days', value: age.d3to7 || 0 }, { label: 'Over 7 days', value: age.gt7d || 0 },
  ];
  const ageMax = Math.max(1, ...ageRows.map(r => r.value));
  const openTotal = ageRows.reduce((a, r) => a + r.value, 0);
  const incDelta = deltaLabel(stats.incidentsCreated ?? 0, stats.previous?.incidentsCreated, period);
  const countries = geo?.countries || [];
  const countryMax = Math.max(1, ...countries.map(c => c.count));
  const targeted = stats.targetedAccounts || [];
  const targetedMax = Math.max(1, ...targeted.map((t: any) => t.count));
  const rules = stats.ruleEffectiveness || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat icon={Timer} label="Mean time to acknowledge" value={stats.mttaMs != null ? humanDuration(stats.mttaMs) : '—'} sub={`incidents opened in last ${period}`} />
        <MiniStat icon={Hourglass} label="Mean time to resolve" value={stats.mttrMs != null ? humanDuration(stats.mttrMs) : '—'} sub={`incidents opened in last ${period}`} />
        <MiniStat icon={AlarmClock} label="Open incidents past SLA" value={String(stats.slaBreached ?? 0)} sub={`of ${openTotal} open`} alert={(stats.slaBreached ?? 0) > 0} />
        <MiniStat icon={Flag} label="Incidents opened" value={String(stats.incidentsCreated ?? 0)} sub={incDelta.text} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Open backlog by age">
          {openTotal === 0 ? <Empty text="No open incidents" /> : (
            <div className="space-y-3">{ageRows.map(r => <Bar key={r.label} label={r.label} value={r.value} max={ageMax} />)}</div>
          )}
        </Card>
        <Card title="Where hostile traffic comes from">
          {geoLoading ? <Empty text="Looking up locations…" /> : countries.length === 0 ? <Empty text="No geolocated activity in this period" /> : (
            <div className="space-y-3">
              {countries.slice(0, 8).map(c => <Bar key={c.country} label={c.country} value={c.count} max={countryMax} right={`${c.count} · ${c.ips} IP${c.ips !== 1 ? 's' : ''}`} />)}
              {geo && geo.unresolved > 0 && <p className="text-[11px] text-gray-400">{geo.unresolved} events from private/unlocatable addresses not shown.</p>}
            </div>
          )}
        </Card>
        <Card title="Most targeted accounts (failed logins)">
          {targeted.length === 0 ? <Empty text="No failed logins in this period" /> : (
            <div className="space-y-3">
              {targeted.slice(0, 8).map((t: any) => <Bar key={t.email} label={<span className="font-mono">{t.email}</span>} value={t.count} max={targetedMax} right={`${t.count} · ${t.distinctIps} IP${t.distinctIps !== 1 ? 's' : ''}`} />)}
            </div>
          )}
        </Card>
        <Card title="Detection rule effectiveness">
          {rules.length === 0 ? <Empty text="No incidents in this period" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 uppercase">
                    <th className="pb-2 font-semibold">Rule</th><th className="pb-2 font-semibold text-right">Total</th>
                    <th className="pb-2 font-semibold text-right">Open</th><th className="pb-2 font-semibold text-right">Resolved</th>
                    <th className="pb-2 font-semibold text-right" title="False positives ÷ (false positives + resolved)">FP rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r: any) => (
                    <tr key={r.type} className="border-t border-gray-50">
                      <td className="py-1.5 text-gray-700">{TYPE_LABEL[r.type] || r.type}</td>
                      <td className="py-1.5 text-right text-gray-700">{r.total}</td>
                      <td className="py-1.5 text-right text-gray-500">{r.open}</td>
                      <td className="py-1.5 text-right text-gray-500">{r.resolved}</td>
                      <td className={`py-1.5 text-right font-semibold ${r.falsePositiveRate != null && r.falsePositiveRate >= 0.5 ? 'text-red-600' : 'text-gray-500'}`}>
                        {r.falsePositiveRate == null ? '—' : `${Math.round(r.falsePositiveRate * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-400 mt-2">A high false-positive rate means the rule is noisy — tune its threshold or add a suppression rule.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
