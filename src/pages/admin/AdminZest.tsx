import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Upload, FileText, Trash2, Pencil, Download, CheckCircle2, AlertTriangle, Clock, RefreshCw, X, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../api';
import { useNotifications } from '../../context/NotificationContext';

interface QueryLogRow {
  id: string; question: string; answer: string; userRole: string;
  userName: string; userEmail: string; sourceDocCount: number; createdAt: string;
}

interface KbDocument {
  _id: string;
  title: string;
  status: 'processing' | 'ready' | 'failed';
  error?: string;
  chunkCount: number;
  fileSize: number;
  createdAt: string;
}

interface LeadAlertRow {
  id: string;
  alertType: 'stale' | 'duplicate' | 'overdue_task' | 'stuck_application';
  severity: 'warning' | 'urgent';
  detail: string;
  flaggedOn: string;
  leadName: string;
  leadEmail: string;
  counselorName: string;
}

const ALERT_LABELS: Record<LeadAlertRow['alertType'], string> = {
  stale: 'Stale lead',
  duplicate: 'Possible duplicate',
  overdue_task: 'Overdue task',
  stuck_application: 'Stuck application',
};

function StatusBadge({ status, error }: { status: KbDocument['status']; error?: string }) {
  if (status === 'ready') return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>;
  if (status === 'failed') return <span title={error} className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full"><AlertTriangle className="w-3.5 h-3.5" /> Failed</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full"><Clock className="w-3.5 h-3.5" /> Processing</span>;
}

export default function AdminZest() {
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [alerts, setAlerts] = useState<LeadAlertRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [docsError, setDocsError] = useState('');
  const [alertsError, setAlertsError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { notifications } = useNotifications();

  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<QueryLogRow[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState('');

  const loadLogs = async () => {
    setLoadingLogs(true); setLogsError('');
    try {
      const data = await api.zest.queryLogs({ limit: 50 });
      setLogs(data.logs); setLogsTotal(data.total);
    } catch (err: any) {
      setLogsError(err.message || 'Could not load the query log.');
    } finally {
      setLoadingLogs(false);
    }
  };
  useEffect(() => { if (logsOpen && logs.length === 0 && !loadingLogs) loadLogs(); }, [logsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDocs = async () => {
    setLoadingDocs(true); setDocsError('');
    try { setDocs(await api.zest.documents()); }
    catch (err: any) { setDocsError(err.message || 'Could not load the knowledge base.'); }
    finally { setLoadingDocs(false); }
  };
  const loadAlerts = async () => {
    setLoadingAlerts(true); setAlertsError('');
    try { setAlerts(await api.zest.alerts()); }
    catch (err: any) { setAlertsError(err.message || 'Could not load lead alerts.'); }
    finally { setLoadingAlerts(false); }
  };

  useEffect(() => { loadDocs(); loadAlerts(); }, []);

  // The daily analytics job pushes a Notification linking here via the existing socket
  // pipeline (sound + toast already fire from NotificationContext) — refresh the live
  // alert table whenever one of those arrives, instead of polling.
  const latestZestNotifId = useMemo(() => notifications.find(n => n.link === '/admin/zest')?.id, [notifications]);
  useEffect(() => { if (latestZestNotifId) loadAlerts(); }, [latestZestNotifId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name.replace(/\.pdf$/i, ''));
      await api.zest.uploadDocument(fd);
      await loadDocs();
    } catch (err: any) {
      alert(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this document from the knowledge base?')) return;
    try {
      await api.zest.deleteDocument(id);
      setDocs(prev => prev.filter(d => d._id !== id));
    } catch (err: any) {
      alert(err?.message || 'Could not delete this document.');
    }
  };

  const handleRename = async () => {
    if (!renaming) return;
    try {
      const updated = await api.zest.renameDocument(renaming.id, renaming.title);
      setDocs(prev => prev.map(d => d._id === updated._id ? updated : d));
      setRenaming(null);
    } catch (err: any) {
      alert(err?.message || 'Could not rename this document.');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await api.zest.resolveAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      alert(err?.message || 'Could not resolve this alert.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0d1b4b] flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Zest</h1>
          <p className="text-sm text-gray-500">Manage the knowledge base Zest answers from, and review today's lead alerts.</p>
        </div>
      </div>

      {/* Knowledge base */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Knowledge base</h2>
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-[#0d1b4b] hover:bg-[#152258] cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload PDF'}
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          </label>
        </div>

        {docsError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">{docsError}</p>}
        {loadingDocs ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">{docsError ? 'Could not load the knowledge base.' : 'No documents yet — upload a PDF to get started.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 font-medium">Title</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Chunks</th>
                  <th className="py-2 font-medium">Size</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d._id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 flex items-center gap-2 text-gray-800 font-medium">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" /> {d.title}
                    </td>
                    <td className="py-3"><StatusBadge status={d.status} error={d.error} /></td>
                    <td className="py-3 text-gray-500">{d.chunkCount}</td>
                    <td className="py-3 text-gray-500">{(d.fileSize / 1024).toFixed(0)} KB</td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setRenaming({ id: d._id, title: d.title })} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(d._id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Daily lead alerts */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Daily lead alerts</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={loadAlerts} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => api.zest.downloadAlerts()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
              <Download className="w-4 h-4" /> Export .xlsx
            </button>
          </div>
        </div>

        {alertsError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">{alertsError}</p>}
        {loadingAlerts ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">{alertsError ? 'Could not load lead alerts.' : 'No open alerts — the daily analytics job runs at 08:00.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 font-medium">Lead</th>
                  <th className="py-2 font-medium">Counselor</th>
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">Detail</th>
                  <th className="py-2 font-medium">Flagged</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3">
                      <p className="font-medium text-gray-800">{a.leadName}</p>
                      <p className="text-xs text-gray-400">{a.leadEmail}</p>
                    </td>
                    <td className="py-3 text-gray-500">{a.counselorName || '—'}</td>
                    <td className="py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${a.severity === 'urgent' ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50'}`}>
                        {ALERT_LABELS[a.alertType]}
                      </span>
                    </td>
                    <td className="py-3 text-gray-600 max-w-xs">{a.detail}</td>
                    <td className="py-3 text-gray-400 whitespace-nowrap">{new Date(a.flaggedOn).toLocaleDateString()}</td>
                    <td className="py-3">
                      <button type="button" onClick={() => handleResolve(a.id)} className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap">
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Query log — every question Zest was asked and the answer it gave */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <button type="button" onClick={() => setLogsOpen(o => !o)} className="w-full flex items-center justify-between text-left">
          <span className="flex items-center gap-2 font-semibold text-gray-900">
            <MessageCircle className="w-4 h-4 text-gray-400" /> Query log
            {logsTotal > 0 && <span className="text-xs font-normal text-gray-400">({logsTotal} total)</span>}
          </span>
          {logsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {logsOpen && (
          <div className="mt-4">
            {logsError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">{logsError}</p>}
            {loadingLogs ? (
              <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">{logsError ? 'Could not load the query log.' : 'No questions asked yet.'}</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {logs.map(l => (
                  <div key={l.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-medium text-gray-500">{l.userName} <span className="text-gray-400">({l.userRole})</span></p>
                      <p className="text-xs text-gray-400 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</p>
                    </div>
                    <p className="text-sm text-gray-800 font-medium">{l.question}</p>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{l.answer}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {renaming && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Rename document</h3>
              <button type="button" onClick={() => setRenaming(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <input
              value={renaming.title}
              onChange={e => setRenaming({ ...renaming, title: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRenaming(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
              <button type="button" onClick={handleRename} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#0d1b4b] hover:bg-[#152258]">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
