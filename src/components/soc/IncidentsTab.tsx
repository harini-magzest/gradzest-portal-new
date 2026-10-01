import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { AlertTriangle, UserCircle2, Loader2, Search, Download, Clock } from 'lucide-react';
import { api, getApiToken } from '../../api';
import { ErrorBanner, errorText } from './ui';
import {
  type Incident, type SlaPolicy, DEFAULT_SLA_POLICY, SEVERITY_STYLE, STATUS_STYLE, TYPE_LABEL, SLA_TONE_STYLE, slaState,
} from './incidentShared';
import IncidentDetail from './IncidentDetail';
import SavedFilters from './SavedFilters';
import SuppressionPanel from './SuppressionPanel';

const PAGE_SIZE = 50;

interface Filters { status: string; severity: string; type: string; q: string }
const DEFAULT_FILTERS: Filters = { status: 'open', severity: 'all', type: 'all', q: '' };

const apiFilters = (f: Filters) => ({
  status: f.status === 'all' ? undefined : f.status,
  severity: f.severity === 'all' ? undefined : f.severity,
  type: f.type === 'all' ? undefined : f.type,
  q: f.q.trim() || undefined,
});

export default function IncidentsTab({ openId, onOpened }: { openId?: string; onOpened?: () => void } = {}) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [slaPolicy, setSlaPolicy] = useState<SlaPolicy>(DEFAULT_SLA_POLICY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [analysts, setAnalysts] = useState<{ _id: string; name: string }[]>([]);
  useEffect(() => { api.soc.analysts().then(d => setAnalysts(d.analysts || [])).catch(() => {}); }, []);

  // Arriving from global search with one incident chosen: open it directly.
  useEffect(() => {
    if (!openId) return;
    api.soc.incidentDetail(openId).then(d => setSelected(d.incident)).catch(e => setError(errorText(e))).finally(() => onOpened?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const patch = (p: Partial<Filters>) => setFilters(f => ({ ...f, ...p }));

  // SLA countdowns are derived from the clock, so tick once a minute.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api.soc.incidents({ ...apiFilters(filters), limit: PAGE_SIZE, skip: 0 });
      setIncidents(data.incidents || []);
      setTotal(data.total ?? (data.incidents || []).length);
      if (data.slaPolicy) setSlaPolicy(data.slaPolicy);
    } catch (e) { setError(errorText(e)); }
    setLoading(false);
  }, [filters]);

  const togglePick = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Clearing a batch of noise (e.g. one rule's false positives) in one go; the reason is recorded on every incident.
  const bulkAssign = async (analystId: string) => {
    const ids = [...picked];
    if (!ids.length || !analystId) return;
    setBulkBusy(true); setBulkMsg('');
    try {
      const r = await api.soc.bulkUpdateIncidents(ids, { assignedTo: analystId });
      setBulkMsg(`${r.updated.length} assigned${r.failed.length ? `, ${r.failed.length} failed` : ''}.`);
      setPicked(new Set());
      await load();
    } catch (e) { setBulkMsg(errorText(e)); }
    setBulkBusy(false);
  };
  const bulkClose = async (status: 'resolved' | 'false_positive') => {
    const ids = [...picked];
    if (!ids.length) return;
    if (!window.confirm(`Mark ${ids.length} incident${ids.length === 1 ? '' : 's'} as ${status.replace('_', ' ')}?`)) return;
    setBulkBusy(true); setBulkMsg('');
    try {
      const r = await api.soc.bulkUpdateIncidents(ids, { status, resolutionReason: status === 'false_positive' ? 'benign_activity' : 'fixed', resolutionComment: 'Closed in bulk from the incident list' });
      setBulkMsg(`${r.updated.length} updated${r.failed.length ? `, ${r.failed.length} failed` : ''}.`);
      setPicked(new Set());
      await load();
    } catch (e) { setBulkMsg(errorText(e)); }
    setBulkBusy(false);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await api.soc.incidents({ ...apiFilters(filters), limit: PAGE_SIZE, skip: incidents.length });
      setIncidents(prev => [...prev, ...(data.incidents || [])]);
      setTotal(data.total ?? incidents.length);
    } catch (e) { setError(errorText(e)); }
    setLoadingMore(false);
  };

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, filters.q]);

  useEffect(() => {
    const socket: Socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
    });
    socket.on('incident_created', () => load());
    socket.on('incident_updated', (updated: Incident) => {
      setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i));
    });
    return () => { socket.disconnect(); };
  }, [load]);

  const exportCsv = () => {
    const params = new URLSearchParams(Object.entries(apiFilters(filters)).filter(([, v]) => v) as [string, string][]);
    api.soc.download(`/incidents/export.csv?${params}`, 'soc-incidents.csv').catch(e => setError(errorText(e)));
  };

  const selectCls = 'text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit max-w-full overflow-x-auto">
          {['all', 'open', 'investigating', 'resolved', 'false_positive'].map(s => (
            <button key={s} type="button" onClick={() => patch({ status: s })}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filters.status === s ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[12rem] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input value={filters.q} onChange={e => patch({ q: e.target.value })} placeholder="Search title, IP or email…"
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <select value={filters.severity} onChange={e => patch({ severity: e.target.value })} className={selectCls} aria-label="Severity">
          <option value="all">All severities</option>
          {Object.keys(SEVERITY_STYLE).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.type} onChange={e => patch({ type: e.target.value })} className={selectCls} aria-label="Incident type">
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <button type="button" onClick={exportCsv}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1.5">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>
      <SavedFilters storageKey="soc.incidentFilters" current={filters} onApply={f => setFilters({ ...DEFAULT_FILTERS, ...f })} />

      {(picked.size > 0 || bulkMsg) && (
        <div className="flex items-center gap-2 flex-wrap bg-purple-50 border border-purple-100 rounded-xl px-4 py-2 text-sm">
          {picked.size > 0 && <span className="font-semibold text-purple-800">{picked.size} selected</span>}
          {picked.size > 0 && (
            <>
              <button type="button" disabled={bulkBusy} onClick={() => bulkClose('false_positive')} className="px-3 py-1 text-xs font-semibold rounded-lg bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 disabled:opacity-50">Mark false positive</button>
              <button type="button" disabled={bulkBusy} onClick={() => bulkClose('resolved')} className="px-3 py-1 text-xs font-semibold rounded-lg bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 disabled:opacity-50">Mark resolved</button>
              <select value="" disabled={bulkBusy} onChange={e => bulkAssign(e.target.value)} aria-label="Assign selected to" className="px-2 py-1 text-xs font-semibold rounded-lg bg-white border border-purple-200 text-purple-700">
                <option value="">Assign to…</option>
                {analysts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
              <button type="button" onClick={() => setPicked(new Set())} className="text-xs text-gray-500 hover:underline">Clear</button>
            </>
          )}
          {bulkMsg && <span className="text-xs text-gray-600 ml-auto">{bulkMsg}</span>}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {error ? (
          <div className="p-4"><ErrorBanner message={error} onRetry={load} /></div>
        ) : loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <AlertTriangle className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm font-semibold text-gray-500">No incidents</p>
            <p className="text-xs text-gray-400 mt-1">Nothing matches these filters.</p>
          </div>
        ) : incidents.map(inc => {
          const sla = slaState(inc, slaPolicy, now);
          const showSla = inc.status === 'open' || inc.status === 'investigating' || sla.breached;
          return (
            <div key={inc._id} className="flex items-center border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              {(inc.status === 'open' || inc.status === 'investigating') ? (
                <input type="checkbox" checked={picked.has(inc._id)} onChange={() => togglePick(inc._id)} aria-label={`Select ${inc.title}`} className="ml-4 w-4 h-4 accent-purple-600 flex-shrink-0" />
              ) : <span className="ml-4 w-4 flex-shrink-0" />}
              <button onClick={() => setSelected(inc)}
              className="flex-1 min-w-0 flex items-center justify-between gap-3 pl-3 pr-5 py-4 text-left transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-semibold text-gray-900 truncate">{inc.title}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={SEVERITY_STYLE[inc.severity]}>{inc.severity}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={STATUS_STYLE[inc.status]}>{inc.status.replace('_', ' ')}</span>
                  {inc.stale && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-gray-100 text-gray-500">Stale</span>}
                  {showSla && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={SLA_TONE_STYLE[sla.tone]}>
                      <Clock className="w-2.5 h-2.5" />{sla.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                  <span>{TYPE_LABEL[inc.type] || inc.type} · {inc.notes.length} note{inc.notes.length !== 1 ? 's' : ''}</span>
                  {inc.assignedTo && (
                    <span className="inline-flex items-center gap-1 text-purple-700"><UserCircle2 className="w-3 h-3" />{inc.assignedTo.name}</span>
                  )}
                </p>
              </div>
              <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">{new Date(inc.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </button>
            </div>
          );
        })}
        {!loading && incidents.length < total && (
          <div className="p-3 text-center border-t border-gray-50">
            <button onClick={loadMore} disabled={loadingMore}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 rounded-lg disabled:opacity-50">
              {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {loadingMore ? 'Loading…' : `Load more (${incidents.length} of ${total})`}
            </button>
          </div>
        )}
      </div>

      <SuppressionPanel />

      {selected && (
        <IncidentDetail incident={selected} slaPolicy={slaPolicy} onClose={() => setSelected(null)}
          onUpdate={(updated) => { setSelected(updated); setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i)); }} />
      )}
    </div>
  );
}
