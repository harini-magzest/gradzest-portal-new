import { useState, useEffect, useCallback } from 'react';
import { Ban, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { errorText } from './ui';

interface BlockedRow { _id: string; ip: string; reason: string; expiresAt?: string | null; createdAt: string; blockedBy?: { name: string } | null }

export const BLOCK_DURATIONS = [
  { label: 'Permanent', hours: 0 }, { label: '1 hour', hours: 1 }, { label: '24 hours', hours: 24 }, { label: '7 days', hours: 168 },
];

// The current blocklist plus a bulk-block form. Accepts a pasted list (one per
// line or comma/space separated) of single IPs and CIDR ranges; unsafe entries
// (invalid, too-wide ranges, your own IP) come back with a reason.
export default function BlockedIpsPanel() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [result, setResult] = useState<{ blocked: string[]; rejected: { ip: string; reason: string }[] } | null>(null);

  const load = useCallback(async () => {
    try { setRows((await api.soc.blockedIps()).blockedIps || []); setLoadError(''); } catch (e) { setLoadError(errorText(e)); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const submit = async () => {
    const ips = text.split(/[\s,;]+/).filter(Boolean);
    if (!ips.length) return;
    setBusy(true); setResult(null);
    try {
      setResult(await api.soc.bulkBlockIps(ips, reason.trim() || 'Bulk block via SOC', hours || undefined));
      setText('');
      await load();
    } catch (err) { setResult({ blocked: [], rejected: [{ ip: '—', reason: errorText(err) }] }); }
    setBusy(false);
  };

  const unblock = async (ip: string) => {
    setActionError('');
    try { await api.soc.unblockIp(ip); await load(); }
    catch (e) { setActionError(errorText(e)); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center justify-between px-5 py-3.5 text-left">
        <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Ban className="w-4 h-4 text-red-500" /> Blocklist &amp; bulk block
          <span className="text-xs font-normal text-gray-500">single IPs or CIDR ranges, permanent or temporary</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} aria-label="IP addresses or CIDR ranges to block"
            placeholder={'203.0.113.7\n198.51.100.0/24'}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <div className="flex flex-wrap items-center gap-2">
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" aria-label="Reason for blocking"
              className="flex-1 min-w-[10rem] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <select value={hours} onChange={e => setHours(Number(e.target.value))} aria-label="Block duration"
              className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
              {BLOCK_DURATIONS.map(d => <option key={d.hours} value={d.hours}>{d.label}</option>)}
            </select>
            <button type="button" onClick={submit} disabled={busy || !text.trim()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">Block</button>
          </div>
          {result && (
            <div className="text-sm space-y-1">
              {result.blocked.length > 0 && <p className="text-green-700">Blocked {result.blocked.length}: <span className="font-mono">{result.blocked.join(', ')}</span></p>}
              {result.rejected.map(r => <p key={r.ip} className="text-red-600"><span className="font-mono">{r.ip}</span> — {r.reason}</p>)}
            </div>
          )}
          {loadError && <p className="text-sm text-red-600 mb-2">{loadError} <button type="button" onClick={load} className="underline font-semibold">Retry</button></p>}
          {actionError && <p className="text-sm text-red-600 mb-2">{actionError}</p>}
          {rows.length === 0 ? <p className="text-sm text-gray-500 italic">Nothing is blocked.</p> : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {rows.map(r => (
                <div key={r._id} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="min-w-0 text-sm">
                    <span className="font-mono text-gray-800">{r.ip}</span>
                    <span className="text-xs text-gray-500"> · {r.expiresAt ? `until ${new Date(r.expiresAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'permanent'}
                      {r.reason ? ` · ${r.reason}` : ''}</span>
                  </div>
                  <button type="button" onClick={() => unblock(r.ip)} className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:bg-green-50 px-2 py-1 rounded-lg">
                    <ShieldCheck className="w-3.5 h-3.5" /> Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
