import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../../api';

export type SearchPage = { label: string; to: string; hint?: string };
export type SearchTeamMember = { id: string; name: string; email: string; kind: 'counselor' | 'appteam' };
/** What the top search offers in a staff workspace: its student pages, its own pages, and where a team member opens */
export type SearchConfig = { basePath: string; pages: SearchPage[]; teamLink?: (t: SearchTeamMember) => string | null };

type Result = { key: string; group: string; title: string; subtitle: string; to: string };

// Find a student by name, email or phone. Admins search everyone; counselors only their own students.
// When `pages` is given (a staff workspace) it also finds universities, courses and pages, plus team
// members wherever `teamLink` says they open.
export default function GlobalSearch({ basePath, pages, teamLink }: Partial<SearchConfig> & { basePath: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof api.dashboards.search>> | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) { setData(null); setError(''); return; }
    timer.current = window.setTimeout(() => {
      api.dashboards.search(q.trim())
        .then(d => { setData(d); setError(''); })
        .catch(err => setError(err.message || 'Search failed.'));
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out: Result[] = (pages || [])
      .filter(p => p.label.toLowerCase().includes(term) || p.hint?.toLowerCase().includes(term))
      .slice(0, 6)
      .map(p => ({ key: `page-${p.to}`, group: 'Pages', title: p.label, subtitle: p.hint || '', to: p.to }));
    if (!data) return out;
    for (const s of data.students) out.push({ key: `s-${s.id}`, group: 'Students', title: s.name, subtitle: `${s.email || 'no email'} · ${s.leadStage.replace(/_/g, ' ')}`, to: `${basePath}/${s.id}` });
    if (!pages) return out;
    for (const t of data.team || []) {
      const to = teamLink?.(t);
      if (to) out.push({ key: `t-${t.id}`, group: 'Team', title: t.name, subtitle: `${t.kind === 'counselor' ? 'Counselor' : 'Application Team'} · ${t.email}`, to });
    }
    for (const u of data.universities || []) out.push({ key: `u-${u.id}`, group: 'Universities', title: u.name, subtitle: [u.city, u.country].filter(Boolean).join(', '), to: `/university/${u.id}` });
    for (const c of data.courses || []) out.push({ key: `c-${c.universityId}-${c.id}`, group: 'Courses', title: c.name, subtitle: [c.level, c.universityName].filter(Boolean).join(' · '), to: `/university/${c.universityId}/course/${c.id}` });
    return out;
  }, [q, data, pages, basePath, teamLink]);

  useEffect(() => { setActive(0); }, [results]);

  const go = (r: Result) => { setQ(''); setOpen(false); navigate(r.to); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]); }
  };

  const placeholder = !pages ? 'Find a student…' : teamLink ? 'Search students, team, universities, pages…' : 'Search students, universities, pages…';
  const searched = !!data && q.trim().length >= 2;
  const showPanel = open && (results.length > 0 || !!error || searched);

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-1.5">
        <Search className="w-4 h-4 text-gray-400" />
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          placeholder={placeholder} aria-label={placeholder} className="bg-transparent text-sm outline-hidden w-full" />
      </div>
      {showPanel && (
        <div className="absolute z-50 mt-1 w-full min-w-[20rem] right-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1 max-h-96 overflow-y-auto">
          {error && <p className="px-3 py-2 text-sm text-red-600">{error}</p>}
          {!error && results.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No matches for “{q.trim()}”</p>}
          {results.map((r, i) => (
            <div key={r.key}>
              {(i === 0 || results[i - 1].group !== r.group) && (
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{r.group}</p>
              )}
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => go(r)} onMouseEnter={() => setActive(i)}
                className={`block w-full text-left px-3 py-2 text-sm ${i === active ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                <span className="font-medium text-gray-800">{r.title}</span>
                {r.subtitle && <span className="block text-xs text-gray-400 truncate">{r.subtitle}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
