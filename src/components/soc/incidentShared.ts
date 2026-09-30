// Shared between IncidentsTab and InvestigateTab so the same incident
// renders identically wherever it appears, and adding a new incident type
// only means updating one place instead of drifting out of sync (see the
// dead 'oauth_csrf' entry that had to be cleaned up after the underlying
// feature was removed but a duplicate label list wasn't).

export interface Note { author: string; authorRole: string; text: string; createdAt: string }
export interface Analyst { _id: string; name: string; email: string }
export interface Incident {
  _id: string; type: string; severity: string; status: string; title: string;
  relatedIp?: string; relatedEmail?: string; notes: Note[]; createdAt: string; updatedAt: string; stale?: boolean;
  assignedTo?: Analyst | null;
  acknowledgedAt?: string | null; resolvedAt?: string | null;
  resolutionReason?: string; resolutionComment?: string;
}

export const SEVERITY_STYLE: Record<string, { backgroundColor: string; color: string }> = {
  critical: { backgroundColor: '#FCE8E8', color: '#8B1A1A' }, high: { backgroundColor: '#FCEBEB', color: '#791F1F' },
  medium: { backgroundColor: '#FAEEDA', color: '#633806' }, low: { backgroundColor: '#E6F1FB', color: '#0C447C' }, info: { backgroundColor: '#F0F0F2', color: '#4B5563' },
};
export const STATUS_STYLE: Record<string, { backgroundColor: string; color: string }> = {
  open: { backgroundColor: '#FCEBEB', color: '#791F1F' }, investigating: { backgroundColor: '#FAEEDA', color: '#633806' },
  resolved: { backgroundColor: '#EAF3DE', color: '#27500A' }, false_positive: { backgroundColor: '#F0F0F2', color: '#4B5563' },
};
export const TYPE_LABEL: Record<string, string> = {
  brute_force: 'Brute Force', suspicious_ip: 'Suspicious IP', payment_anomaly: 'Payment Anomaly',
  account_lockout: 'Account Lockout', pii_bulk_access: 'Bulk PII Access', malware_upload: 'Malware Upload',
  waf_block: 'WAF Block', skyload_bot_activity: 'Skyload Bot Activity', impossible_travel: 'Impossible Travel', manual: 'Manual',
  credential_stuffing: 'Credential Stuffing', privilege_escalation: 'Privilege Escalation', off_hours_admin: 'Off-hours Admin Login',
  new_device_privileged: 'New Device (Privileged)', password_reset_abuse: 'Password Reset Abuse', mass_export: 'Mass Data Export',
};

export const RESOLUTION_REASONS: { value: string; label: string }[] = [
  { value: 'fixed', label: 'Fixed / remediated' }, { value: 'benign_activity', label: 'Benign activity' },
  { value: 'expected_behavior', label: 'Expected behavior' }, { value: 'testing', label: 'Testing / pentest' },
  { value: 'duplicate', label: 'Duplicate' }, { value: 'other', label: 'Other' },
];

export type SlaPolicy = Record<string, { ackMinutes: number; resolveHours: number }>;
// Fallback used until the incident list response supplies the server's policy.
export const DEFAULT_SLA_POLICY: SlaPolicy = {
  critical: { ackMinutes: 15, resolveHours: 4 }, high: { ackMinutes: 60, resolveHours: 24 },
  medium: { ackMinutes: 240, resolveHours: 72 }, low: { ackMinutes: 1440, resolveHours: 168 }, info: { ackMinutes: 4320, resolveHours: 336 },
};

export interface SlaState { label: string; breached: boolean; tone: 'ok' | 'warn' | 'breach' | 'done' }

// Mirrors server/lib/sla.js computeSla() using the policy the server sends, so
// incidents updated live over the socket (which carry no computed fields) still show SLA.
export function slaState(inc: Incident, policy: SlaPolicy = DEFAULT_SLA_POLICY, now = Date.now()): SlaState {
  const p = policy[inc.severity] || policy.medium || DEFAULT_SLA_POLICY.medium;
  const created = new Date(inc.createdAt).getTime();
  const ackDue = created + p.ackMinutes * 60000;
  const resolveDue = created + p.resolveHours * 3600000;
  const closed = inc.status === 'resolved' || inc.status === 'false_positive';
  if (closed) {
    const late = inc.resolvedAt ? new Date(inc.resolvedAt).getTime() > resolveDue : false;
    return { label: late ? 'Closed late' : 'Closed in SLA', breached: late, tone: late ? 'breach' : 'done' };
  }
  if (!inc.acknowledgedAt && now > ackDue) return { label: `Ack overdue ${humanDuration(now - ackDue)}`, breached: true, tone: 'breach' };
  if (now > resolveDue) return { label: `Resolve overdue ${humanDuration(now - resolveDue)}`, breached: true, tone: 'breach' };
  const next = !inc.acknowledgedAt ? ackDue : resolveDue;
  const left = next - now;
  return { label: `${!inc.acknowledgedAt ? 'Ack' : 'Resolve'} in ${humanDuration(left)}`, breached: false, tone: left < 3600000 ? 'warn' : 'ok' };
}

export function humanDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const SLA_TONE_STYLE: Record<SlaState['tone'], { backgroundColor: string; color: string }> = {
  ok: { backgroundColor: '#EAF3DE', color: '#27500A' }, warn: { backgroundColor: '#FAEEDA', color: '#633806' },
  breach: { backgroundColor: '#FCE8E8', color: '#8B1A1A' }, done: { backgroundColor: '#F0F0F2', color: '#4B5563' },
};
