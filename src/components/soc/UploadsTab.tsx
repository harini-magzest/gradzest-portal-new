import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, ExternalLink, Search, Loader2, Info, Copy, ShieldBan, Undo2, Trash2, Check, Flag, RotateCcw, AlertTriangle, X } from 'lucide-react';
import { api } from '../../api';
import { useSocSocket, useOnResync } from './SocketContext';
import ReviewBadge, { type ReviewResult } from './ReviewBadge';
import { ErrorBanner, Modal, errorText } from './ui';

interface Upload {
  _id: string; userId: string; email: string; name?: string; role: string; source: string; originalName: string;
  mimeType?: string; size: number; sha256: string; ip?: string; createdAt: string; vtLink: string; review?: ReviewResult;
  inspection?: { risk: string; detectedType?: string; findings: { code: string; severity: string; detail: string }[] };
  blocked?: boolean; quarantined?: boolean; quarantineReason?: string; purgedAt?: string | null;
}

const FINDING_STYLE: Record<string, { backgroundColor: string; color: string }> = {
  high: { backgroundColor: '#FCE8E8', color: '#8B1A1A' }, medium: { backgroundColor: '#FAEEDA', color: '#633806' }, low: { backgroundColor: '#F0F0F2', color: '#4B5563' },
};
const SOURCE_LABEL: Record<string, string> = { student_document: 'Student document', counselor_document: 'Counselor document', chat_file: 'Chat attachment', other: 'Other' };
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'review', label: 'Needs review' }, { key: 'unreviewed', label: 'Not checked' },
  { key: 'flagged', label: 'Flagged' }, { key: 'clean', label: 'Checked: clean' },
];
const PAGE = 50;

