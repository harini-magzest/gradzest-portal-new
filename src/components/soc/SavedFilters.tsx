import { useState, useEffect } from 'react';
import { Bookmark, X } from 'lucide-react';

// Per-analyst saved filter presets, kept in this browser only (localStorage) —
// a convenience, not shared state. Every read/write is wrapped because storage
// can be blocked or unavailable (private windows, disabled site data).

export interface SavedFilter<T> { name: string; filters: T }

function load<T>(storageKey: string): SavedFilter<T>[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function save<T>(storageKey: string, list: SavedFilter<T>[]) {
  try { localStorage.setItem(storageKey, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

// `onDark`: it sits directly on the dark page background (Incidents, Activity) rather than inside a white card, where the
// lighter grey is what keeps its text legible.
export default function SavedFilters<T>({ storageKey, current, onApply, onDark = false }: {
  storageKey: string; current: T; onApply: (filters: T) => void; onDark?: boolean;
}) {
  const [list, setList] = useState<SavedFilter<T>[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { setList(load<T>(storageKey)); }, [storageKey]);

  const persist = (next: SavedFilter<T>[]) => { setList(next); save(storageKey, next); };

  const saveCurrent = () => {
    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) return;
    persist([...list.filter(f => f.name !== trimmed), { name: trimmed, filters: current }].slice(-10));
    setName(''); setNaming(false);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {list.map(f => (
        <span key={f.name} className="inline-flex items-center gap-1 text-xs font-medium bg-purple-50 text-purple-700 rounded-full pl-2.5 pr-1 py-1">
          <button type="button" onClick={() => onApply(f.filters)} className="hover:underline">{f.name}</button>
          <button type="button" aria-label={`Delete saved filter ${f.name}`} onClick={() => persist(list.filter(x => x.name !== f.name))}
            className="p-0.5 rounded-full hover:bg-purple-100"><X className="w-3 h-3" /></button>
        </span>
      ))}
      {naming ? (
        <span className="inline-flex items-center gap-1">
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Name this view"
            onKeyDown={e => { if (e.key === 'Enter') saveCurrent(); if (e.key === 'Escape') setNaming(false); }}
            className="px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-32" />
          <button type="button" onClick={saveCurrent} className="text-xs font-semibold text-purple-700 hover:underline">Save</button>
        </span>
      ) : (
        <button type="button" onClick={() => setNaming(true)}
          className={`inline-flex items-center gap-1 text-xs font-medium ${onDark ? 'text-gray-400' : 'text-gray-500'} hover:text-purple-700 px-2 py-1 rounded-lg hover:bg-gray-100`}>
          <Bookmark className="w-3 h-3" /> Save view
        </button>
      )}
    </div>
  );
}
