const User = require('../models/User');
const Notification = require('../models/Notification');

// Lead alerts go to the Admin Team only. Application Team members are also role 'admin',
// so they are excluded explicitly. Change this filter to widen or narrow the audience.
const RECIPIENT_FILTER = { role: 'admin', isAppTeam: { $ne: true } };

const SOURCE_LABELS = { self_signup: 'email' };

// Saves one Notification per admin (so offline admins see it later), pushes it live to any of
// their open sessions, and emails each admin (so it's seen even if no one is logged in at all).
// Never throws: an alert failure must not break sign-up.
async function notifyAdminsOfNewLead(app, student, assignedCounselor = null) {
  try {
    const admins = await User.find(RECIPIENT_FILTER).select('_id email');
    if (!admins.length) return;

    const email = student.email && !student.email.endsWith('@social.gradzest') ? student.email : '';
    const contact = [email, student.phone].filter(Boolean).join(' · ');
    const via = SOURCE_LABELS[student.source] || 'the website';
    const unverified = student.emailVerified ? '' : ' Email not verified yet.';
    const followUp = assignedCounselor
      ? ` Auto-assigned to ${assignedCounselor.name}.`
      : ' Assign a counselor to follow up.';

    const title = `🎯 New Lead: ${student.name}`;
    const message = `${student.name}${contact ? ` (${contact})` : ''} just created an account via ${via}.${unverified}${followUp}`;
    const link = assignedCounselor ? '/admin/students' : '/admin/students?lead=new';

    const saved = await Notification.insertMany(
      admins.map(a => ({ userId: a._id, type: 'lead', priority: 'normal', title, message, link }))
    );

    const io = app.get('io');
    const userSockets = app.get('userSockets');
    if (io && userSockets) {
      for (const n of saved) {
        const sids = userSockets.get(String(n.userId));
        if (sids) sids.forEach(sid => io.to(sid).emit('admin:new_lead', {
          notificationId: String(n._id), priority: n.priority, title, message, link,
        }));
      }
    }

    const mailer = app.get('mailer');
    if (mailer) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const studentsUrl = `${frontendUrl}${link}`;
      const rows = [
        ['Name', student.name],
        ['Email', email || '—'],
        ['Phone', student.phone || '—'],
        ['Signed up via', via],
        ['Email verified', student.emailVerified ? 'Yes' : 'No'],
        ...(assignedCounselor ? [['Assigned counselor', assignedCounselor.name]] : []),
      ].map(([k, v]) => `
        <tr>
          <td style="padding:8px 12px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">${k}</td>
          <td style="padding:8px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6;">${v}</td>
        </tr>`).join('');

      admins.forEach(a => {
        if (!a.email) return;
        mailer.sendMail({
          from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: a.email,
          subject: `🎯 New Lead: ${student.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
              <div style="background:#0d1b4b;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
                <p style="color:#a5b4fc;margin:6px 0 0;font-size:13px;">New Lead Alert</p>
              </div>
              <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                <p style="font-size:15px;">${assignedCounselor ? `A new student just created an account and has been auto-assigned to ${assignedCounselor.name}.` : 'A new student just created an account and needs a counselor assigned.'}</p>
                <table style="width:100%;border-collapse:collapse;margin:20px 0;">${rows}</table>
                <div style="text-align:center;margin:28px 0;">
                  <a href="${studentsUrl}" style="background:#0d1b4b;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">${assignedCounselor ? 'View Student' : 'View New Leads'}</a>
                </div>
                <p style="font-size:13px;color:#6b7280;">You're receiving this because you're an admin on Gradzest.</p>
              </div>
            </div>`,
        }).catch(err => console.error('[notifyAdminsOfNewLead] email failed:', err.message));
      });
    }
  } catch (err) {
    console.error('[notifyAdminsOfNewLead]', err.message);
  }
}

module.exports = notifyAdminsOfNewLead;
