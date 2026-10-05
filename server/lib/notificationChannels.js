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

module.exports = { wantsEmail, wantsWhatsApp, sendExtraChannels };
