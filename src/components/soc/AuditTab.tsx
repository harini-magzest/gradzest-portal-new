import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Eye, ShieldCheck, ShieldAlert, Download } from 'lucide-react';
import { api } from '../../api';
import { useSocSocket, useOnResync } from './SocketContext';
import { ErrorBanner, Section, Spinner, errorText } from './ui';

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
  const [exportError, setExportError] = useState('');
  const [chain, setChain] = useState<ChainStatus | null>(null);
  // The tamper check itself failing is not the same as "no tampering found": say it could not be run.
  const [chainUnavailable, setChainUnavailable] = useState(false);

  // silent = a refresh pushed by a live event: the tab stays as it is (no spinner replacing it, no lost scroll position),
  // and a failed refresh keeps what is already on screen.
  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) { setLoading(true); setError(''); }
    try {
      const [pii, trail, verify] = await Promise.all([api.soc.piiAudit(), api.soc.auditTrail(), api.soc.verifyAuditTrail().catch(() => null)]);
      setChain(verify); setChainUnavailable(verify === null);
      setTopAccessors(pii.topAccessors || []);
      setRecentAccesses(pii.recentAccesses || []);
      setActions(trail.actions || []);
      setError('');
    } catch (e) { if (!opts.silent) setError(errorText(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Entries pushed while the connection was down never arrived; fetch them again.
  useOnResync(() => { void load({ silent: true }); });

  useEffect(() => {
    if (!socket) return;
    const onPiiAccess = () => { void load({ silent: true }); };
    // The pushed entry only carries ids; refetch so names and targets are resolved like every other row.
    const onAnalystAction = () => { api.soc.auditTrail().then(t => setActions(t.actions || [])).catch(() => {}); };
    socket.on('pii_access', onPiiAccess);
    socket.on('analyst_action', onAnalystAction);
    return () => { socket.off('pii_access', onPiiAccess); socket.off('analyst_action', onAnalystAction); };
  }, [socket, load]);

  const exportCsv = () => {
    setExportError('');
    api.soc.download('/audit-trail/export.csv', 'soc-audit-trail.csv').catch(e => setExportError(errorText(e)));
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={() => { void load(); }} />;

  return (
    <div className="space-y-8">
      {exportError && <ErrorBanner compact message={exportError} onRetry={exportCsv} />}
      <Section title="Student data access" hint="Who opened students' personal details">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 min-w-0">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-bold text-gray-900">Top PII Accessors — last 24h</h3>
            </div>
            {topAccessors.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No student profile views recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-100">
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

          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 min-w-0">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-bold text-gray-900">Recent PII Access</h3>
            </div>
            {recentAccesses.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No student profile views recorded yet.</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {recentAccesses.map(a => (
                  <div key={a._id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-gray-800">{a.accessorEmail}</span>
                      <span className="text-gray-500"> viewed </span>
                      <span className="font-medium text-gray-800">{a.applicantEmail}</span>
                      <span className="text-xs text-gray-500 ml-2">{a.fieldsAccessed.join(', ')}</span>
                    </div>
                    <span className="text-[11px] text-gray-500 shrink-0 whitespace-nowrap">{formatTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title="Analyst actions" hint="Everything done from the SOC, in a tamper-checked log">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
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
            {chainUnavailable && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"
                title="The check that confirms the log has not been edited could not be run just now. The entries below are still shown.">
                <ShieldAlert className="w-3 h-3" /> Tamper check unavailable
              </span>
            )}
            <button type="button" onClick={exportCsv}
              className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1.5">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
          {actions.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No triage actions taken yet.</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {actions.map(a => (
                <div key={a._id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800" title={a.analystEmail}>{a.analystName || a.analystEmail}</span>
                    <span className="text-gray-500"> · {actionLabel(a.action)} · </span>
                    <span className="text-xs text-gray-700" title={a.targetId}>{a.targetLabel || a.targetId}</span>
                    {a.reason && <span className="text-xs text-gray-500 ml-2">({a.reason})</span>}
                  </div>
                  <span className="text-[11px] text-gray-500 shrink-0 whitespace-nowrap">{formatTime(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
