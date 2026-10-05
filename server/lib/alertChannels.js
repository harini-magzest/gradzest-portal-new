// Out-of-band alerts for security incidents: a chat webhook (Slack / Microsoft Teams / Discord) and Telegram. These
// reach the owner's phone even when the SOC isn't open, which matters because the SOC has exactly one owner.
//
// PRIVACY: these messages travel through third-party services, so by default they are MINIMAL — severity, incident
// type, time and a link to the SOC, and nothing identifying (no email, IP, name or file name). Set SOC_ALERT_DETAIL=full
// to include the incident title. Alerts fail soft: a broken webhook never affects the application.
//
//   SOC_ALERT_WEBHOOK_URL         https URL of an incoming webhook (optional)
//   SOC_ALERT_WEBHOOK_FORMAT      slack (default, {text}) | teams ({text}) | discord ({content})
//   SOC_TELEGRAM_BOT_TOKEN + SOC_TELEGRAM_CHAT_ID   Telegram bot alerts (optional)
//   SOC_WEBHOOK_MIN_SEVERITY      lowest severity sent to these channels (default "high")
//   SOC_ALERT_DETAIL              minimal (default) | full

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

const detailMode = () => (process.env.SOC_ALERT_DETAIL === 'full' ? 'full' : 'minimal');
const minSeverity = () => (SEVERITY_RANK[process.env.SOC_WEBHOOK_MIN_SEVERITY] !== undefined ? process.env.SOC_WEBHOOK_MIN_SEVERITY : 'high');
const meetsMin = (severity) => (SEVERITY_RANK[severity] ?? 0) >= SEVERITY_RANK[minSeverity()];
const socUrl = () => `${process.env.FRONTEND_URL || 'http://localhost:5173'}/soc`;

function webhookUrl() {
  const u = process.env.SOC_ALERT_WEBHOOK_URL;
  if (!u) return null;
  try { return new URL(u).protocol === 'https:' ? u : null; } catch { return null; } // https only: never send over plaintext
}
const telegramConfigured = () => !!(process.env.SOC_TELEGRAM_BOT_TOKEN && process.env.SOC_TELEGRAM_CHAT_ID);

// What an alert says. `kind`: 'new' | 'escalation' | 'test'.
function formatAlert(incident, kind = 'new') {
  if (kind === 'test') return `✅ Gradzest SOC test alert — your alert channel works. ${socUrl()}`;
  const sev = String(incident.severity || '').toUpperCase();
  const type = String(incident.type || 'incident').replace(/_/g, ' ');
  const when = new Date(incident.createdAt || Date.now()).toLocaleString('en-IN', { hour12: false });
  const lead = kind === 'escalation' ? `⏰ UNACKNOWLEDGED ${sev}` : `🚨 ${sev}`;
  const title = detailMode() === 'full' && incident.title ? `: ${incident.title}` : '';
  return `${lead} SOC incident (${type})${title} · ${when} — open the SOC: ${socUrl()}`;
}

async function postJson(url, body, fetchImpl) {
  const attempt = () => fetchImpl(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
  let res = await attempt();
  if (res.status >= 500) res = await attempt(); // one retry on a server error
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function sendWebhook(text, fetchImpl) {
  const url = webhookUrl();
  if (!url) return { configured: false };
  try {
    const body = process.env.SOC_ALERT_WEBHOOK_FORMAT === 'discord' ? { content: text } : { text };
    await postJson(url, body, fetchImpl);
    return { configured: true, ok: true };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

async function sendTelegram(text, fetchImpl) {
  if (!telegramConfigured()) return { configured: false };
  try {
    await postJson(`https://api.telegram.org/bot${process.env.SOC_TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: process.env.SOC_TELEGRAM_CHAT_ID, text, disable_web_page_preview: true,
    }, fetchImpl);
    return { configured: true, ok: true };
  } catch (err) {
    // The token is part of the URL; never put it in an error that could be logged.
    return { configured: true, ok: false, error: String(err.message).replace(process.env.SOC_TELEGRAM_BOT_TOKEN, '***') };
  }
}

/**
 * Sends one alert to every configured out-of-band channel. Never throws.
 * @returns {{ webhook: object, telegram: object, skipped?: string }}
 */
async function notifyChannels(incident, { kind = 'new', fetchImpl = globalThis.fetch, force = false } = {}) {
  if (!force && !meetsMin(incident.severity)) return { webhook: { configured: false }, telegram: { configured: false }, skipped: 'below minimum severity' };
  const text = formatAlert(incident, kind);
  const [webhook, telegram] = await Promise.all([sendWebhook(text, fetchImpl), sendTelegram(text, fetchImpl)]);
  return { webhook, telegram };
}

// Which channels exist — never the secrets themselves.
const channelStatus = () => ({
  webhook: { configured: !!webhookUrl(), format: process.env.SOC_ALERT_WEBHOOK_FORMAT === 'discord' ? 'discord' : (process.env.SOC_ALERT_WEBHOOK_FORMAT === 'teams' ? 'teams' : 'slack') },
  telegram: { configured: telegramConfigured() },
  detail: detailMode(),
  minSeverity: minSeverity(),
});

module.exports = { notifyChannels, formatAlert, channelStatus, detailMode, meetsMin, SEVERITY_RANK };
