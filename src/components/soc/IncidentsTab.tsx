import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { AlertTriangle, UserCircle2, Loader2, Search, Download, Clock } from 'lucide-react';
import { api, getApiToken } from '../../api';
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

export default function IncidentsTab() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [slaPolicy, setSlaPolicy] = useState<SlaPolicy>(DEFAULT_SLA_POLICY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [now, setNow] = useState(Date.now());

  const patch = (p: Partial<Filters>) => setFilters(f => ({ ...f, ...p }));

  // SLA countdowns are derived from the clock, so tick once a minute.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.soc.incidents({ ...apiFilters(filters), limit: PAGE_SIZE, skip: 0 });
      setIncidents(data.incidents || []);
      setTotal(data.total ?? (data.incidents || []).length);
      if (data.slaPolicy) setSlaPolicy(data.slaPolicy);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filters]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await api.soc.incidents({ ...apiFilters(filters), limit: PAGE_SIZE, skip: incidents.length });
      setIncidents(prev => [...prev, ...(data.incidents || [])]);
      setTotal(data.total ?? incidents.length);
    } catch { /* ignore */ }
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
    api.soc.download(`/incidents/export.csv?${params}`, 'soc-incidents.csv').catch(() => {});
  };

  const selectCls = 'text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
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
            <button key={inc._id} onClick={() => setSelected(inc)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 text-left transition-colors">
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
