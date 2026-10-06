import { useState, useEffect, useMemo, useCallback } from 'react';
import { Scale, Search, X, AlertCircle, Loader2, Plus, Info } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import {
  estimateCost, compareToBudget, findCountry, courseKey, formatMoney, formatRange,
  type BudgetPeriod, type Estimate, type Verdict, type Rates,
} from '../utils/costEstimate';

const MAX_PICKED = 4;
const PREFS_KEY = 'gz_compare_costs_prefs';

interface Option { key: string; label: string; uni: any; course: any }

function loadPrefs(): { budget?: string; budgetCurrency?: string; period?: BudgetPeriod; rates?: Record<string, string> } {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { return {}; }
}
function savePrefs(p: object) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable: the page works without it */ }
}

const percent = (v?: number) => (typeof v === 'number' ? `${Math.round(v <= 1 ? v * 100 : v)}%` : '—');

const VERDICT_STYLE: Record<Verdict, string> = {
  within: 'bg-green-50 text-green-700 border-green-200',
  tight: 'bg-amber-50 text-amber-700 border-amber-200',
  over: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-gray-50 text-gray-500 border-gray-200',
};
const VERDICT_LABEL: Record<Verdict, string> = {
  within: 'Within your budget',
  tight: 'Tight: covers the lower estimate only',
  over: 'Over your budget',
  unknown: "Can't tell yet",
};

function verdictHint(est: Estimate, budgetSet: boolean, rateNeeded: boolean): string {
  if (!budgetSet) return 'Enter a budget to compare.';
  if (rateNeeded) return 'Add the exchange rate above.';
  if (est.partial) return 'Some costs are not on file, so this can only rule a course out.';
  return '';
}

