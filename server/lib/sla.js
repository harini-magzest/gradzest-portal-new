// Response-time targets per incident severity. `ackMinutes`: time from creation
// to first analyst touch (status leaves "open", assignment, or a note).
// `resolveHours`: time from creation to resolved / false_positive.
const SLA_POLICY = {
  critical: { ackMinutes: 15, resolveHours: 4 },
  high:     { ackMinutes: 60, resolveHours: 24 },
  medium:   { ackMinutes: 240, resolveHours: 72 },
  low:      { ackMinutes: 1440, resolveHours: 168 },
  info:     { ackMinutes: 4320, resolveHours: 336 },
};

const CLOSED = ['resolved', 'false_positive'];

// Pure function of the incident's own timestamps, so the dashboard can mirror
// it client-side from the policy alone.
function computeSla(incident, now = Date.now()) {
  const policy = SLA_POLICY[incident.severity] || SLA_POLICY.medium;
  const created = new Date(incident.createdAt).getTime();
  const ackDue = created + policy.ackMinutes * 60000;
  const resolveDue = created + policy.resolveHours * 3600000;
  const ackedAt = incident.acknowledgedAt ? new Date(incident.acknowledgedAt).getTime() : null;
  const resolvedAt = incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : null;
  const closed = CLOSED.includes(incident.status);
  return {
    ackDue: new Date(ackDue),
    resolveDue: new Date(resolveDue),
    ackBreached: ackedAt ? ackedAt > ackDue : now > ackDue && !closed,
    resolveBreached: closed ? (resolvedAt ? resolvedAt > resolveDue : false) : now > resolveDue,
  };
}

module.exports = { SLA_POLICY, CLOSED, computeSla };
