// Severity-based routing for brand-new incidents. Two tiers, both env-tunable:
//   SOC_NOTIFY_MIN_SEVERITY (default "high")     → in-app notification to every admin
//   SOC_EMAIL_MIN_SEVERITY  (default "critical") → email to every admin
// There's no WhatsApp/SMS/push transport wired into this app, so those channels
// aren't offered here; the dashboard itself gets incidents live over the socket, so the in-app tier is
// a persisted Notification for admins who aren't looking at it.

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function meetsMin(severity, envName, fallback) {
  const min = SEVERITY_RANK[process.env[envName]] ?? SEVERITY_RANK[fallback];
  return (SEVERITY_RANK[severity] ?? 0) >= min;
}

async function notifyAdminsInApp(incident) {
  const User = require('../models/User');
  const Notification = require('../models/Notification');
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  if (!admins.length) return;
  const title = `${incident.severity === 'critical' ? '🚨' : '⚠️'} ${incident.severity.toUpperCase()} incident`;
  await Notification.insertMany(admins.map((a) => ({
    userId: a._id, type: 'security', priority: incident.severity === 'critical' ? 'urgent' : 'normal',
    title, message: incident.title, link: '/soc',
  })));
}

async function routeIncidentAlert(incident) {
  const { sendCriticalIncidentAlert } = require('./criticalAlert');
  const tasks = [];
  if (meetsMin(incident.severity, 'SOC_NOTIFY_MIN_SEVERITY', 'high')) tasks.push(notifyAdminsInApp(incident));
  if (meetsMin(incident.severity, 'SOC_EMAIL_MIN_SEVERITY', 'critical')) tasks.push(sendCriticalIncidentAlert(incident));
  await Promise.allSettled(tasks);
}

module.exports = { routeIncidentAlert, meetsMin };