export default function CompareCosts() {
  const { user } = useAuth() as { user?: { budget?: number } };
  const prefs = useMemo(loadPrefs, []);

  const [unis, setUnis] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [budget, setBudget] = useState(prefs.budget ?? (user?.budget && user.budget > 0 ? String(user.budget) : ''));
  const [budgetCurrency, setBudgetCurrency] = useState(prefs.budgetCurrency ?? '');
  const [period, setPeriod] = useState<BudgetPeriod>(prefs.period ?? 'total');
  const [rateInputs, setRateInputs] = useState<Record<string, string>>(prefs.rates ?? {});

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [u, c] = await Promise.all([api.universities.list(), api.countries.list()]);
      setUnis(Array.isArray(u) ? u : []);
      setCountries(Array.isArray(c) ? c : []);
    } catch (e: any) {
      setError(e?.message || 'Could not load universities and countries.');
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { savePrefs({ budget, budgetCurrency, period, rates: rateInputs }); }, [budget, budgetCurrency, period, rateInputs]);

  const options: Option[] = useMemo(() => unis.flatMap((uni) =>
    (uni.courses || []).map((course: any) => ({ key: courseKey(uni, course), label: `${uni.name} — ${course.name}`, uni, course }))), [unis]);
  const byKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);

  const selected = picked.map((k) => byKey.get(k)).filter(Boolean) as Option[];
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return options.filter((o) => !picked.includes(o.key) && `${o.label} ${o.uni.country || ''}`.toLowerCase().includes(q)).slice(0, 8);
  }, [options, search, picked]);

  const currencies = useMemo(() => [...new Set(selected.map((s) => String(s.course.currency || '').toUpperCase()).filter(Boolean))], [selected]);
  const [targetPick, setTargetPick] = useState('');
  const target = (targetPick && currencies.includes(targetPick) ? targetPick : currencies[0]) || 'USD';

  const rates: Rates = useMemo(() => {
    const out: Rates = {};
    for (const [c, v] of Object.entries(rateInputs)) { const n = parseFloat(v); if (n > 0) out[c.toUpperCase()] = n; }
    return out;
  }, [rateInputs]);

  const estimates = useMemo(() => selected.map((s) =>
    estimateCost(s.uni, s.course, findCountry(countries, s.uni.country), { targetCurrency: target, rates })), [selected, countries, target, rates]);

  const budgetNumber = parseFloat(budget);
  const budgetSet = Number.isFinite(budgetNumber) && budgetNumber > 0;
  const bCur = (budgetCurrency || '').trim().toUpperCase() || target;
  // Which currencies need a rate is decided WITHOUT the rates typed so far. Otherwise the box for a currency vanishes
  // the instant a valid rate is typed ("0.8" of "0.85"), and the rest of the number is lost.
  const neededRates = useMemo(() => [...new Set(selected.flatMap((s) =>
    estimateCost(s.uni, s.course, findCountry(countries, s.uni.country), { targetCurrency: target, rates: {} }).needsRates))], [selected, countries, target]);
  const rateCurrencies = [...new Set([...neededRates, ...(bCur.length === 3 && bCur !== target && budgetSet ? [bCur] : [])])]
    .filter((c) => c !== target).sort();

  const add = (key: string) => { if (picked.length < MAX_PICKED) setPicked([...picked, key]); setSearch(''); };
  const remove = (key: string) => setPicked(picked.filter((k) => k !== key));

  const inputCls = 'px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';

  if (loading) return <div className="flex items-center justify-center gap-2 p-12 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading universities…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0"><Scale className="w-5 h-5" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Compare &amp; cost</h1>
          <p className="text-sm text-gray-500">Put up to {MAX_PICKED} courses side by side and see what each would roughly cost.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button type="button" onClick={load} className="text-xs font-semibold text-red-700 hover:text-red-800 flex-shrink-0">Retry</button>
        </div>
      )}

      {/* Picker */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search courses"
            disabled={picked.length >= MAX_PICKED}
            placeholder={picked.length >= MAX_PICKED ? `You can compare up to ${MAX_PICKED} courses` : 'Search a university or course, e.g. “MBA”, “Manchester”'}
            className={`${inputCls} w-full pl-9`} />
        </div>
        {matches.length > 0 && (
          <ul className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden" aria-label="Search results">
            {matches.map((o) => (
              <li key={o.key}>
                <button type="button" onClick={() => add(o.key)} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-sky-50">
                  <Plus className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{o.label}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{o.uni.country}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {search.trim().length >= 2 && matches.length === 0 && <p className="text-sm text-gray-400">No matching courses.</p>}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-800 border border-sky-100 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium">
                <span className="max-w-[220px] truncate">{s.label}</span>
                <button type="button" onClick={() => remove(s.key)} aria-label={`Remove ${s.label}`} className="p-0.5 rounded-full hover:bg-sky-100"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
        <div className="flex flex-col items-center text-center py-14 text-gray-400">
          <Scale className="w-10 h-10 text-gray-200 mb-3" />
          <p className="text-sm font-semibold text-gray-500">Nothing to compare yet</p>
          <p className="text-xs mt-1 max-w-sm">Search for a course above and add it. Add two or more to see them side by side.</p>
        </div>
      ) : (
        <>
          {/* Budget and rates */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-gray-500">My budget
                <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" aria-label="My budget" placeholder="e.g. 45000" className={`${inputCls} block mt-1 w-36`} />
              </label>
              <label className="text-xs font-semibold text-gray-500">Currency
                <input value={budgetCurrency} onChange={(e) => setBudgetCurrency(e.target.value.toUpperCase().slice(0, 3))} aria-label="Budget currency" placeholder={target} className={`${inputCls} block mt-1 w-20 uppercase`} />
              </label>
              <div role="group" aria-label="Budget covers" className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                {([['total', 'Whole course'], ['year', 'Per year']] as [BudgetPeriod, string][]).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={period === v} onClick={() => setPeriod(v)}
                    className={`px-3 py-2 ${period === v ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
                ))}
              </div>
              {currencies.length > 1 && (
                <label className="text-xs font-semibold text-gray-500">Show totals in
                  <select value={target} onChange={(e) => setTargetPick(e.target.value)} aria-label="Show totals in" className={`${inputCls} block mt-1`}>
                    {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              )}
            </div>
            {rateCurrencies.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
                <p className="text-xs text-amber-800 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  These courses or costs are in different currencies. We don't guess exchange rates — enter today's rate to see a combined total.</p>
                <div className="flex flex-wrap gap-3">
                  {rateCurrencies.map((c) => (
                    <label key={c} className="text-xs text-amber-900 flex items-center gap-1.5">1 {c} =
                      <input value={rateInputs[c] ?? ''} onChange={(e) => setRateInputs({ ...rateInputs, [c]: e.target.value })} inputMode="decimal"
                        aria-label={`Exchange rate ${c} to ${target}`} className={`${inputCls} w-24`} /> {target}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Side-by-side table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="sticky left-0 bg-white text-left px-4 py-3 w-40" />
                  {selected.map((s) => (
                    <th key={s.key} className="text-left px-4 py-3 align-top">
                      <p className="font-bold text-gray-900">{s.course.name}</p>
                      <p className="text-xs font-medium text-gray-500">{s.uni.name}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <Row label="Country" cells={selected.map((s) => [s.uni.city, s.uni.country].filter(Boolean).join(', ') || '—')} />
                <Row label="Level" cells={selected.map((s) => s.course.level || '—')} />
                <Row label="Duration" cells={selected.map((s) => s.course.duration || '—')} />
                <Row label="Intakes" cells={selected.map((s) => (s.course.intake || []).join(', ') || '—')} />
                <Row label="Application deadlines" cells={selected.map((s) => (s.uni.applicationDeadlines || []).map((d: any) => `${d.intake}: ${d.deadline}`).join('; ') || '—')} />
                <Row label="Ranking" cells={selected.map((s) => (s.uni.ranking ? `#${s.uni.ranking}` : '—'))} />
                <Row label="Acceptance rate" cells={selected.map((s) => percent(s.uni.acceptanceRate))} />
                <Row label="Entry requirements" cells={selected.map((s) => {
                  const el = s.course.eligibility || {};
                  const parts = [el.minGPA ? `GPA ${el.minGPA}+` : '', ...(el.englishRequirements || []).map((r: any) => `${r.test} ${r.minScore}`)].filter(Boolean);
                  return parts.join(', ') || '—';
                })} />
                <Row label="Scholarships" cells={selected.map((s) => {
                  const own = s.course.scholarshipAvailable ? (s.course.scholarshipAmount ? `Available (${s.course.scholarshipAmount})` : 'Available') : '';
                  const uniList = (s.uni.scholarships || []).slice(0, 2).map((x: any) => x.name).filter(Boolean).join(', ');
                  return [own, uniList].filter(Boolean).join(' · ') || 'None listed';
                })} />

                <SectionRow label={`Estimated costs (${target})`} span={selected.length + 1} />
                <Row label="Tuition per year" cells={estimates.map((e) => formatMoney(e.tuitionPerYear))} />
                <Row label="Tuition, whole course" cells={estimates.map((e) => formatMoney(e.tuitionTotal))} />
                <Row label="Application & registration" cells={estimates.map((e) => formatMoney(e.oneOffFees))} />
                <Row label="Living costs per year" cells={estimates.map((e) => (e.livingPerYear ? `${formatMoney(e.livingPerYear.low)} – ${Math.round(e.livingPerYear.high.amount).toLocaleString('en-US')}` : '—'))} />
                <Row label="First year, estimated" strong cells={estimates.map((e) => formatRange(e.firstYear, e.targetCurrency))} />
                <Row label="Whole course, estimated" strong cells={estimates.map((e) => formatRange(e.total, e.targetCurrency))} />
                <Row label="Visa proof of funds" cells={estimates.map((e) => (e.visaFunds ? `${formatMoney(e.visaFunds)} (shown, not added)` : '—'))} />
                <tr>
                  <th scope="row" className="sticky left-0 bg-white text-left px-4 py-3 text-xs font-semibold text-gray-500 align-top">Against my budget</th>
                  {estimates.map((e, i) => {
                    const v = compareToBudget(e, budgetNumber, bCur, period, rates);
                    const hint = v === 'unknown' ? verdictHint(e, budgetSet, e.needsRates.length > 0 || (bCur !== target && !rates[bCur])) : '';
                    return (
                      <td key={i} className="px-4 py-3 align-top">
                        <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-lg border ${VERDICT_STYLE[v]}`}>{VERDICT_LABEL[v]}</span>
                        {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row" className="sticky left-0 bg-white text-left px-4 py-3 text-xs font-semibold text-gray-500 align-top">Not on file</th>
                  {estimates.map((e, i) => (
                    <td key={i} className="px-4 py-3 align-top text-xs">
                      {e.missing.length ? <span className="text-amber-700">⚠ {e.missing.join(', ')}</span> : <span className="text-gray-300">Nothing missing</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">
            Estimates use the fees and living-cost ranges in this portal's catalogue, which can be out of date. Tuition is treated as a yearly fee. Always confirm
            current costs, deadlines and requirements with the university and your counselor before you apply.
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, cells, strong }: { label: string; cells: string[]; strong?: boolean }) {
  return (
    <tr>
      <th scope="row" className="sticky left-0 bg-white text-left px-4 py-2.5 text-xs font-semibold text-gray-500 align-top">{label}</th>
      {cells.map((c, i) => <td key={i} className={`px-4 py-2.5 align-top ${strong ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{c}</td>)}
    </tr>
  );
}
function SectionRow({ label, span }: { label: string; span: number }) {
  return <tr><th colSpan={span} className="text-left bg-gray-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</th></tr>;
}
