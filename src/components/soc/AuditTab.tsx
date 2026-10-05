import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Eye, ShieldCheck, ShieldAlert, Download } from 'lucide-react';
import { api } from '../../api';
import { useSocSocket } from './SocketContext';
import { ErrorBanner, Spinner, errorText } from './ui';

interface TopAccessor { _id: string; accessorEmail: string; accessorRole: string; totalAccesses: number; uniqueApplicants: number }
interface PiiAccess { _id: string; accessorEmail: string; accessorRole: string; applicantEmail: string; fieldsAccessed: string[]; accessType: string; createdAt: string }
interface AnalystAction { _id: string; analystName?: string; targetLabel?: string; analystEmail: string; action: string; targetType: string; targetId: string; reason: string; createdAt: string }

const ACTION_LABEL: Record<string, string> = {
  block_ip: 'Blocked IP', unblock_ip: 'Unblocked IP', revoke_user_sessions: 'Revoked sessions',
  incident_status_change: 'Changed incident status', incident_assigned: 'Reassigned incident',
  bulk_block_ip: 'Bulk-blocked IPs', revoke_session: 'Revoked one session', force_password_reset: 'Forced password reset',
  add_suppression: 'Added suppression rule', remove_suppression: 'Removed suppression rule',
};
// Anything not listed above (newer actions) still reads as words, not a raw code.
const actionLabel = (a: string) => ACTION_LABEL[a] || a.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

interface ChainStatus { ok: boolean; checked: number; unchained: number; brokenAt: { createdAt: string; action: string } | null }

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AuditTab() {
  const { socket } = useSocSocket();
  const [topAccessors, setTopAccessors] = useState<TopAccessor[]>([]);
  const [recentAccesses, setRecentAccesses] = useState<PiiAccess[]>([]);
  const [actions, setActions] = useState<AnalystAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chain, setChain] = useState<ChainStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pii, trail, verify] = await Promise.all([api.soc.piiAudit(), api.soc.auditTrail(), api.soc.verifyAuditTrail().catch(() => null)]);
      setChain(verify);
      setTopAccessors(pii.topAccessors || []);
      setRecentAccesses(pii.recentAccesses || []);
      setActions(trail.actions || []);
    } catch (e) { setError(errorText(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onPiiAccess = () => load();
    // The pushed entry only carries ids; refetch so names and targets are resolved like every other row.
    const onAnalystAction = () => { api.soc.auditTrail().then(t => setActions(t.actions || [])).catch(() => {}); };
    socket.on('pii_access', onPiiAccess);
    socket.on('analyst_action', onAnalystAction);
    return () => { socket.off('pii_access', onPiiAccess); socket.off('analyst_action', onAnalystAction); };
  }, [socket, load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-bold text-gray-900">Top PII Accessors — last 24h</h3>
        </div>
        {topAccessors.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No student profile views recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 uppercase border-b border-gray-100">
                  <th className="pb-2 pr-4">Accessor</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Distinct students</th>
                  <th className="pb-2">Total accesses</th>
                </tr>
              </thead>
              <tbody>
                {topAccessors.map(a => (
                  <tr key={a._id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4 font-medium text-gray-800">{a.accessorEmail}</td>
                    <td className="py-2 pr-4 text-gray-500 capitalize">{a.accessorRole}</td>
                    <td className="py-2 pr-4">
                      <span className={a.uniqueApplicants >= 30 ? 'text-red-600 font-semibold' : 'text-gray-700'}>{a.uniqueApplicants}</span>
                    </td>
                    <td className="py-2 text-gray-500">{a.totalAccesses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-bold text-gray-900">Recent PII Access</h3>
        </div>
        {recentAccesses.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No student profile views recorded yet.</p>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {recentAccesses.map(a => (
              <div key={a._id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-gray-800">{a.accessorEmail}</span>
                  <span className="text-gray-400"> viewed </span>
                  <span className="font-medium text-gray-800">{a.applicantEmail}</span>
                  <span className="text-xs text-gray-400 ml-2">{a.fieldsAccessed.join(', ')}</span>
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">{formatTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <ShieldCheck className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-bold text-gray-900">Analyst Action Trail</h3>
          {chain && (chain.ok ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700"
              title="Each entry's hash covers the one before it; any edit or deletion breaks the chain.">
              <ShieldCheck className="w-3 h-3" /> Tamper check passed · {chain.checked} entries verified{chain.unchained ? ` (${chain.unchained} older unchained)` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
              <ShieldAlert className="w-3 h-3" /> Chain broken at {chain.brokenAt ? `${actionLabel(chain.brokenAt.action)}, ${formatTime(chain.brokenAt.createdAt)}` : 'an unknown entry'} — the log was modified
            </span>
          ))}
          <button type="button" onClick={() => api.soc.download('/audit-trail/export.csv', 'soc-audit-trail.csv').catch(() => {})}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1.5">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
        {actions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No triage actions taken yet.</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {actions.map(a => (
              <div key={a._id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-gray-800" title={a.analystEmail}>{a.analystName || a.analystEmail}</span>
                  <span className="text-gray-400"> · {actionLabel(a.action)} · </span>
                  <span className="text-xs text-gray-700" title={a.targetId}>{a.targetLabel || a.targetId}</span>
                  {a.reason && <span className="text-xs text-gray-400 ml-2">({a.reason})</span>}
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">{formatTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
