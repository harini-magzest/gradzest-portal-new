// Error tracking (Sentry). Off unless SENTRY_DSN is set, and every function here is safe to call when it is off: a
// reporter must never be the reason a request fails.
//
// Deliberately lean, because this API handles student records:
//   * no automatic integrations at all (so no console breadcrumbs, request bodies, cookies, headers or user objects),
//   * no tracing and no OpenTelemetry setup,
//   * events carry the exception, its stack and a few tags (scope, method, path, status) and nothing else,
//   * scrubEvent() additionally masks e-mail addresses and long digit runs in exception text, because driver errors such as
//     a duplicate-key failure quote the offending value.
//
//   SENTRY_DSN          the project's DSN; unset = reporting off
//   SENTRY_ENVIRONMENT  defaults to NODE_ENV
//   SENTRY_RELEASE      e.g. the git commit
let sentry = null; // the SDK once initialised, else null

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONG_NUMBER = /\d[\d\s().-]{6,}\d/g; // phone numbers, ids, card-like runs

function scrubText(text) {
  return typeof text === 'string' ? text.replace(EMAIL, '[email]').replace(LONG_NUMBER, '[number]') : text;
}

// Runs on every event just before it leaves the process.
function scrubEvent(event) {
  delete event.request;      // URL, query string, headers, cookies, body
  delete event.user;         // id, email, ip
  delete event.breadcrumbs;
  delete event.server_name;  // the host's name
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values || []) ex.value = scrubText(ex.value);
  return event;
}

function initErrorReporting({ env = process.env, sdk } = {}) {
  if (sentry) return true;
  const dsn = String(env.SENTRY_DSN || '').trim();
  if (!dsn) return false;
  try {
    const client = sdk || require('@sentry/node');
    client.init({
      dsn,
      environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || 'development',
      release: env.SENTRY_RELEASE || undefined,
      sendDefaultPii: false,
      defaultIntegrations: false,
      integrations: [],
      skipOpenTelemetrySetup: true,
      maxBreadcrumbs: 0,
      beforeSend: scrubEvent,
    });
    sentry = client;
    return true;
  } catch (err) {
    console.error('[errorReporting] Could not start error reporting, continuing without it:', err.message);
    return false;
  }
}

const isEnabled = () => !!sentry;

// `context` becomes tags: keep it to short, non-personal values (scope, method, path without query, status).
function captureError(err, context = {}) {
  if (!sentry) return;
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined && value !== null) scope.setTag(key, String(value).slice(0, 200));
      }
      sentry.captureException(error);
    });
  } catch { /* reporting must never throw into the caller */ }
}

// Waits (up to timeoutMs) for queued events to be sent; used before a deliberate exit.
async function flushErrorReporting(timeoutMs = 2000) {
  if (!sentry) return true;
  try { return await sentry.flush(timeoutMs); } catch { return false; }
}

// Flushes and switches reporting off again (tests, or a clean shutdown).
async function closeErrorReporting(timeoutMs = 2000) {
  if (!sentry) return;
  const client = sentry;
  sentry = null;
  try { await client.close(timeoutMs); } catch { /* shutting down */ }
}

module.exports = {
  initErrorReporting, captureError, flushErrorReporting, closeErrorReporting, isEnabled, scrubEvent, scrubText,
};
