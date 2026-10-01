import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { FileText, ExternalLink, RefreshCw, Search, Loader2, Info, Copy, ShieldBan, Undo2, Trash2 } from 'lucide-react';
import { api, getApiToken } from '../../api';
import VtBadge, { type VtResult } from './VtBadge';

interface Upload {
  _id: string; userId: string; email: string; name?: string; role: string; source: string; originalName: string;
  mimeType?: string; size: number; sha256: string; ip?: string; createdAt: string; vt: VtResult; vtLink: string;
  inspection?: { risk: string; detectedType?: string; findings: { code: string; severity: string; detail: string }[] };
  blocked?: boolean; quarantined?: boolean; quarantineReason?: string; purgedAt?: string | null;
}

const FINDING_STYLE: Record<string, { backgroundColor: string; color: string }> = {
  high: { backgroundColor: '#FCE8E8', color: '#8B1A1A' }, medium: { backgroundColor: '#FAEEDA', color: '#633806' }, low: { backgroundColor: '#F0F0F2', color: '#4B5563' },
};

const SOURCE_LABEL: Record<string, string> = { student_document: 'Student document', counselor_document: 'Counselor document', chat_file: 'Chat attachment', other: 'Other' };
const RISKS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'all', label: 'All', statuses: [] },
  { key: 'review', label: 'Needs review', statuses: [] },
  { key: 'flagged', label: 'VirusTotal flagged', statuses: ['malicious', 'suspicious'] },
  { key: 'clean', label: 'Clean', statuses: ['clean'] },
  { key: 'unknown', label: 'Not seen', statuses: ['unknown'] },
  { key: 'attention', label: 'Pending / failed', statuses: ['pending', 'rate_limited', 'error', 'not_configured'] },
];
const PAGE = 50;

