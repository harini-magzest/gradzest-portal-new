// Emails every admin immediately when a critical-severity incident is
// created — closes the "what if nobody has the dashboard open" gap. Uses
// the same nodemailer transport already configured in server/app.js, so it
// inherits the same real-or-not status: if SMTP_PASS isn't set, sending
// fails gracefully and logs, exactly like every other email in this app —
// it doesn't pretend to deliver something it can't.

let _mailer = null;

function initCriticalAlert(mailer) {
  _mailer = mailer;
}

async function sendCriticalIncidentAlert(incident) {
  if (!_mailer) return;
  try {
    const User = require('../models/User');
    const admins = await User.find({ role: 'admin' }).select('email').lean();
    if (admins.length === 0) return;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await _mailer.sendMail({
      from: `"Gradzest SOC" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: admins.map((a) => a.email).join(','),
      subject: `[CRITICAL] ${incident.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
          <div style="background:#7f1d1d;padding:24px;border-radius:8px 8px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:18px;">Critical Security Incident</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <p style="font-size:16px;font-weight:bold;margin:0 0 8px;">${incident.title}</p>
            <p style="font-size:14px;color:#555;margin:4px 0;">Type: ${incident.type} &middot; Severity: ${incident.severity}</p>
            ${incident.relatedIp ? `<p style="font-size:14px;color:#555;margin:4px 0;">IP: ${incident.relatedIp}</p>` : ''}
            ${incident.relatedEmail ? `<p style="font-size:14px;color:#555;margin:4px 0;">Related: ${incident.relatedEmail}</p>` : ''}
            <a href="${frontendUrl}/soc" style="display:inline-block;margin-top:16px;background:#7f1d1d;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">View in SOC Dashboard</a>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error('[criticalAlert] Failed to send:', err.message);
  }
}

module.exports = { initCriticalAlert, sendCriticalIncidentAlert };
