import { useState, useEffect, useCallback, useRef } from 'react';
import { MousePointerClick, FileText, Download, FileUp, Send, Compass, Search, Loader2, LogIn, LogOut, Laptop } from 'lucide-react';
import { api } from '../../api';
import { useSocSocket } from './SocketContext';
import SavedFilters from './SavedFilters';
import FeatureUsage from './FeatureUsage';
import { Mask } from './Mask';

interface UiRow {
  _id: string; userId: string; email: string; name?: string; role: string; kind: string; page: string; routePattern?: string; file?: string;
  context?: string; element?: { tag?: string; label?: string; id?: string; href?: string; type?: string };
  files?: { name: string; size: number }[]; ip?: string; createdAt: string;
  device?: { label?: string; browser?: string; os?: string; deviceType?: string; model?: string; screen?: string; timezone?: string; language?: string; clientReported?: boolean };
}

interface Filters { email: string; kind: string; page: string; q: string }
const DEFAULT_FILTERS: Filters = { email: '', kind: 'all', page: '', q: '' };
const PAGE_SIZE = 100;

const KIND_META: Record<string, { label: string; icon: any; color: string }> = {
  login: { label: 'Signed in', icon: LogIn, color: '#15803d' },
  logout: { label: 'Signed out', icon: LogOut, color: '#6b7280' },
  page_view: { label: 'Opened page', icon: Compass, color: '#4B5563' },
  click: { label: 'Clicked', icon: MousePointerClick, color: '#7c3aed' },
  download: { label: 'Downloaded', icon: Download, color: '#0C447C' },
  file_select: { label: 'Picked file', icon: FileUp, color: '#633806' },
  form_submit: { label: 'Submitted form', icon: Send, color: '#27500A' },
};

function describe(r: UiRow): string {
  const label = r.element?.label || r.element?.id || '';
  switch (r.kind) {
    case 'login': return r.name ? `as ${r.name}` : '';
    case 'logout': return '';
    case 'page_view': return label ? `“${label}”` : r.page;
    case 'click': return label ? `“${label}” ${r.element?.tag ? `(${r.element.tag})` : ''}` : `a ${r.element?.tag || 'element'}`;
    case 'download': return label || r.element?.href || 'a file';
    case 'file_select': return (r.files || []).map(f => `${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB)`).join(', ') || 'a file';
    case 'form_submit': return label || 'a form';
    default: return label;
  }
}

const matches = (r: UiRow, f: Filters) =>
  (!f.email || r.email.toLowerCase().startsWith(f.email.toLowerCase()))
  && (f.kind === 'all' || r.kind === f.kind)
  && (!f.page || r.page.toLowerCase().includes(f.page.toLowerCase()))
  && (!f.q || [r.element?.label, r.element?.id, r.element?.href, r.file, r.page, r.context].some(v => (v || '').toLowerCase().includes(f.q.toLowerCase())));

