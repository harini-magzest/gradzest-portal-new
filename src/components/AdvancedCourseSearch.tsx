import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, X, ChevronDown, RotateCcw, Plus, Check } from 'lucide-react';
import { CourseFilters, EMPTY_FILTERS, activeFilterChips, filterOptions } from '../utils/courseSearch';

const EDU_LEVELS = ['12th Grade', 'Diploma', 'Certificate', 'Bachelor', 'Master', 'PhD'];
const ENGLISH_TESTS = ['IELTS', 'TOEFL', 'PTE', 'Duolingo'];
const RANKINGS = ['50', '100', '200', '300', '500', '1000'];

type Accent = 'green' | 'purple';
const ACCENT: Record<Accent, { btn: string; ring: string; chip: string; on: string }> = {
  green:  { btn: 'bg-green-600 hover:bg-green-700',   ring: 'focus:ring-green-500',  chip: 'bg-green-50 text-green-800 border-green-200',   on: 'bg-green-600 text-white border-green-600' },
  purple: { btn: 'bg-purple-600 hover:bg-purple-700', ring: 'focus:ring-purple-500', chip: 'bg-purple-50 text-purple-800 border-purple-200', on: 'bg-purple-600 text-white border-purple-600' },
};

function MultiSelect({ label, options, value, onChange, ring }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; ring: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const shown = options.filter(o => o.toLowerCase().includes(q.toLowerCase()));
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter(v => v !== o) : [...value, o]);
  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <button type="button" onClick={() => setOpen(v => !v)} disabled={!options.length}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-left disabled:bg-gray-50 disabled:text-gray-300 focus:outline-none focus:ring-2 ${ring}`}>
        <span className={`truncate ${value.length ? 'text-gray-900' : 'text-gray-400'}`}>
          {!options.length ? 'No data yet' : value.length ? (value.length <= 2 ? value.join(', ') : `${value.length} selected`) : 'Any'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[12rem] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {options.length > 6 && (
            <div className="p-2 border-b border-gray-100">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                className="w-full px-2.5 py-1.5 bg-gray-50 rounded-lg text-sm outline-none" />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {shown.map(o => (
              <button key={o} type="button" onClick={() => toggle(o)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50">
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${value.includes(o) ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300'}`}>
                  {value.includes(o) && <Check className="w-3 h-3" />}
                </span>
                <span className="truncate">{o}</span>
              </button>
            ))}
            {!shown.length && <p className="px-3 py-2 text-xs text-gray-400">No matches</p>}
          </div>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="w-full text-xs text-gray-500 hover:text-gray-800 border-t border-gray-100 py-1.5">Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-1">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function AdvancedCourseSearch({ courses, students = [], value, onSearch, accent = 'green', resultCount }: {
  courses: any[];
  students?: any[];
  value: CourseFilters;
  onSearch: (f: CourseFilters) => void;
  accent?: Accent;
  resultCount: number;
}) {
  const a = ACCENT[accent];
  const [draft, setDraft] = useState<CourseFilters>(value);
  const [open, setOpen] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);

  const opts = useMemo(() => filterOptions(courses), [courses]);
  const set = <K extends keyof CourseFilters>(k: K, v: CourseFilters[K]) => setDraft(d => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const chips = activeFilterChips(value, students);
  const inp = `w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 ${a.ring}`;
  const run = () => onSearch(draft);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      {/* Keyword row */}
      <div className="p-4 sm:p-5 flex flex-col lg:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={draft.keyword} onChange={e => set('keyword', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') run(); }}
            placeholder="Course, subject, university, city, tag…" aria-label="Keyword"
            className={`w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${a.ring}`} />
        </div>
        <select value={draft.matchMode} onChange={e => set('matchMode', e.target.value as CourseFilters['matchMode'])} aria-label="Keyword match"
          className={`px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 ${a.ring}`}>
          <option value="all">All words</option>
          <option value="any">Any word</option>
          <option value="exact">Exact phrase</option>
        </select>
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <SlidersHorizontal className="w-4 h-4" /> Filters
          {chips.length > 0 && <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${a.on}`}>{chips.length}</span>}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" onClick={run}
          className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm ${a.btn}`}>
          <Search className="w-4 h-4" /> Advanced Search
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 p-4 sm:p-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-6">
            <Group title="Location & university">
              <MultiSelect label="Country" options={opts.countries} value={draft.countries} onChange={v => set('countries', v)} ring={a.ring} />
              <MultiSelect label="City" options={opts.cities} value={draft.cities} onChange={v => set('cities', v)} ring={a.ring} />
              <MultiSelect label="University" options={opts.universities} value={draft.universities} onChange={v => set('universities', v)} ring={a.ring} />
              <div className="grid grid-cols-2 gap-2">
                <MultiSelect label="University type" options={opts.uniTypes} value={draft.uniTypes} onChange={v => set('uniTypes', v)} ring={a.ring} />
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">World ranking</label>
                  <select value={draft.rankingMax} onChange={e => set('rankingMax', e.target.value)} aria-label="World ranking" className={inp}>
                    <option value="">Any</option>
                    {RANKINGS.map(r => <option key={r} value={r}>Top {r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Acceptance rate at least (%)</label>
                <input type="number" min={0} max={100} value={draft.acceptanceMin} onChange={e => set('acceptanceMin', e.target.value)} placeholder="Any" className={inp} />
              </div>
            </Group>

            <Group title="Program">
              <MultiSelect label="Study level" options={opts.levels} value={draft.levels} onChange={v => set('levels', v)} ring={a.ring} />
              <MultiSelect label="Discipline / department" options={opts.departments} value={draft.departments} onChange={v => set('departments', v)} ring={a.ring} />
              <MultiSelect label="Intake" options={opts.intakes} value={draft.intakes} onChange={v => set('intakes', v)} ring={a.ring} />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Duration (years)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min={0} step={0.5} value={draft.durationMin} onChange={e => set('durationMin', e.target.value)} placeholder="Min" aria-label="Minimum duration" className={inp} />
                  <input type="number" min={0} step={0.5} value={draft.durationMax} onChange={e => set('durationMax', e.target.value)} placeholder="Max" aria-label="Maximum duration" className={inp} />
                </div>
              </div>
            </Group>

            <Group title="Costs & funding">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tuition per year (USD, approx.)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min={0} step={1000} value={draft.feeMin} onChange={e => set('feeMin', e.target.value)} placeholder="Min" aria-label="Minimum tuition" className={inp} />
                  <input type="number" min={0} step={1000} value={draft.feeMax} onChange={e => set('feeMax', e.target.value)} placeholder="Max" aria-label="Maximum tuition" className={inp} />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Fees in other currencies are converted at approximate rates.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Application fee at most (USD)</label>
                <input type="number" min={0} value={draft.appFeeMax} onChange={e => set('appFeeMax', e.target.value)} placeholder="Any" className={inp} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={draft.appFeeWaived} onChange={e => set('appFeeWaived', e.target.checked)} className="rounded" /> No application fee
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={draft.scholarship} onChange={e => set('scholarship', e.target.checked)} className="rounded" /> Scholarship available
              </label>
            </Group>

            <Group title="Student eligibility">
              {students.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Match a student's profile</label>
                  <select value={draft.studentId} aria-label="Match a student"
                    onChange={e => setDraft(d => ({ ...d, studentId: e.target.value, eligibility: e.target.value && d.eligibility === 'any' ? 'hide_not_eligible' : d.eligibility }))}
                    className={inp}>
                    <option value="">No student — enter scores below</option>
                    {students.map(s => <option key={s._id || s.id} value={String(s._id || s.id)}>{s.name}{s.email ? ` (${s.email})` : ''}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Show</label>
                <select value={draft.eligibility} onChange={e => set('eligibility', e.target.value as CourseFilters['eligibility'])} aria-label="Eligibility" className={inp}>
                  <option value="any">All courses (show eligibility badges)</option>
                  <option value="hide_not_eligible">Hide courses they don't qualify for</option>
                  <option value="eligible_only">Only courses they fully qualify for</option>
                </select>
              </div>
              {!draft.studentId && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Highest education</label>
                      <select value={draft.educationLevel} onChange={e => set('educationLevel', e.target.value)} aria-label="Highest education" className={inp}>
                        <option value="">Any</option>
                        {EDU_LEVELS.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">GPA / %</label>
                      <input type="number" min={0} step={0.1} value={draft.gpa} onChange={e => set('gpa', e.target.value)} placeholder="e.g. 7.5" className={inp} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">English test</label>
                      <select value={draft.englishTest} onChange={e => set('englishTest', e.target.value)} aria-label="English test" className={inp}>
                        <option value="">None</option>
                        {ENGLISH_TESTS.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Score</label>
                      <input type="number" min={0} step={0.5} value={draft.englishScore} onChange={e => set('englishScore', e.target.value)} disabled={!draft.englishTest}
                        placeholder={draft.englishTest === 'IELTS' ? 'e.g. 6.5' : 'Score'} className={`${inp} disabled:bg-gray-50`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Work (yrs)</label>
                      <input type="number" min={0} step={0.5} value={draft.workYears} onChange={e => set('workYears', e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Age</label>
                      <input type="number" min={14} max={80} value={draft.age} onChange={e => set('age', e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Nationality</label>
                      <input value={draft.nationality} onChange={e => set('nationality', e.target.value)} placeholder="e.g. Indian" className={inp} />
                    </div>
                  </div>
                </>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={draft.noEnglishTest} onChange={e => set('noEnglishTest', e.target.checked)} className="rounded" /> No English test required
              </label>
            </Group>

            <Group title="Custom tags & details">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-500">Tags</label>
                  {draft.tags.length > 1 && (
                    <select value={draft.tagMode} onChange={e => set('tagMode', e.target.value as 'all' | 'any')} aria-label="Tag match"
                      className="text-xs border border-gray-200 rounded-md px-1.5 py-0.5 bg-white">
                      <option value="any">Match any</option>
                      <option value="all">Match all</option>
                    </select>
                  )}
                </div>
                {opts.tags.length === 0
                  ? <p className="text-xs text-gray-400">No tags yet. Add them from a course's "Tags &amp; details" button.</p>
                  : (
                    <div className="flex flex-wrap gap-1.5">
                      {opts.tags.map(t => {
                        const on = draft.tags.includes(t);
                        return (
                          <button key={t} type="button" onClick={() => set('tags', on ? draft.tags.filter(x => x !== t) : [...draft.tags, t])}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? a.on : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                            #{t}
                          </button>
                        );
                      })}
                    </div>
                  )}
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-500">Custom details</label>
                {draft.customFields.map((cf, i) => {
                  const update = (patch: Partial<typeof cf>) => set('customFields', draft.customFields.map((x, j) => j === i ? { ...x, ...patch } : x));
                  return (
                    <div key={i} className="grid grid-cols-[1fr_4.5rem_1fr_auto] gap-1.5">
                      <select value={cf.key} onChange={e => update({ key: e.target.value, value: '' })} aria-label="Detail" className={`${inp} px-2`}>
                        <option value="">Detail…</option>
                        {opts.customFieldKeys.map(k => <option key={k}>{k}</option>)}
                      </select>
                      <select value={cf.op} onChange={e => update({ op: e.target.value as typeof cf.op })} aria-label="Condition" className={`${inp} px-1.5`}>
                        <option value="is">is</option><option value="contains">has</option><option value="gte">≥</option><option value="lte">≤</option>
                      </select>
                      <input value={cf.value} onChange={e => update({ value: e.target.value })} list={`cf-values-${i}`} placeholder="Any value" aria-label="Value" className={`${inp} px-2`} />
                      <datalist id={`cf-values-${i}`}>{(opts.customFieldValues[cf.key] || []).map(v => <option key={v} value={v} />)}</datalist>
                      <button type="button" onClick={() => set('customFields', draft.customFields.filter((_, j) => j !== i))} aria-label="Remove condition"
                        className="px-1.5 text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </div>
                  );
                })}
                {opts.customFieldKeys.length === 0
                  ? <p className="text-xs text-gray-400">No custom details yet.</p>
                  : (
                    <button type="button" onClick={() => set('customFields', [...draft.customFields, { key: '', op: 'is', value: '' }])}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900">
                      <Plus className="w-3.5 h-3.5" /> Add condition
                    </button>
                  )}
              </div>
            </Group>

            <Group title="Sort results">
              <select value={draft.sort} onChange={e => set('sort', e.target.value as CourseFilters['sort'])} aria-label="Sort by" className={inp}>
                <option value="relevance">Best match</option>
                <option value="fee_asc">Tuition: low to high</option>
                <option value="fee_desc">Tuition: high to low</option>
                <option value="ranking">University ranking</option>
                <option value="app_fee">Application fee: low to high</option>
                <option value="duration">Duration: shortest first</option>
                <option value="name">Course name A–Z</option>
                <option value="recent">Recently updated</option>
              </select>
            </Group>
          </div>

          <div className="flex items-center justify-end gap-3 flex-wrap pt-2 border-t border-gray-100">
            {dirty && <span className="text-xs text-amber-700 mr-auto">You have changes — click Advanced Search to apply them.</span>}
            <button type="button" onClick={() => { setDraft(EMPTY_FILTERS); onSearch(EMPTY_FILTERS); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">
              <RotateCcw className="w-4 h-4" /> Reset all
            </button>
            <button type="button" onClick={run}
              className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-sm ${a.btn}`}>
              <Search className="w-4 h-4" /> Advanced Search
            </button>
          </div>
        </div>
      )}

      {/* Applied filters */}
      <div className="border-t border-gray-100 px-4 sm:px-5 py-3 flex items-center gap-2 flex-wrap">
        <p className="text-sm text-gray-600 mr-1"><span className="font-semibold text-gray-900">{resultCount}</span> course{resultCount !== 1 ? 's' : ''} found</p>
        {chips.map(c => (
          <span key={c.label} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${a.chip}`}>
            {c.label}
            <button type="button" onClick={() => onSearch(c.clear(value))} aria-label={`Remove ${c.label}`} className="opacity-60 hover:opacity-100">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {chips.length > 1 && (
          <button type="button" onClick={() => onSearch({ ...EMPTY_FILTERS, sort: value.sort })} className="text-xs text-gray-500 hover:text-gray-800 underline">Clear all</button>
        )}
        {dirty && !open && <span className="text-xs text-amber-700 ml-auto">Click Advanced Search to apply your changes.</span>}
      </div>
    </div>
  );
}
