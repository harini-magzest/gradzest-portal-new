import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ClipboardCheck, Eye, ShieldCheck } from 'lucide-react';
import { api, getApiToken } from '../../api';

interface TopAccessor { _id: string; accessorEmail: string; accessorRole: string; totalAccesses: number; uniqueApplicants: number }
interface PiiAccess { _id: string; accessorEmail: string; accessorRole: string; applicantEmail: string; fieldsAccessed: string[]; accessType: string; createdAt: string }
interface AnalystAction { _id: string; analystEmail: string; action: string; targetType: string; targetId: string; reason: string; createdAt: string }

const ACTION_LABEL: Record<string, string> = {
  block_ip: 'Blocked IP', unblock_ip: 'Unblocked IP', revoke_user_sessions: 'Revoked sessions',
  incident_status_change: 'Changed incident status', incident_assigned: 'Reassigned incident',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AuditTab() {
  const [topAccessors, setTopAccessors] = useState<TopAccessor[]>([]);
  const [recentAccesses, setRecentAccesses] = useState<PiiAccess[]>([]);
  const [actions, setActions] = useState<AnalystAction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pii, trail] = await Promise.all([api.soc.piiAudit(), api.soc.auditTrail()]);
      setTopAccessors(pii.topAccessors || []);
      setRecentAccesses(pii.recentAccesses || []);
      setActions(trail.actions || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket: Socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
    });
    socket.on('pii_access', () => load());
    socket.on('analyst_action', (entry: AnalystAction) => setActions(prev => [entry, ...prev].slice(0, 50)));
    return () => { socket.disconnect(); };
  }, [load]);

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6">
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
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-bold text-gray-900">Analyst Action Trail</h3>
        </div>
        {actions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No triage actions taken yet.</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {actions.map(a => (
              <div key={a._id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-gray-800">{a.analystEmail}</span>
                  <span className="text-gray-400"> · {ACTION_LABEL[a.action] || a.action} · </span>
                  <span className="font-mono text-xs text-gray-600">{a.targetId}</span>
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
