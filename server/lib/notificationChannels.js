// Who wants a reminder by which channel. Every user has `notificationPrefs` ({ email, whatsapp }): email is on unless
// the person turned it off, WhatsApp is off until they opt in (and only works with a phone number on file and the
// WhatsApp channel configured, see lib/whatsapp.js). The in-app notification is always created.

const { isWhatsAppConfigured, sendWhatsApp } = require('./whatsapp');

const wantsEmail = (user) => user?.notificationPrefs?.email !== false;
const wantsWhatsApp = (user) => user?.notificationPrefs?.whatsapp === true && !!user?.phone;

// Sends `text` to the user's WhatsApp if they opted in. Never throws and never blocks the caller's other channels.
async function sendExtraChannels(user, text, send = sendWhatsApp) {
  if (!wantsWhatsApp(user) || !isWhatsAppConfigured()) return { whatsapp: false };
  try {
    const r = await send(user.phone, text);
    return { whatsapp: !!r?.sent };
  } catch {
    return { whatsapp: false };
  }
}

// Where a person turns these emails off: the profile page that holds the toggle (components/NotificationPreferences).
// Admins have no such page, and someone who is only an address (an external meeting guest) has no account, so they get
// no link rather than a dead one. Signed out? The app sends them to the sign-in page and back.
const PREFERENCES_PAGE = { student: '/student/profile', counselor: '/counselor/profile' };

function preferencesUrl(role, base = process.env.FRONTEND_URL) {
  const page = PREFERENCES_PAGE[role];
  const origin = String(base || '').trim().replace(/\/+$/, '');
  return page && /^https?:\/\//i.test(origin) ? `${origin}${page}` : null;
}

// Adds "Manage email notifications" to a reminder email. Pass whichever of `html` / `text` the email has; the result
// has the same keys, so it can be spread into the mail options. Only emails the toggle actually controls should use it:
// password resets, verification and sign-in codes must reach the person whatever they chose.
function withPreferencesFooter({ html, text }, role, base) {
  const url = preferencesUrl(role, base);
  const out = {};
  if (html !== undefined) {
    out.html = url
      ? `${html}<p style="font-family:Arial,sans-serif;max-width:600px;margin:12px auto 0;font-size:12px;color:#6b7280;text-align:center;">`
        + `You get this email because reminders are switched on in your notification settings. `
        + `<a href="${url.replace(/"/g, '&quot;')}" style="color:#6b7280;">Manage email notifications</a>.</p>`
      : html;
  }
  if (text !== undefined) {
    out.text = url
      ? `${text}\n\n--\nYou get this email because reminders are switched on in your notification settings.\nManage email notifications: ${url}`
      : text;
  }
  return out;
}

// The same, for a whole nodemailer options object: `mailer.sendMail(withReminderFooter({ to, subject, html }, role))`.
function withReminderFooter(options, role, base) {
  return { ...options, ...withPreferencesFooter({ html: options.html, text: options.text }, role, base) };
}

module.exports = { wantsEmail, wantsWhatsApp, sendExtraChannels, preferencesUrl, withPreferencesFooter, withReminderFooter };
