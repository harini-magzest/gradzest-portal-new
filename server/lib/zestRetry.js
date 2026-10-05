// Free-tier and shared model endpoints return transient "high demand" (503), rate (429) and 5xx errors
// that clear within seconds. Retrying with a short, jittered backoff turns most of them into a slightly
// slower answer instead of "Zest could not answer right now". Anything else (bad key, bad request) is
// not retried — repeating it would only waste quota.

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

function statusOf(err) {
  return err?.status ?? err?.code ?? err?.response?.status ?? err?.error?.code ?? null;
}

function isTransient(err) {
  const status = Number(statusOf(err));
  if (TRANSIENT_STATUS.has(status)) return true;
  const msg = String(err?.message || err || '');
  return /unavailable|overloaded|high demand|rate.?limit|timed? ?out|econnreset|etimedout|socket hang up|fetch failed/i.test(msg);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Runs `fn(attempt)` until it succeeds, retrying transient failures.
 * @param {(attempt: number) => Promise<any>} fn
 * @param {{ tries?: number, baseMs?: number, sleepFn?: (ms: number) => Promise<void>, onRetry?: (err: Error, attempt: number) => void }} [opts]
 */
async function withRetry(fn, { tries = 3, baseMs = Number(process.env.ZEST_RETRY_BASE_MS ?? 700), sleepFn = sleep, onRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === tries || !isTransient(err)) throw err;
      onRetry?.(err, attempt);
      await sleepFn(baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
    }
  }
  throw lastErr;
}

module.exports = { withRetry, isTransient };
