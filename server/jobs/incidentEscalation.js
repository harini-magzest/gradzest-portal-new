// Escalates incidents nobody has picked up. A high or critical incident that is still "open" with no analyst touch
// (no status change, assignment or note) after its acknowledge-SLA (lib/sla.js: critical 15 min, high 60 min) triggers
// ONE follow-up alert on every channel — email to the owner plus the webhook / Telegram — so a single owner who missed
// the first ping gets a second, more insistent one. escalatedAt makes it once-only per incident.

const cron = require('node-cron');
const SecurityIncident = require('../models/SecurityIncident');
const { SLA_POLICY } = require('../lib/sla');
const { notifyChannels } = require('../lib/alertChannels');
const { sendEscalationEmail } = require('../lib/criticalAlert');

async function runEscalation({ now = Date.now(), fetchImpl } = {}) {
  const candidates = await SecurityIncident.find({
    status: 'open', acknowledgedAt: null, escalatedAt: null, severity: { $in: ['critical', 'high'] },
  }).lean();

  let escalated = 0;
  for (const inc of candidates) {
    const dueAt = new Date(inc.createdAt).getTime() + (SLA_POLICY[inc.severity]?.ackMinutes ?? 60) * 60000;
    if (now < dueAt) continue;
    // Claim it atomically so two server instances (or two overlapping runs) can't both alert.
    const claimed = await SecurityIncident.updateOne({ _id: inc._id, escalatedAt: null }, { $set: { escalatedAt: new Date(now) } });
    if (!claimed.modifiedCount) continue;
    escalated += 1;
    await Promise.allSettled([
      notifyChannels(inc, { kind: 'escalation', force: true, fetchImpl }),
      sendEscalationEmail(inc),
    ]);
  }
  return escalated;
}

function startIncidentEscalation() {
  cron.schedule('*/5 * * * *', () => {
    runEscalation().catch((err) => console.error('[incidentEscalation] error:', err.message));
  });
  console.log('[incident-escalation] Scheduled — checks every 5 minutes');
}

module.exports = { runEscalation, startIncidentEscalation };
