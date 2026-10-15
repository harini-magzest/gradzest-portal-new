// Emails the SOC OWNER(S) immediately when a critical-severity incident is created (and, via sendEscalationEmail, when
// a high/critical incident sits unacknowledged past its SLA) — closes the "what if nobody has the dashboard open" gap.
// Uses the same nodemailer transport configured in server/app.js, so it inherits the same real-or-not status: if
// SMTP_PASS isn't set, sending fails gracefully and logs, exactly like every other email in this app.
//
// Recipients are the SOC owners only (lib/socRecipients.js), not every admin. The body is minimal by default —
// severity, type, time and a link — because email transits third-party servers; SOC_ALERT_DETAIL=full adds the title.

const { socOwnerUsers } = require('./socRecipients');
const { detailMode } = require('./alertChannels');

let _mailer = null;

function initCriticalAlert(mailer) {
  _mailer = mailer;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function buildMail(incident, kind) {
  const full = detailMode() === 'full';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const sev = String(incident.severity || '').toUpperCase();
  const type = String(incident.type || 'incident').replace(/_/g, ' ');
  const when = new Date(incident.createdAt || Date.now()).toLocaleString('en-IN', { hour12: false });
  const heading = kind === 'escalation' ? 'Unacknowledged Security Incident' : `${sev === 'CRITICAL' ? 'Critical' : sev[0] + sev.slice(1).toLowerCase()} Security Incident`;
  const subject = kind === 'escalation'
    ? `[UNACKNOWLEDGED ${sev}] SOC incident needs attention`
    : `[${sev}] ${full ? incident.title : 'SOC incident'}`;
  const details = full
    ? `<p style="font-size:16px;font-weight:bold;margin:0 0 8px;">${esc(incident.title)}</p>
       ${incident.relatedIp ? `<p style="font-size:14px;color:#555;margin:4px 0;">IP: ${esc(incident.relatedIp)}</p>` : ''}
       ${incident.relatedEmail ? `<p style="font-size:14px;color:#555;margin:4px 0;">Related: ${esc(incident.relatedEmail)}</p>` : ''}`
    : '<p style="font-size:14px;color:#555;margin:0 0 8px;">Details are only shown inside the SOC.</p>';
  const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
          <div style="background:#7f1d1d;padding:24px;border-radius:8px 8px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:18px;">${heading}</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            ${details}
            <p style="font-size:14px;color:#555;margin:4px 0;">Type: ${esc(type)} &middot; Severity: ${esc(incident.severity)} &middot; ${esc(when)}</p>
            <a href="${frontendUrl}/soc" style="display:inline-block;margin-top:16px;background:#7f1d1d;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Open the SOC</a>
          </div>
        </div>`;
  return { subject, html };
}

async function sendMail(incident, kind) {
  if (!_mailer) return;
  try {
    const owners = await socOwnerUsers();
    if (owners.length === 0) return;
    const { subject, html } = buildMail(incident, kind);
    await _mailer.sendMail({
      from: `"Gradzest SOC" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: owners.map((a) => a.email).join(','),
      subject,
      html,
    });
  } catch (err) {
    console.error('[criticalAlert] Failed to send:', err.message);
  }
}

const sendCriticalIncidentAlert = (incident) => sendMail(incident, 'new');
const sendEscalationEmail = (incident) => sendMail(incident, 'escalation');

module.exports = { initCriticalAlert, sendCriticalIncidentAlert, sendEscalationEmail };
