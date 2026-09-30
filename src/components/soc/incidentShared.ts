// Shared between IncidentsTab and InvestigateTab so the same incident
// renders identically wherever it appears, and adding a new incident type
// only means updating one place instead of drifting out of sync (see the
// dead 'oauth_csrf' entry that had to be cleaned up after the underlying
// feature was removed but a duplicate label list wasn't).

export interface Note { author: string; authorRole: string; text: string; createdAt: string }
export interface Incident {
  _id: string; type: string; severity: string; status: string; title: string;
  relatedIp?: string; relatedEmail?: string; notes: Note[]; createdAt: string; updatedAt: string; stale?: boolean;
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
};
