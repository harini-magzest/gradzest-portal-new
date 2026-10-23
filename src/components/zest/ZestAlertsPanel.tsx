import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '../../api';
import { useNotifications } from '../../context/NotificationContext';

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

// The alert notification opens Zest here; the old page's link is matched too so notifications saved before the
// move still refresh this list.
const ALERT_LINKS = ['/admin?zest=alerts', '/admin/zest'];

// Today's lead alerts from the daily 08:00 job. Admin only (the server enforces it).
export default function ZestAlertsPanel() {
  const [alerts, setAlerts] = useState<LeadAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { notifications } = useNotifications();

  const load = async () => {
    setLoading(true);
    try { setAlerts(await api.zest.alerts()); setError(''); }
    catch (err: any) { setError(err?.message || 'Could not load the alerts.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // The daily job pushes a notification through the existing socket pipeline; refresh when a new one arrives
  // instead of polling.
  const latestAlertNotifId = useMemo(() => notifications.find(n => n.link && ALERT_LINKS.includes(n.link))?.id, [notifications]);
  useEffect(() => { if (latestAlertNotifId) load(); }, [latestAlertNotifId]);

  const resolve = async (id: string) => {
    setError('');
    try {
      await api.zest.resolveAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Could not resolve that alert.');
    }
  };

  const exportXlsx = async () => {
    setError('');
    try { await api.zest.downloadAlerts(); } catch (err: any) { setError(err?.message || 'Download failed.'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">{alerts.length} open alert{alerts.length === 1 ? '' : 's'}. The daily check runs at 08:00.</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={load} aria-label="Refresh" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={exportXlsx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50">
            <Download className="w-3.5 h-3.5" /> Export .xlsx
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {loading && alerts.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No open alerts.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map(a => (
            <li key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-xs p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 wrap-break-word">{a.leadName}</p>
                  <p className="text-xs text-gray-400 break-all">{a.leadEmail}{a.counselorName ? ` · ${a.counselorName}` : ''}</p>
                </div>
                <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${a.severity === 'urgent' ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50'}`}>
                  {ALERT_LABELS[a.alertType]}
                </span>
              </div>
              <p className="mt-1.5 text-gray-600">{a.detail}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-gray-400">Flagged {new Date(a.flaggedOn).toLocaleDateString()}</span>
                <button type="button" onClick={() => resolve(a.id)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