function fmtSize(b: number) { return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`; }

// Every document that entered the system, who sent it, and what VirusTotal knows about its hash.
export default function UploadsTab({ onInvestigateUser }: { onInvestigateUser: (userId: string) => void }) {
  const [rows, setRows] = useState<Upload[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [configured, setConfigured] = useState(true);
  const [needsReview, setNeedsReview] = useState(0);
  const [info, setInfo] = useState('');
  const [risk, setRisk] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const riskRef = useRef(risk);
  useEffect(() => { riskRef.current = risk; }, [risk]);

  const fetchPage = useCallback((skip: number) => api.soc.uploads({
    limit: PAGE, skip, q: q.trim() || undefined, risk: risk === 'all' ? undefined : risk,
  }), [q, risk]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await fetchPage(0);
      setRows(d.uploads || []); setTotal(d.total || 0); setSummary(d.summary || {}); setNeedsReview(d.needsReview || 0); setConfigured(d.vtConfigured !== false);
    } catch (e: any) { setError(e.message || 'Failed to load uploads'); }
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const loadMore = async () => {
    setLoadingMore(true);
    try { const d = await fetchPage(rows.length); setRows(prev => [...prev, ...(d.uploads || [])]); setTotal(d.total || 0); } catch { /* ignore */ }
    setLoadingMore(false);
  };

  useEffect(() => {
    const socket: Socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', { auth: (cb: (data: object) => void) => cb({ token: getApiToken() }) });
    socket.on('upload_recorded', () => load());
    socket.on('upload_updated', (u: Upload) => setRows(prev => prev.map(r => r._id === u._id ? { ...r, ...u, vtLink: r.vtLink } : r)));
    return () => { socket.disconnect(); };
  }, [load]);

  const recheck = async (id: string) => {
    setBusyId(id); setError('');
    try { const u = await api.soc.recheckUpload(id); setRows(prev => prev.map(r => r._id === id ? { ...r, ...u } : r)); }
    catch (e: any) { setError(e.message || 'Re-check failed'); }
    setBusyId(null);
  };

  const copy = async (hash: string) => {
    try { await navigator.clipboard.writeText(hash); setCopied(hash); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard unavailable */ }
  };

  const count = (r: { key: string; statuses: string[] }) => r.key === 'review' ? needsReview
    : r.statuses.length ? r.statuses.reduce((a, s) => a + (summary[s] || 0), 0) : Object.values(summary).reduce((a, b) => a + b, 0);

  const quarantineAction = async (u: Upload, action: 'quarantine' | 'restore' | 'purge') => {
    const prompts = {
      quarantine: `Quarantine "${u.originalName}"? It is moved out of the served uploads folder, so its download link stops working. You can restore it later.`,
      restore: `Restore "${u.originalName}"? Its download link starts working again.`,
      purge: `Permanently delete "${u.originalName}"? This cannot be undone.`,
    };
    if (!window.confirm(prompts[action])) return;
    setBusyId(u._id); setError(''); setInfo('');
    try {
      const updated = await api.soc.quarantineUpload(u._id, action);
      setRows(prev => prev.map(r => r._id === u._id ? { ...r, ...updated } : r));
      setInfo(action === 'quarantine' ? 'File quarantined.' : action === 'restore' ? 'File restored.' : 'File deleted.');
      load();
    } catch (e: any) { setError(e.message || 'Action failed'); }
    setBusyId(null);
  };
  const shown = rows;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-xs text-gray-500 bg-blue-50/60 border border-blue-100 rounded-xl px-3 py-2.5">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p>
          Every uploaded document is virus-scanned locally by ClamAV and its <b>SHA-256 fingerprint</b> is checked against VirusTotal.
          Files themselves are <b>never sent to VirusTotal</b> (these are students&apos; passports and certificates). “Not seen by VirusTotal”
          is normal for a private document and is not a risk signal; a file VirusTotal knows to be malicious is flagged and opens an incident.
          “Open in VirusTotal” shows the full report for that hash.
        </p>
      </div>
      {!configured && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          VirusTotal lookups are off — set <span className="font-mono">VT_API_KEY</span> on the server (a free key works: 4 lookups/min, 500/day) and restart.
          Uploads are still recorded, and “Open in VirusTotal” works without a key.
        </div>
      )}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
      {info && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{info}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
          {RISKS.map(r => (
            <button key={r.key} type="button" onClick={() => setRisk(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${risk === r.key ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {r.label} <span className={`ml-1 ${(r.key === 'flagged' || r.key === 'review') && count(r) > 0 ? 'text-red-600' : 'text-gray-400'}`}>{count(r)}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[12rem] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="File name, user or hash…"
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          : shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <FileText className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm font-semibold text-gray-500">No uploads</p>
              <p className="text-xs text-gray-400 mt-1">Documents appear here as students, counselors and chats upload them.</p>
            </div>
          ) : shown.map(u => (
            <div key={u._id} className="flex items-start gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              <FileText className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 truncate">{u.originalName}</span>
                  <VtBadge vt={u.vt} />
                  {u.blocked && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-600 text-white" title={u.quarantineReason}>Blocked at upload</span>}
                  {u.quarantined && !u.blocked && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-white" title={u.quarantineReason}>Quarantined</span>}
                  {u.purgedAt && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-500 text-white">File deleted</span>}
                </div>
                {(u.inspection?.findings?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {u.inspection!.findings.map(f => (
                      <span key={f.code} title={f.detail} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={FINDING_STYLE[f.severity] || FINDING_STYLE.low}>{f.code.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <button type="button" onClick={() => onInvestigateUser(u.userId)} className="font-medium text-purple-700 hover:underline" title="Open this user's details and response actions">{u.email}</button>
                  <span className="capitalize text-gray-400">({u.role})</span>
                  <span>· {SOURCE_LABEL[u.source] || u.source} · {fmtSize(u.size)}{u.ip ? ` · ${u.ip}` : ''}</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                  <span className="font-mono">{u.sha256.slice(0, 16)}…</span>
                  <button type="button" onClick={() => copy(u.sha256)} className="inline-flex items-center gap-0.5 hover:text-purple-700" title="Copy full SHA-256">
                    <Copy className="w-3 h-3" />{copied === u.sha256 ? 'copied' : 'copy'}
                  </button>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{new Date(u.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <div className="flex items-center gap-1">
                  {configured && (
                    <button type="button" onClick={() => recheck(u._id)} disabled={busyId === u._id} title="Look this hash up again now"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2 py-1 disabled:opacity-50">
                      {busyId === u._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Re-check
                    </button>
                  )}
                  {!u.quarantined && !u.purgedAt && (
                    <button type="button" onClick={() => quarantineAction(u, 'quarantine')} disabled={busyId === u._id} title="Move the file out of the served uploads folder"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg px-2 py-1 disabled:opacity-50"><ShieldBan className="w-3 h-3" /> Quarantine</button>
                  )}
                  {u.quarantined && !u.blocked && !u.purgedAt && (
                    <button type="button" onClick={() => quarantineAction(u, 'restore')} disabled={busyId === u._id}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg px-2 py-1 disabled:opacity-50"><Undo2 className="w-3 h-3" /> Restore</button>
                  )}
                  {u.quarantined && !u.purgedAt && (
                    <button type="button" onClick={() => quarantineAction(u, 'purge')} disabled={busyId === u._id}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg px-2 py-1 disabled:opacity-50"><Trash2 className="w-3 h-3" /> Delete</button>
                  )}
                  <a href={u.vtLink} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg px-2 py-1">
                    <ExternalLink className="w-3 h-3" /> VirusTotal
                  </a>
                </div>
              </div>
            </div>
          ))}
        {!loading && rows.length < total && (
          <div className="p-3 text-center border-t border-gray-50">
            <button onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 rounded-lg disabled:opacity-50">
              {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{loadingMore ? 'Loading…' : `Load more (${rows.length} of ${total})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