// Who did what, where: every page opened, button/link clicked, file picked or
// downloaded and form submitted by tracked staff, with the source file of the page.
function TrailView({ onInvestigateUser }: { onInvestigateUser: (id: string) => void }) {
  const { socket, isLive } = useSocSocket();
  const [rows, setRows] = useState<UiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [tracked, setTracked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const params = (f: Filters, skip: number) => ({
    limit: PAGE_SIZE, skip,
    email: f.email.trim() || undefined, kind: f.kind === 'all' ? undefined : f.kind,
    page: f.page.trim() || undefined, q: f.q.trim() || undefined,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.soc.uiActivity(params(filters, 0));
      setRows(d.activity || []); setTotal(d.total || 0); setTracked(d.trackedRoles || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filters]);

  // Debounced so typing in a filter box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const d = await api.soc.uiActivity(params(filters, rows.length));
      setRows(prev => [...prev, ...(d.activity || [])]); setTotal(d.total || 0);
    } catch { /* ignore */ }
    setLoadingMore(false);
  };

  useEffect(() => {
    if (!socket) return;
    const onActivity = (batch: UiRow[]) => {
      const fresh = batch.filter(r => matches(r, filtersRef.current)).reverse();
      if (fresh.length) { setRows(prev => [...fresh, ...prev].slice(0, 1000)); setTotal(t => t + fresh.length); }
    };
    socket.on('ui_activity', onActivity);
    return () => { socket.off('ui_activity', onActivity); };
  }, [socket]);

  const exportCsv = () => {
    const p = new URLSearchParams(Object.entries(params(filters, 0)).filter(([k, v]) => v && k !== 'limit' && k !== 'skip') as [string, string][]);
    api.soc.download(`/ui-activity/export.csv?${p}`, 'soc-ui-activity.csv').catch(() => {});
  };

  const input = 'px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500 max-w-2xl">
          Who signed in (with their name and device), and every page, button, link, file and form action by tracked accounts ({tracked.length ? tracked.join(', ') : '…'}).
          Only metadata is recorded — never what is typed into a field, and never file contents. Kept 90 days.
          Student activity is not recorded unless enabled with <span className="font-mono">SOC_UI_TRACK_ROLES</span>.
        </p>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${isLive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{isLive ? 'Live' : 'Offline'}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input value={filters.email} onChange={e => setFilters(f => ({ ...f, email: e.target.value }))} placeholder="User email starts with…" className={`${input} pl-8 w-52`} />
        </div>
        <select value={filters.kind} onChange={e => setFilters(f => ({ ...f, kind: e.target.value }))} className={input} aria-label="Action type">
          <option value="all">All actions</option>
          {Object.entries(KIND_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
        <input value={filters.page} onChange={e => setFilters(f => ({ ...f, page: e.target.value }))} placeholder="Page contains… (/admin/students)" className={`${input} w-56`} />
        <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} placeholder="Exact button / link text, or file / page…" className={`${input} w-52`} />
        <button type="button" onClick={exportCsv} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1.5">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>
      <SavedFilters storageKey="soc.activityFilters" current={filters} onApply={f => setFilters({ ...DEFAULT_FILTERS, ...f })} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <MousePointerClick className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm font-semibold text-gray-500">No activity recorded</p>
            <p className="text-xs text-gray-400 mt-1">Activity appears here as tracked staff use the app.</p>
          </div>
        ) : rows.map(r => {
          const meta = KIND_META[r.kind] || KIND_META.click;
          const Icon = meta.icon;
          return (
            <div key={r._id} className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: meta.color }}><Icon className="w-3.5 h-3.5" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">
                  <button type="button" onClick={() => onInvestigateUser(r.userId)} className="font-semibold text-gray-900 hover:text-purple-700 hover:underline" title="Open this person's details and response actions">{r.name || <Mask value={r.email} fallback="Unknown" />}</button>
                  {r.name && r.email && <span className="text-xs text-gray-400 ml-1.5"><Mask value={r.email} /></span>}
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize ml-1.5">{r.role}</span>
                  <span className="text-gray-500"> {meta.label.toLowerCase()} </span>
                  <span className="font-medium">{describe(r)}</span>
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono">{r.page}</span>
                  {r.file && <span className="inline-flex items-center gap-1 text-purple-700"><FileText className="w-3 h-3" /><span className="font-mono">{r.file}</span></span>}
                  {r.context && <span className="text-gray-400">in {r.context}</span>}
                  {r.element?.href && r.kind !== 'page_view' && <span className="text-gray-400">→ <span className="font-mono">{r.element.href}</span></span>}
                  {r.ip && <span className="text-gray-400 font-mono">· {r.ip}</span>}
                </p>
                {r.device?.label && (
                  <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1" title={[r.device.timezone && `Timezone ${r.device.timezone}`, r.device.language && `Language ${r.device.language}`, r.device.clientReported ? 'Includes browser-reported details' : 'From the User-Agent only'].filter(Boolean).join(' · ')}>
                    <Laptop className="w-3 h-3 text-gray-400" />{r.device.label}
                  </p>
                )}
              </div>
              <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap tabular-nums">{new Date(r.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
            </div>
          );
        })}
        {!loading && rows.length < total && (
          <div className="p-3 text-center border-t border-gray-50">
            <button onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 rounded-lg disabled:opacity-50">
              {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {loadingMore ? 'Loading…' : `Load more (${rows.length} of ${total})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Two views of the same data: the raw trail (who did what, when) and what it adds up to (which features get used).
export default function ActivityTab({ onInvestigateUser }: { onInvestigateUser: (id: string) => void }) {
  const [view, setView] = useState<'trail' | 'usage'>('usage');
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {([['usage', 'Feature usage'], ['trail', 'Activity trail']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setView(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${view === k ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
        ))}
      </div>
      {view === 'usage' ? <FeatureUsage onInvestigateUser={onInvestigateUser} /> : <TrailView onInvestigateUser={onInvestigateUser} />}
    </div>
  );
}
