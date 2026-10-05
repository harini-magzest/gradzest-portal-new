// Optional WhatsApp channel for reminders, through Meta's WhatsApp Business Cloud API. Off unless configured.
//
//   WHATSAPP_TOKEN            permanent access token of the WhatsApp Business app
//   WHATSAPP_PHONE_NUMBER_ID  id of the sending number
//   WHATSAPP_TEMPLATE_NAME    approved message template whose body is a single {{1}} variable. WhatsApp only allows a
//                             business to start a conversation with a template; leave unset to send plain text, which
//                             works only inside the 24 hours after the person last wrote to you.
//   WHATSAPP_TEMPLATE_LANG    template language code (default en)
//   WHATSAPP_DEFAULT_COUNTRY_CODE  calling code added to numbers saved without one (default 91)
//
// Sending fails soft: a WhatsApp outage must never stop the email or in-app reminder.

const GRAPH = 'https://graph.facebook.com/v19.0';

const isWhatsAppConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

// Digits only, with the country code. Accepts "+91 98765 43210", "09876543210" and "9876543210".
function toWhatsAppNumber(phone, defaultCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91') {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? digits : null;
  if (raw.startsWith('00')) digits = digits.slice(2);
  else digits = digits.replace(/^0+/, '');
  if (digits.length <= 10) digits = `${defaultCode}${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

async function sendWhatsApp(phone, text, fetchImpl = fetch) {
  if (!isWhatsAppConfigured()) return { sent: false, reason: 'not_configured' };
  const to = toWhatsAppNumber(phone);
  if (!to) return { sent: false, reason: 'bad_number' };

  const template = process.env.WHATSAPP_TEMPLATE_NAME;
  const body = template
    ? { messaging_product: 'whatsapp', to, type: 'template', template: {
        name: template, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
        // Template variables cannot contain newlines or long runs of spaces.
        components: [{ type: 'body', parameters: [{ type: 'text', text: String(text).replace(/\s+/g, ' ').trim().slice(0, 1000) }] }],
      } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: String(text).slice(0, 4000) } };

  try {
    const res = await fetchImpl(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { sent: false, reason: `http_${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}

module.exports = { isWhatsAppConfigured, toWhatsAppNumber, sendWhatsApp };
