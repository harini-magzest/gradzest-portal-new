// Severity-based routing for brand-new incidents. Everything here goes to the SOC OWNER(S) only (lib/socRecipients.js):
//   SOC_NOTIFY_MIN_SEVERITY (default "high")      → in-app notification
//   SOC_EMAIL_MIN_SEVERITY  (default "critical")  → email
//   SOC_WEBHOOK_MIN_SEVERITY (default "high")     → chat webhook / Telegram (lib/alertChannels.js)
// The dashboard itself gets incidents live over the socket, so the in-app tier is a persisted Notification for an owner
// who isn't looking at it. Notifications are stored unencrypted, so by default they carry no incident title
// (SOC_ALERT_DETAIL=full adds it).

const { detailMode, notifyChannels, SEVERITY_RANK } = require('./alertChannels');

function meetsMin(severity, envName, fallback) {
  const min = SEVERITY_RANK[process.env[envName]] ?? SEVERITY_RANK[fallback];
  return (SEVERITY_RANK[severity] ?? 0) >= min;
}

async function notifyOwnersInApp(incident) {
  const Notification = require('../models/Notification');
  const { socOwnerUsers } = require('./socRecipients');
  const owners = await socOwnerUsers();
  if (!owners.length) return;
  const sev = String(incident.severity).toUpperCase();
  const title = `${incident.severity === 'critical' ? '🚨' : '⚠️'} ${sev} incident`;
  const message = detailMode() === 'full' && incident.title ? incident.title : `A ${sev.toLowerCase()} security incident was opened. Open the SOC for details.`;
  await Notification.insertMany(owners.map((a) => ({
    userId: a._id, type: 'security', priority: incident.severity === 'critical' ? 'urgent' : 'normal', title, message, link: '/soc',
  })));
}

async function routeIncidentAlert(incident) {
  const { sendCriticalIncidentAlert } = require('./criticalAlert');
  const tasks = [notifyChannels(incident)]; // applies its own severity threshold
  if (meetsMin(incident.severity, 'SOC_NOTIFY_MIN_SEVERITY', 'high')) tasks.push(notifyOwnersInApp(incident));
  if (meetsMin(incident.severity, 'SOC_EMAIL_MIN_SEVERITY', 'critical')) tasks.push(sendCriticalIncidentAlert(incident));
  await Promise.allSettled(tasks);
}

module.exports = { routeIncidentAlert, meetsMin };