function fmtSize(b: number) { return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`; }
// Mirrors server/routes/soc/shared.js's vtLink() — the live 'upload_recorded' payload is the raw
// record and doesn't carry it (only the REST list/detail responses compute it server-side).
const vtLink = (sha256: string) => `https://www.virustotal.com/gui/file/${sha256}`;

// Whether a freshly-recorded upload belongs in the currently filtered view. Skipped while a
// search is active — matching the server's search semantics client-side isn't worth it, so
// a live upload just won't appear until the next refresh.
const matchesUploadFilter = (u: Upload, filter: string, q: string) => {
  if (q.trim()) return false;
  const status = u.review?.status || 'unreviewed';
  if (filter === 'flagged') return status === 'flagged';
  if (filter === 'clean') return status === 'clean';
  if (filter === 'unreviewed') return status === 'unreviewed';
  if (filter === 'review') return ['medium', 'high'].includes(u.inspection?.risk || 'none') || !!u.quarantined;
  return true;
};

// Every document that entered the system and who sent it. VirusTotal is checked by hand: copy the hash or open its
// VirusTotal page, look at the result, then record the verdict here. Nothing is sent to VirusTotal automatically.
export default function UploadsTab({ onInvestigateUser }: { onInvestigateUser: (userId: string) => void }) {
  const { socket } = useSocSocket();
  const [rows, setRows] = useState<Upload[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [needsReview, setNeedsReview] = useState(0);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // `loadError` is the list failing to load (shown in place of the list); `error` is an action or a further page failing
  // (shown above it, with the rows still there).
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // Bumped by every foreground load, so a slower response for a filter that is no longer set is dropped.
  const loadEpoch = useRef(0);
  const [copied, setCopied] = useState('');
  // Replace window.prompt/confirm: the former blocks the tab, can't validate (e.g. an
  // empty "flagged" note), and looks nothing like the rest of the SOC's confirmation UI.
  const [reviewModal, setReviewModal] = useState<{ u: Upload; status: 'clean' | 'flagged'; note: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ u: Upload; action: 'quarantine' | 'restore' | 'purge' } | null>(null);

  const fetchPage = useCallback((skip: number) => api.soc.uploads({
    limit: PAGE, skip, q: q.trim() || undefined, risk: filter === 'all' ? undefined : filter,
  }), [q, filter]);

  // silent = refresh after an action: the rows stay put (no "Loading…" flash, no lost scroll position), and a failed
  // refresh keeps what is on screen instead of replacing it with an error.
  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    const epoch = ++loadEpoch.current;
    if (!opts.silent) { setLoading(true); setLoadError(''); }
    try {
      const d = await fetchPage(0);
      if (epoch !== loadEpoch.current) return;
      setRows(d.uploads || []); setTotal(d.total || 0); setTruncated(!!d.truncated); setSummary(d.summary || {}); setNeedsReview(d.needsReview || 0);
    } catch (e) {
      if (epoch !== loadEpoch.current) return;
      if (!opts.silent) setLoadError(errorText(e));
    }
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // Uploads recorded while the connection was down were never pushed; fetch the list again.
  useOnResync(() => { void load({ silent: true }); });

  const loadMore = async () => {
    const epoch = loadEpoch.current;
    setLoadingMore(true); setError('');
    try {
      const d = await fetchPage(rows.length);
      if (epoch !== loadEpoch.current) return; // the filter changed while this page was coming
      const have = new Set(rows.map(r => r._id));
      setRows(prev => [...prev, ...(d.uploads || []).filter((u: Upload) => !have.has(u._id))]); setTotal(d.total || 0);
    } catch (e) {
      if (epoch === loadEpoch.current) setError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!socket) return;
    // Prepend rather than refetch page 1 — refetching would silently discard any extra
    // pages the analyst had already loaded with "Load more".
    const onRecorded = (raw: Upload) => {
      const status = raw.review?.status || 'unreviewed';
      setSummary(s => ({ ...s, [status]: (s[status] || 0) + 1 }));
      if (['medium', 'high'].includes(raw.inspection?.risk || 'none') || raw.quarantined) setNeedsReview(n => n + 1);
      if (!matchesUploadFilter(raw, filter, q)) return;
      const u = { ...raw, vtLink: vtLink(raw.sha256) };
      setRows(prev => prev.some(r => r._id === u._id) ? prev : [u, ...prev]);
      setTotal(t => t + 1);
    };
    const onUpdated = (u: Upload) => setRows(prev => prev.map(r => r._id === u._id ? { ...r, ...u, vtLink: r.vtLink } : r));
    socket.on('upload_recorded', onRecorded);
    socket.on('upload_updated', onUpdated);
    return () => { socket.off('upload_recorded', onRecorded); socket.off('upload_updated', onUpdated); };
  }, [socket, filter, q]);

  const copy = async (hash: string) => {
    try { await navigator.clipboard.writeText(hash); setCopied(hash); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard unavailable */ }
  };

  // 'unreviewed' (the reset action) needs no note, so it saves immediately; 'clean' and
  // 'flagged' go through reviewModal first so the analyst can enter one.
  const setReview = async (u: Upload, status: 'clean' | 'flagged' | 'unreviewed') => {
    if (status !== 'unreviewed') { setReviewModal({ u, status, note: '' }); return; }
    await submitReview(u, status, '');
  };

  const submitReview = async (u: Upload, status: 'clean' | 'flagged' | 'unreviewed', note: string) => {
    setBusyId(u._id); setError(''); setInfo('');
    try {
      const updated = await api.soc.reviewUpload(u._id, status, note);
      setRows(prev => prev.map(r => r._id === u._id ? { ...r, ...updated } : r));
      setInfo(status === 'flagged' ? 'Flagged — an incident was opened. Quarantine the file if it should no longer be downloadable.' : status === 'clean' ? 'Marked clean.' : 'Reset to not checked.');
      void load({ silent: true });
    } catch (e) { setError(errorText(e)); }
    setBusyId(null);
  };

  const quarantineAction = (u: Upload, action: 'quarantine' | 'restore' | 'purge') => setConfirmModal({ u, action });

  const runQuarantine = async (u: Upload, action: 'quarantine' | 'restore' | 'purge') => {
    setBusyId(u._id); setError(''); setInfo('');
    try {
      const updated = await api.soc.quarantineUpload(u._id, action);
      setRows(prev => prev.map(r => r._id === u._id ? { ...r, ...updated } : r));
      setInfo(action === 'quarantine' ? 'File quarantined.' : action === 'restore' ? 'File restored.' : 'File deleted.');
      void load({ silent: true });
    } catch (e) { setError(errorText(e)); }
    setBusyId(null);
  };

  const count = (key: string) => key === 'all' ? Object.values(summary).reduce((a, b) => a + b, 0)
    : key === 'review' ? needsReview : key === 'unreviewed' ? (summary.unreviewed || 0) : (summary[key] || 0);

  const btn = 'inline-flex items-center gap-1 text-[11px] font-semibold rounded-lg px-2 py-1 disabled:opacity-50';

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 space-y-1.5">
        <p className="flex items-start gap-2"><Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <span>
            <b>Checking a file on VirusTotal:</b> click <b>Open in VirusTotal</b> on a row (or <b>copy</b> its SHA-256 and paste it into the search box on virustotal.com).
            Read the result, then record it with <b>Mark clean</b> or <b>Flag as malicious</b>. Flagging opens an incident; use <b>Quarantine</b> to stop the file being downloaded.
          </span>
        </p>
        <p className="flex items-start gap-2 text-amber-800"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b>Look the hash up — never upload the document itself.</b> VirusTotal shares uploaded files with its customers, and these are students&apos; passports and certificates.
            “File not found” on VirusTotal is normal for a private document and isn&apos;t a risk signal. Every upload is also scanned locally by ClamAV and inspected for hidden macros, scripts and disguised file types.
          </span>
        </p>
      </div>
      {error && <ErrorBanner compact message={error} />}
      {info && <p role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{info}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f.key ? 'bg-white text-purple-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}>
              {f.label} <span className={`ml-1 ${(f.key === 'flagged' || f.key === 'review') && count(f.key) > 0 ? 'text-red-700' : 'text-gray-600'}`}>{count(f.key)}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="File name, user or hash…" aria-label="Search uploads"
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        {loadError ? <div className="p-4"><ErrorBanner message={loadError} onRetry={() => { void load(); }} /></div>
          : loading ? <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
          : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <FileText className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm font-semibold text-gray-500">No uploads</p>
              <p className="text-xs text-gray-500 mt-1">Documents appear here as students, counselors and chats upload them.</p>
            </div>
          ) : rows.map(u => {
            const status = u.review?.status || 'unreviewed';
            return (
              // On a phone the actions wrap onto their own line under the details (flex-wrap); from `sm` up they sit in a column
              // to the right as before. Without the wrap the action buttons pushed past the screen and squeezed the file name to nothing.
              <div key={u._id} className="flex flex-wrap sm:flex-nowrap items-start gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <FileText className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 truncate">{u.originalName}</span>
                    <ReviewBadge review={u.review} />
                    {u.blocked && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-600 text-white" title={u.quarantineReason}>Blocked at upload</span>}
                    {u.quarantined && !u.blocked && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-gray-900" title={u.quarantineReason}>Quarantined</span>}
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
                    <span className="capitalize text-gray-500">({u.role})</span>
                    <span>· {SOURCE_LABEL[u.source] || u.source} · {fmtSize(u.size)}{u.ip ? ` · ${u.ip}` : ''}</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <span className="font-mono">{u.sha256.slice(0, 16)}…</span>
                    <button type="button" onClick={() => copy(u.sha256)} className="inline-flex items-center gap-0.5 hover:text-purple-700" title="Copy the full SHA-256 to paste into VirusTotal">
                      <Copy className="w-3 h-3" />{copied === u.sha256 ? 'copied' : 'copy hash'}
                    </button>
                    {u.review?.note && <span className="text-gray-500">· “{u.review.note}”</span>}
                  </p>
                </div>
                <div className="w-full sm:w-auto pl-8 sm:pl-0 flex flex-col items-start sm:items-end gap-1.5 sm:shrink-0">
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">{new Date(u.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <div className="flex items-center gap-1 flex-wrap sm:justify-end">
                    <a href={u.vtLink} target="_blank" rel="noopener noreferrer" className={`${btn} text-purple-700 bg-purple-50 hover:bg-purple-100`} title="Opens this file's hash on virustotal.com">
                      <ExternalLink className="w-3 h-3" /> Open in VirusTotal
                    </a>
                    {status !== 'clean' && (
                      <button type="button" onClick={() => setReview(u, 'clean')} disabled={busyId === u._id} className={`${btn} text-green-700 bg-green-50 hover:bg-green-100`}><Check className="w-3 h-3" /> Mark clean</button>
                    )}
                    {status !== 'flagged' && (
                      <button type="button" onClick={() => setReview(u, 'flagged')} disabled={busyId === u._id} className={`${btn} text-red-700 bg-red-50 hover:bg-red-100`}><Flag className="w-3 h-3" /> Flag as malicious</button>
                    )}
                    {status !== 'unreviewed' && (
                      <button type="button" onClick={() => setReview(u, 'unreviewed')} disabled={busyId === u._id} className={`${btn} text-gray-600 bg-gray-100 hover:bg-gray-200`} title="Reset to not checked"><RotateCcw className="w-3 h-3" /></button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap sm:justify-end">
                    {!u.quarantined && !u.purgedAt && (
                      <button type="button" onClick={() => quarantineAction(u, 'quarantine')} disabled={busyId === u._id} title="Move the file out of the served uploads folder"
                        className={`${btn} text-amber-700 bg-amber-50 hover:bg-amber-100`}><ShieldBan className="w-3 h-3" /> Quarantine</button>
                    )}
                    {u.quarantined && !u.blocked && !u.purgedAt && (
                      <button type="button" onClick={() => quarantineAction(u, 'restore')} disabled={busyId === u._id} className={`${btn} text-green-700 bg-green-50 hover:bg-green-100`}><Undo2 className="w-3 h-3" /> Restore</button>
                    )}
                    {u.quarantined && !u.purgedAt && (
                      <button type="button" onClick={() => quarantineAction(u, 'purge')} disabled={busyId === u._id} className={`${btn} text-red-700 bg-red-50 hover:bg-red-100`}><Trash2 className="w-3 h-3" /> Delete</button>
                    )}
                    {busyId === u._id && <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />}
                  </div>
                </div>
              </div>
            );
          })}
        {truncated && <p className="p-3 text-center text-xs text-amber-700 bg-amber-50 border-t border-amber-100">Search looked at the newest 5,000 records only. Narrow the filters or date range to find older matches.</p>}
        {!loading && !loadError && rows.length < total && (
          <div className="p-3 text-center border-t border-gray-50">
            <button type="button" onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 rounded-lg disabled:opacity-50">
              {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{loadingMore ? 'Loading…' : `Load more (${rows.length} of ${total})`}
            </button>
          </div>
        )}
      </div>

      {reviewModal && (
        <Modal label={reviewModal.status === 'flagged' ? 'Flag as malicious' : 'Mark clean'} onClose={() => setReviewModal(null)} className="max-w-sm">
          <form className="p-5 space-y-3" onSubmit={e => {
            e.preventDefault();
            if (reviewModal.status === 'flagged' && !reviewModal.note.trim()) return;
            const m = reviewModal; setReviewModal(null); void submitReview(m.u, m.status, m.note.trim());
          }}>
            <div className="flex items-start justify-between">
              <h2 className="text-sm font-bold text-gray-900">{reviewModal.status === 'flagged' ? 'Flag as malicious' : 'Mark clean'}</h2>
              <button type="button" onClick={() => setReviewModal(null)} aria-label="Close" className="text-gray-500 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500">
              {reviewModal.status === 'flagged'
                ? 'What did VirusTotal show (e.g. "14/70 engines flag it")? This opens an incident.'
                : 'Optional note (e.g. "0/70 on VirusTotal").'}
            </p>
            <input autoFocus value={reviewModal.note} onChange={e => setReviewModal(m => m && { ...m, note: e.target.value })}
              aria-label={reviewModal.status === 'flagged' ? 'What did VirusTotal show?' : 'Note'}
              placeholder={reviewModal.status === 'flagged' ? 'Required — what did VirusTotal show?' : 'Optional note'}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setReviewModal(null)} className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={reviewModal.status === 'flagged' && !reviewModal.note.trim()}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-50">
                Confirm
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmModal && (() => {
        const { u, action } = confirmModal;
        const text = action === 'quarantine'
          ? `Quarantine "${u.originalName}"? It is moved out of the served uploads folder, so its download link stops working. You can restore it later.`
          : action === 'restore'
          ? `Restore "${u.originalName}"? Its download link starts working again.`
          : `Permanently delete "${u.originalName}"? This cannot be undone.`;
        return (
          <Modal label={action === 'purge' ? 'Delete file' : action === 'restore' ? 'Restore file' : 'Quarantine file'} onClose={() => setConfirmModal(null)} className="max-w-sm">
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <h2 className="text-sm font-bold text-gray-900 capitalize">{action}</h2>
                <button type="button" onClick={() => setConfirmModal(null)} aria-label="Close" className="text-gray-500 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-sm text-gray-600">{text}</p>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setConfirmModal(null)} className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="button" onClick={() => { setConfirmModal(null); void runQuarantine(u, action); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${action === 'purge' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                  Confirm
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
