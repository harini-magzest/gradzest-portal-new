import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Search, User, Globe, AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { api } from '../../api';
import { errorText } from './ui';

interface Props {
  onOpenUser: (id: string) => void;
  onOpenIp: (ip: string) => void;
  onOpenIncidents: () => void;
  onOpenIncident: (id: string) => void;
  onOpenUploads: () => void;
}

// Defined at module level, not inside GlobalSearch: a component created during render is a new component on every render,
// so React throws the old rows away and rebuilds them each time the search re-renders (a response landing, the busy
// spinner toggling), and a row that has keyboard focus loses it.
function Row({ icon: Icon, onPick, children }: { icon: typeof User; onPick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onPick} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-purple-50 focus:bg-purple-50 focus:outline-none">
      <Icon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" aria-hidden="true" />{children}
    </button>
  );
}

// One box in the header that finds people, IP addresses, incidents and uploaded files, and jumps to the right place.
export default function GlobalSearch({ onOpenUser, onOpenIp, onOpenIncident, onOpenUploads }: Props) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setError(''); return; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true); setError('');
      try { const r = await api.soc.search(term); if (mine === seq.current) setRes(r); }
      catch (e) { if (mine === seq.current) { setRes(null); setError(errorText(e)); } }
      finally { if (mine === seq.current) setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // The results close when the pointer or the keyboard focus goes anywhere else on the page. Pointer alone left them
  // hanging open over the tab bar after tabbing away.
  useEffect(() => {
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('focusin', away);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('focusin', away); };
  }, []);

  const pick = (fn: () => void) => () => { fn(); setOpen(false); setQ(''); setRes(null); };
  const total = res ? res.users.length + res.ips.length + res.incidents.length + res.uploads.length : 0;
  const showing = open && q.trim().length >= 2;

  return (
    <div ref={box} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 bg-white/15 focus-within:bg-white rounded-xl px-3 py-2 group">
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-white/70 group-focus-within:text-gray-400" aria-hidden="true" /> : <Search className="w-4 h-4 text-white/70 group-focus-within:text-gray-400" aria-hidden="true" />}
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          placeholder="Search people, IPs, incidents, files…" aria-label="Search the SOC"
          className="bg-transparent outline-none text-sm w-full text-white placeholder-white/60 group-focus-within:text-gray-900 group-focus-within:placeholder-gray-400" />
      </div>

      {/* Results appear without anything moving focus, so a screen reader is told how many there are. */}
      <p role="status" className="sr-only">
        {showing && !busy && !error && res ? (total === 0 ? 'No matches.' : `${total} result${total === 1 ? '' : 's'}.`) : ''}
      </p>

      {showing && (
        <div className="absolute z-30 mt-2 w-full min-w-[20rem] bg-white rounded-xl border border-gray-200 shadow-xl max-h-96 overflow-y-auto text-gray-800">
          {error && <p className="text-sm text-red-700 px-3 py-3">{error}</p>}
          {!error && res && total === 0 && !busy && <p className="text-sm text-gray-500 px-3 py-3">No matches for “{q.trim()}”.</p>}
          {res?.users.length > 0 && <p className="px-3 pt-2 text-[10px] font-semibold text-gray-500 uppercase">People</p>}
          {res?.users.map((u: any) => (
            <Row key={u.id} icon={User} onPick={pick(() => onOpenUser(u.id))}>
              <span className="truncate flex-1"><span className="font-medium">{u.name}</span> <span className="text-xs text-gray-500">{u.email}</span></span>
              <span className="text-[10px] text-gray-500 capitalize">{u.role}</span>
            </Row>
          ))}
          {res?.ips.length > 0 && <p className="px-3 pt-2 text-[10px] font-semibold text-gray-500 uppercase">IP address</p>}
          {res?.ips.map((p: any) => (
            <Row key={p.ip} icon={Globe} onPick={pick(() => onOpenIp(p.ip))}>
              <span className="font-mono text-xs flex-1">{p.ip}</span>
              <span className="text-[10px] text-gray-500">{p.blocked ? 'blocked · ' : ''}{p.events} events</span>
            </Row>
          ))}
          {res?.incidents.length > 0 && <p className="px-3 pt-2 text-[10px] font-semibold text-gray-500 uppercase">Incidents</p>}
          {res?.incidents.map((i: any) => (
            <Row key={i._id} icon={AlertTriangle} onPick={pick(() => onOpenIncident(i._id))}>
              <span className="truncate flex-1">{i.title}</span>
              <span className="text-[10px] text-gray-500">{i.severity} · {i.status.replace('_', ' ')}</span>
            </Row>
          ))}
          {res?.uploads.length > 0 && <p className="px-3 pt-2 text-[10px] font-semibold text-gray-500 uppercase">Uploaded files</p>}
          {res?.uploads.map((u: any) => (
            <Row key={u._id} icon={FileText} onPick={pick(onOpenUploads)}>
              <span className="truncate flex-1">{u.originalName} <span className="text-xs text-gray-500">{u.email}</span></span>
              <span className="text-[10px] text-gray-500">{u.review}</span>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}
