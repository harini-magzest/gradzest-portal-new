import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Scale, Trash2 } from 'lucide-react';
import { api } from '../../api';

type Uni = Awaited<ReturnType<typeof api.savedUniversities.list>>[number];
type Comparison = Awaited<ReturnType<typeof api.universities.compare>>;

const MAX_COMPARE = 4;

function show(value: unknown, format: string, currency: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'money') return `${currency ? `${currency} ` : ''}${Number(value).toLocaleString('en-IN')}`;
  if (format === 'rank') return `#${value}`;
  return String(value);
}

// Universities the student saved, with a side-by-side comparison of up to four of them.
export default function StudentSavedUniversities() {
  const [list, setList] = useState<Uni[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async () => {
    try { setList(await api.savedUniversities.list()); setError(''); }
    catch (err: any) { setError(err?.message || 'Could not load your shortlist.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setResult(null);
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id]));
  };

  const remove = async (id: string) => {
    try {
      await api.savedUniversities.remove(id);
      setPicked(p => p.filter(x => x !== id));
      setResult(null);
      await load();
    } catch (err: any) { setError(err?.message || 'Could not remove that university.'); }
  };

  const runCompare = async () => {
    setComparing(true);
    setError('');
    try { setResult(await api.universities.compare(picked)); }
    catch (err: any) { setError(err?.message || 'Could not compare those universities.'); }
    finally { setComparing(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Heart className="w-5 h-5 text-rose-500" /> Saved universities</h1>
        <p className="text-sm text-gray-500 mt-1">Save universities with the heart on the <Link to="/student/universities" className="text-blue-700 hover:underline">Universities</Link> page, then pick two to four to compare side by side.</p>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {!list && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {list && list.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 p-6">No saved universities yet.</p>}

      {list && list.length > 0 && (
        <>
          <ul className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {list.map(u => {
              const on = picked.includes(u.id);
              return (
                <li key={u.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={on} disabled={!on && picked.length >= MAX_COMPARE} onChange={() => toggle(u.id)} aria-label={`Compare ${u.name}`} className="w-4 h-4" />
                  <div className="flex-1 min-w-0">
                    <Link to={`/university/${u.id}`} className="font-medium text-gray-900 hover:text-blue-700">{u.name}</Link>
                    <p className="text-xs text-gray-500">{[u.city, u.country].filter(Boolean).join(', ')}{u.ranking ? ` · #${u.ranking} world` : ''}</p>
                  </div>
                  <button type="button" onClick={() => remove(u.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${u.name}`}><Trash2 className="w-4 h-4" /></button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-3">
            <button type="button" onClick={runCompare} disabled={picked.length < 2 || comparing} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-medium disabled:opacity-40">
              <Scale className="w-4 h-4" /> {comparing ? 'Comparing…' : 'Compare'}
            </button>
            <span className="text-xs text-gray-400">{picked.length < 2 ? 'Tick at least two' : `${picked.length} of ${MAX_COMPARE} selected`}</span>
          </div>
        </>
      )}

      {result && (
        <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="py-3 px-4 font-medium text-gray-500" />
                {result.universities.map(u => (
                  <th key={u.id} className="py-3 px-4 font-semibold text-gray-900 align-top min-w-40">
                    {u.name}<span className="block text-xs font-normal text-gray-500">{[u.city, u.country].filter(Boolean).join(', ')}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map(r => (
                <tr key={r.key} className="border-b border-gray-50">
                  <th scope="row" className="py-2.5 px-4 text-left font-medium text-gray-500">{r.label}</th>
                  {r.values.map((v, i) => (
                    <td key={i} className={`py-2.5 px-4 ${r.best?.includes(i) ? 'text-emerald-700 font-semibold bg-emerald-50' : 'text-gray-800'}`}>
                      {show(v, r.format, result.universities[i].currency)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-b border-gray-50">
                <th scope="row" className="py-2.5 px-4 text-left font-medium text-gray-500">Intakes</th>
                {result.universities.map(u => <td key={u.id} className="py-2.5 px-4 text-gray-800">{u.intakes.join(', ') || '—'}</td>)}
              </tr>
              <tr>
                <th scope="row" className="py-2.5 px-4 text-left font-medium text-gray-500">Next deadline</th>
                {result.universities.map(u => (
                  <td key={u.id} className="py-2.5 px-4 text-gray-800">
                    {u.nextDeadline ? `${u.nextDeadline.intake ? `${u.nextDeadline.intake}: ` : ''}${new Date(u.nextDeadline.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-400 px-4 py-3">Green marks the best value in each row. Fees and deadlines can change, so confirm them with your counselor or the university.</p>
        </div>
      )}
    </div>
  );
}
