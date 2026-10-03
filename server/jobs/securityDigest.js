// Daily "push" summary of SOC activity — closes the pull-only gap where
// nothing reaches an admin unless they happen to have the dashboard open.
// Also marks long-idle open/investigating incidents as stale so the queue
// reflects real triage backlog instead of growing forever unlabeled (no
// deletion or auto-resolution — stale is a housekeeping signal, not an
// analyst-driven outcome, so it never touches `status`).

const cron = require('node-cron');
const SecurityIncident = require('../models/SecurityIncident');
const SecurityEvent = require('../models/SecurityEvent');
const User = require('../models/User');

const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days with no update

async function markStaleIncidents() {
  const threshold = new Date(Date.now() - STALE_AFTER_MS);
  // { timestamps: false } is required here — Mongoose's timestamps plugin
  // otherwise auto-bumps updatedAt to now() on *any* updateMany, which would
  // make the "recently updated" un-stale pass below immediately match and
  // revert the very documents this pass just staled, in the same run.
  const staled = await SecurityIncident.updateMany(
    { status: { $in: ['open', 'investigating'] }, updatedAt: { $lt: threshold }, stale: false },
    { $set: { stale: true } },
    { timestamps: false },
  );
  // An incident that gets a fresh note/status change after going stale should un-stale.
  await SecurityIncident.updateMany(
    { status: { $in: ['open', 'investigating'] }, updatedAt: { $gte: threshold }, stale: true },
    { $set: { stale: false } },
    { timestamps: false },
  );
  return staled.modifiedCount || 0;
}

async function runSecurityDigest(mailer) {
  if (!mailer) return;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [newIncidents, openCount, staleCount, failedLogins, lockouts, admins] = await Promise.all([
      SecurityIncident.find({ createdAt: { $gte: since } }).select('severity').lean(),
      SecurityIncident.countDocuments({ status: { $in: ['open', 'investigating'] } }),
      SecurityIncident.countDocuments({ status: { $in: ['open', 'investigating'] }, stale: true }),
      SecurityEvent.countDocuments({ type: 'login_failure', createdAt: { $gte: since } }),
      SecurityEvent.countDocuments({ type: 'login_lockout', createdAt: { $gte: since } }),
      require('../lib/socRecipients').socOwnerUsers(), // SOC owner(s) only, not every admin
    ]);
    if (admins.length === 0) return;

    const severityCounts = newIncidents.reduce((acc, i) => {
      acc[i.severity] = (acc[i.severity] || 0) + 1;
      return acc;
    }, {});
    const severityLine = ['critical', 'high', 'medium', 'low', 'info']
      .filter((s) => severityCounts[s])
      .map((s) => `${severityCounts[s]} ${s}`)
      .join(', ') || 'none';

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await mailer.sendMail({
      from: `"Gradzest SOC" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: admins.map((a) => a.email).join(','),
      subject: `SOC Daily Digest — ${newIncidents.length} new incident${newIncidents.length === 1 ? '' : 's'}, ${openCount} open`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
          <div style="background:#0d1b4b;padding:24px;border-radius:8px 8px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:18px;">SOC Daily Digest</h1>
            <p style="color:#c7d2fe;margin:4px 0 0;font-size:13px;">Last 24 hours</p>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#555;">New incidents</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${newIncidents.length} (${severityLine})</td></tr>
              <tr><td style="padding:6px 0;color:#555;">Currently open/investigating</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${openCount}</td></tr>
              <tr><td style="padding:6px 0;color:#555;">Stale (14+ days, no activity)</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${staleCount}</td></tr>
              <tr><td style="padding:6px 0;color:#555;">Failed logins</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${failedLogins}</td></tr>
              <tr><td style="padding:6px 0;color:#555;">Account lockouts</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${lockouts}</td></tr>
            </table>
            <a href="${frontendUrl}/soc" style="display:inline-block;margin-top:20px;background:#0d1b4b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:13px;">Open SOC Dashboard</a>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error('[securityDigest] Failed:', err.message);
  }
}

function startSecurityDigest(mailer) {
  // 08:00 — ahead of the 09:00 deadline-reminder job so mailboxes don't get both at once.
  cron.schedule('0 8 * * *', () => {
    markStaleIncidents()
      .then(() => runSecurityDigest(mailer))
      .catch((err) => console.error('[securityDigest] error:', err.message));
  });
  console.log('[security-digest] Scheduled — runs daily at 08:00');
}

module.exports = { startSecurityDigest, runSecurityDigest, markStaleIncidents };
