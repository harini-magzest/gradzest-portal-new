// Emails whoever is listed in ZEST_ALERT_EMAILS when Zest's AI fails (the Anthropic or Gemini API
// erroring, timing out or rejecting the key), so a broken assistant doesn't go unnoticed. Same nodemailer transport as the rest of the app (wired in
// app.js); if SMTP isn't configured the send just fails and logs.
//
// One email per kind of failure per ZEST_ALERT_COOLDOWN_MIN (default 30) — an outage that hits
// every question shouldn't send one email per question. The body never includes the question
// itself: it can contain student details, and email passes through third-party servers.

let _mailer = null;
const lastSent = new Map(); // kind -> timestamp

function initZestAlert(mailer) {
  _mailer = mailer;
}

const recipients = () => (process.env.ZEST_ALERT_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
const cooldownMs = () => (Number(process.env.ZEST_ALERT_COOLDOWN_MIN) || 30) * 60000;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FIX_HINT = 'Check the server log around this time, and that the API key in server/.env is valid and has credit.';

/**
 * @param {{ kind: string, message: string }} failure
 * @param {{ route?: string, role?: string }} [context]
 * @returns {Promise<boolean>} whether an email was sent
 */
async function notifyZestFailure(failure, context = {}) {
  const kind = failure.kind || 'error';
  console.error(`[zest] ${kind}: ${failure.message}`);
  const to = recipients();
  if (!_mailer || !to.length) return false;
  const now = Date.now();
  if (now - (lastSent.get(kind) || 0) < cooldownMs()) return false;
  lastSent.set(kind, now);

  const provider = require('./zestModel').providerName();
  const model = (provider === 'gemini' ? process.env.GEMINI_MODEL : process.env.ZEST_MODEL) || '(default)';
  const when = new Date(now).toLocaleString('en-IN', { hour12: false });
  const hint = FIX_HINT;
  try {
    await _mailer.sendMail({
      from: `"Gradzest Zest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: to.join(','),
      subject: `[Zest] AI assistant error: ${kind.replace(/_/g, ' ')}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
          <div style="background:#0d1b4b;padding:20px 24px;border-radius:8px 8px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:18px;">Zest stopped and fell back</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <p style="font-size:14px;margin:0 0 12px;">Zest's AI failed, so users are getting knowledge-base results (or an "unavailable" message) instead of AI answers.</p>
            <p style="font-size:14px;margin:4px 0;"><b>Error:</b> ${esc(failure.message)}</p>
            <p style="font-size:13px;color:#555;margin:4px 0;">Provider: ${esc(provider)} · Model: ${esc(model)} · ${esc(when)}</p>
            ${context.route ? `<p style="font-size:13px;color:#555;margin:4px 0;">Where: ${esc(context.route)}${context.role ? ` (asked by a ${esc(context.role)})` : ''}</p>` : ''}
            ${hint ? `<p style="font-size:14px;margin:16px 0 0;"><b>How to fix:</b> ${esc(hint)}</p>` : ''}
            <p style="font-size:12px;color:#888;margin:16px 0 0;">You'll get at most one email per kind of error every ${Math.round(cooldownMs() / 60000)} minutes.</p>
          </div>
        </div>`,
    });
    return true;
  } catch (err) {
    console.error('[zestAlert] Failed to send:', err.message);
    return false;
  }
}

// Tests reset the cooldown between cases
const _resetZestAlertCooldown = () => lastSent.clear();

module.exports = { initZestAlert, notifyZestFailure, _resetZestAlertCooldown };
