import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../../api';

// Find a student by name, email or phone. Admins search everyone; counselors only their own students.
export default function GlobalSearch({ basePath }: { basePath: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; email: string; leadStage: string }[]>([]);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); setError(''); return; }
    timer.current = window.setTimeout(() => {
      api.dashboards.search(q.trim())
        .then(d => { setResults(d.students); setError(''); })
        .catch(err => setError(err.message || 'Search failed.'));
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="relative w-full max-w-xs">
      <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-1.5">
        <Search className="w-4 h-4 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a student…"
          aria-label="Find a student" className="bg-transparent text-sm outline-none w-full" />
      </div>
      {(results.length > 0 || error) && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 py-1 max-h-72 overflow-y-auto">
          {error && <p className="px-3 py-2 text-sm text-red-600">{error}</p>}
          {results.map(r => (
            <Link key={r.id} to={`${basePath}?lead=${r.id}`} onClick={() => setQ('')}
              className="block px-3 py-2 text-sm hover:bg-gray-50">
              <span className="font-medium text-gray-800">{r.name}</span>
              <span className="block text-xs text-gray-400">{r.email || 'no email'} · {r.leadStage.replace(/_/g, ' ')}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
