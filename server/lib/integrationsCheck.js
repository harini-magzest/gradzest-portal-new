// Connectivity checks for the outside services the server talks to, for `npm run check:integrations`.
//
// Read-only by design: it never sends an email or a WhatsApp message, never writes to the database, never spends model
// tokens and never prints a key. The Settings -> Integrations page answers "is a key set?"; this answers "does it work?".
// Everything that touches the network is injected, so the tests run it with no credentials and no connection.
const net = require('net');

const TIMEOUT_MS = 8000;

// Values that must never appear in the output, even inside an error message from a library.
const SECRET_ENV = [
  'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'SMTP_PASS', 'WHATSAPP_TOKEN', 'SMARTFLO_API_TOKEN',
  'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'MONGODB_URI', 'JWT_SECRET', 'DATA_ENCRYPTION_KEY', 'FILE_URL_SECRET',
  'SOC_TELEGRAM_BOT_TOKEN', 'SOC_ALERT_WEBHOOK_URL',
];

/** Replaces every secret value found in `text`, so an error message from a library can never leak one. */
function redact(text, env = process.env) {
  let out = String(text ?? '');
  for (const key of SECRET_ENV) {
    const value = env[key];
    if (value && value.length >= 6) out = out.split(value).join('***');
  }
  return out;
}

// status: ok (works) | fail (set up but not working) | skipped (not configured) | configured (set; cannot be tested here)
const row = (name, status, detail) => ({ name, status, detail });

async function httpProbe(name, url, headers, { fetchImpl, env }) {
  try {
    const res = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return row(name, 'ok', `reachable and the key is accepted (HTTP ${res.status})`);
    if (res.status === 401 || res.status === 403) return row(name, 'fail', `the key was rejected (HTTP ${res.status})`);
    return row(name, 'fail', `unexpected answer (HTTP ${res.status})`);
  } catch (err) {
    const msg = err?.name === 'TimeoutError' ? `no answer within ${TIMEOUT_MS / 1000}s` : err?.message || 'request failed';
    return row(name, 'fail', redact(msg, env));
  }
}

/** Sends clamd's PING and waits for PONG. Resolves { ok, detail } and never throws. */
function clamdPing({ host, port, timeoutMs = TIMEOUT_MS, netImpl = net }) {
  return new Promise((resolve) => {
    let finished = false;
    let seen = '';
    const socket = netImpl.createConnection({ host, port });
    const done = (ok, detail) => {
      if (finished) return;
      finished = true;
      try { socket.destroy(); } catch { /* already closed */ }
      resolve({ ok, detail });
    };
    socket.setTimeout(timeoutMs, () => done(false, `no answer within ${Math.round(timeoutMs / 1000)}s`));
    socket.on('connect', () => socket.write('zPING\0'));
    socket.on('data', (chunk) => {
      seen += chunk.toString();
      if (seen.includes('PONG')) done(true, 'answered PONG');
    });
    socket.on('error', (err) => done(false, err.code || err.message || 'connection failed'));
  });
}

