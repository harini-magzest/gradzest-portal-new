// Live health of the two services the SOC relies on but that run outside this process: the virus scanner (clamd) and
// outgoing email (SMTP). The dashboard used to report these from configuration ("SMTP_PASS is set" = email on) and
// hand-typed text, so a scanner that was not installed still read as "real and verified". These checks ask the service.
//
// Read-only: clamd gets a PING, SMTP gets nodemailer's verify() (connect + sign in, nothing is sent). Results are cached
// for a minute and concurrent callers share one check, so the Overview's auto-refresh doesn't hammer either service.
const { clamdPing, redact } = require('./integrationsCheck');

const CACHE_MS = 60 * 1000;
const PROBE_TIMEOUT_MS = 5000;

// Probes are swappable so tests never reach a real clamd or a real SMTP server. Under NODE_ENV=test the defaults report
// "unchecked" instead of probing: a developer's real SMTP credentials are in server/.env and would otherwise be used.
const isTest = () => process.env.NODE_ENV === 'test';
const defaultProbes = {
  clamd: () => (isTest()
    ? Promise.resolve({ ok: null, detail: 'not checked in tests' })
    : clamdPing({ host: process.env.CLAMD_HOST || '127.0.0.1', port: Number(process.env.CLAMD_PORT) || 3310, timeoutMs: PROBE_TIMEOUT_MS })),
  smtp: async (mailer) => {
    if (isTest()) return { ok: null, detail: 'not checked in tests' };
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer within ${PROBE_TIMEOUT_MS / 1000}s`)), PROBE_TIMEOUT_MS); });
    try {
      await Promise.race([mailer.verify(), timeout]);
      return { ok: true, detail: 'connected and signed in' };
    } catch (err) {
      return { ok: false, detail: redact(err?.message || 'sign-in failed') };
    } finally {
      clearTimeout(timer);
    }
  },
};
let probes = defaultProbes;

let cache = null;
let cacheAt = 0;
let inflight = null;

function scannerStatus(ping) {
  if (ping.ok === null) return { status: 'unchecked', detail: ping.detail };
  return ping.ok
    ? { status: 'ok', detail: `clamd ${ping.detail}` }
    : { status: 'down', detail: `clamd is not reachable (${ping.detail}). Uploads are refused until it is running.` };
}

async function emailStatus(mailer) {
  if (!mailer || !(process.env.SMTP_USER && process.env.SMTP_PASS)) {
    return { status: 'off', detail: 'SMTP_USER / SMTP_PASS are not set, so no email is sent' };
  }
  const v = await probes.smtp(mailer);
  if (v.ok === null) return { status: 'unchecked', detail: v.detail };
  return v.ok ? { status: 'ok', detail: v.detail } : { status: 'failing', detail: `SMTP sign-in failed: ${v.detail}` };
}

// The last email the app tried to send, from the EmailLog (written for every email to a student). Shows whether the
// server actually accepted mail recently, which the sign-in check alone cannot.
async function lastEmailSend() {
  try {
    const EmailLog = require('../models/EmailLog');
    const [last, lastFailed] = await Promise.all([
      EmailLog.findOne({}).sort({ createdAt: -1 }).select('status error createdAt').lean(),
      EmailLog.findOne({ status: 'failed' }).sort({ createdAt: -1 }).select('error createdAt').lean(),
    ]);
    return {
      lastAt: last?.createdAt || null,
      lastStatus: last?.status || null,
      lastError: last?.status === 'failed' ? redact(last.error || '').slice(0, 300) : '',
      lastFailedAt: lastFailed?.createdAt || null,
    };
  } catch {
    return { lastAt: null, lastStatus: null, lastError: '', lastFailedAt: null };
  }
}

async function check(app) {
  const mailer = app?.get?.('mailer');
  const [ping, email, sends] = await Promise.all([probes.clamd(), emailStatus(mailer), lastEmailSend()]);
  cache = { checkedAt: new Date().toISOString(), scanner: scannerStatus(ping), email: { ...email, ...sends } };
  cacheAt = Date.now();
  return cache;
}

/** { checkedAt, scanner: { status: ok|down|unchecked, detail }, email: { status: ok|failing|off|unchecked, detail, lastAt, lastStatus, lastError, lastFailedAt } } */
async function getServiceHealth(app, { refresh = false } = {}) {
  if (!refresh && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  if (!inflight) inflight = check(app).finally(() => { inflight = null; });
  return inflight;
}

/** Tests only: replace the probes (and clear the cache). Call with no argument to restore the defaults. */
function setProbesForTest(next) {
  probes = next ? { ...defaultProbes, ...next } : defaultProbes;
  cache = null; cacheAt = 0;
}

module.exports = { getServiceHealth, setProbesForTest };