const smartfloStamp = (date) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`;
};

/**
 * @param {object} deps
 * @param {object}   [deps.env]            defaults to process.env
 * @param {Function} [deps.fetchImpl]      defaults to global fetch
 * @param {Function} [deps.pingDatabase]   async () => void, throws when the database cannot be reached
 * @param {Function} [deps.verifyMailer]   async ({ host, port, secure, user, pass }) => void, throws when sign-in fails
 * @param {Function} [deps.headBucket]     async ({ region, bucket }) => void, throws when the bucket is not reachable
 * @param {Function} [deps.pingClamd]      async ({ host, port }) => { ok, detail }
 * @param {Date}     [deps.now]
 * @returns {Promise<{ name: string, status: string, detail: string }[]>}
 */
async function runChecks(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const now = deps.now || new Date();
  const ctx = { fetchImpl, env };
  const results = [];
  const safe = async (name, fn) => {
    try { results.push(await fn()); } catch (err) { results.push(row(name, 'fail', redact(err?.message || 'check failed', env))); }
  };

  // Database
  await safe('Database', async () => {
    if (!env.MONGODB_URI) return row('Database', 'fail', 'MONGODB_URI is not set');
    if (!deps.pingDatabase) return row('Database', 'skipped', 'no database check was provided');
    await deps.pingDatabase();
    return row('Database', 'ok', 'connected and answered a ping');
  });

  // Zest AI: the model-listing endpoints cost nothing and send no prompt.
  if (env.ANTHROPIC_API_KEY) {
    results.push(await httpProbe('Zest AI (Anthropic)', 'https://api.anthropic.com/v1/models?limit=1',
      { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, ctx));
  } else {
    results.push(row('Zest AI (Anthropic)', 'skipped', 'ANTHROPIC_API_KEY is not set'));
  }
  if (env.GEMINI_API_KEY) {
    results.push(await httpProbe('Zest AI (Gemini fallback)', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
      { 'x-goog-api-key': env.GEMINI_API_KEY }, ctx));
  } else {
    results.push(row('Zest AI (Gemini fallback)', 'skipped', 'GEMINI_API_KEY is not set'));
  }

  // Email: verify() connects and signs in to the SMTP server; it does not send anything.
  await safe('Email (SMTP)', async () => {
    if (!(env.SMTP_USER && env.SMTP_PASS)) return row('Email (SMTP)', 'skipped', 'SMTP_USER / SMTP_PASS are not set');
    if (!deps.verifyMailer) return row('Email (SMTP)', 'configured', 'set; no mail check was provided');
    await deps.verifyMailer({
      host: env.SMTP_HOST || 'smtp.gmail.com', port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true', user: env.SMTP_USER, pass: env.SMTP_PASS,
    });
    return row('Email (SMTP)', 'ok', 'connected and signed in (nothing was sent)');
  });

  // WhatsApp: read the phone-number record, never the /messages endpoint.
  if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    results.push(await httpProbe('WhatsApp',
      `https://graph.facebook.com/v19.0/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}?fields=display_phone_number`,
      { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }, ctx));
  } else {
    results.push(row('WhatsApp', 'skipped', 'WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set'));
  }

  // Calls (Smartflo): the same call-records read the performance page makes, one row.
  if (env.SMARTFLO_API_TOKEN) {
    const base = (env.SMARTFLO_API_BASE || 'https://api-smartflo.tatateleservices.com/v1').replace(/\/+$/, '');
    const from = new Date(now.getTime() - 24 * 3600 * 1000);
    const qs = new URLSearchParams({ from_date: smartfloStamp(from), to_date: smartfloStamp(now), page: '1', limit: '1' });
    results.push(await httpProbe('Calls (Smartflo)', `${base}/call/records?${qs}`,
      { Authorization: env.SMARTFLO_API_TOKEN, Accept: 'application/json' }, ctx));
  } else {
    results.push(row('Calls (Smartflo)', 'skipped', 'SMARTFLO_API_TOKEN is not set'));
  }

  // File storage (S3): HeadBucket reads metadata only.
  await safe('File storage (S3)', async () => {
    if (!(env.AWS_REGION && env.AWS_S3_BUCKET)) return row('File storage (S3)', 'skipped', 'AWS_REGION / AWS_S3_BUCKET are not set (files stay on the server disk)');
    if (!deps.headBucket) return row('File storage (S3)', 'configured', 'set; no storage check was provided');
    await deps.headBucket({ region: env.AWS_REGION, bucket: env.AWS_S3_BUCKET });
    return row('File storage (S3)', 'ok', 'the bucket is reachable with the configured credentials');
  });

  // Virus scanning: uploads are refused (503) when clamd is down, so a failure here matters.
  await safe('Virus scanning (ClamAV)', async () => {
    const host = env.CLAMD_HOST || '127.0.0.1';
    const port = Number(env.CLAMD_PORT) || 3310;
    const ping = deps.pingClamd || ((target) => clamdPing(target));
    const r = await ping({ host, port });
    return r.ok
      ? row('Virus scanning (ClamAV)', 'ok', `clamd at ${host}:${port} ${r.detail}`)
      : row('Virus scanning (ClamAV)', 'fail', `clamd at ${host}:${port}: ${r.detail} (uploads are refused while it is down)`);
  });

  // Alert channels need a real incident to exercise, so only presence is reported. (There is no social sign-in:
  // the app signs in with email and password, and two-factor where a person has turned it on.)
  const presence = (name, keys) => {
    const missing = keys.filter((k) => !env[k]);
    return missing.length === keys.length
      ? row(name, 'skipped', `${keys.join(' / ')} not set`)
      : missing.length
        ? row(name, 'fail', `partly set: missing ${missing.join(', ')}`)
        : row(name, 'configured', 'set (needs a real sign-in or alert to exercise)');
  };
  results.push(presence('SOC alert webhook', ['SOC_ALERT_WEBHOOK_URL']));
  results.push(presence('SOC Telegram alerts', ['SOC_TELEGRAM_BOT_TOKEN', 'SOC_TELEGRAM_CHAT_ID']));

  return results;
}

/** True when anything that is set up is not working. A service that is simply not configured is not a failure. */
const hasFailures = (results) => results.some((r) => r.status === 'fail');

module.exports = { runChecks, hasFailures, redact, clamdPing, TIMEOUT_MS };
