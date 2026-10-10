// Collects the per-request log rows and writes them with one insertMany every couple of seconds, instead of one Mongo
// write per API request. Rows that feed live detection (401/403/429) do not go through here: see middleware/requestLogger.js.
//
// flushMs <= 0 writes every row straight away (used by the tests, so a row is there as soon as the request ends).
// If Mongo is unreachable the buffer is capped and the oldest rows are dropped, the same outcome as the old one-write-
// per-request code, which logged the failure and moved on, but without letting memory grow while the database is down.
const DEFAULT_FLUSH_MS = 2000;
const MAX_BATCH = 200;      // write early once this many rows are waiting
const MAX_BUFFERED = 5000;  // hard cap on rows held in memory

function createRequestLogBuffer({
  write,
  flushMs = DEFAULT_FLUSH_MS,
  maxBatch = MAX_BATCH,
  maxBuffered = MAX_BUFFERED,
  onError = () => {},
}) {
  let rows = [];
  let timer = null;
  let pending = Promise.resolve(); // writes run one after another, so flush() can wait for the ones already started

  function writeBatch(batch) {
    pending = pending.then(() => write(batch)).catch(onError);
    return pending;
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (rows.length) writeBatch(rows.splice(0));
    return pending;
  }

  function add(row) {
    if (flushMs <= 0) { writeBatch([row]); return; }
    rows.push(row);
    if (rows.length > maxBuffered) rows.splice(0, rows.length - maxBuffered);
    if (rows.length >= maxBatch) flush();
    else if (!timer) {
      timer = setTimeout(flush, flushMs);
      timer.unref?.(); // a waiting flush must never keep the process alive
    }
  }

  return { add, flush, size: () => rows.length };
}

module.exports = { createRequestLogBuffer, DEFAULT_FLUSH_MS, MAX_BATCH, MAX_BUFFERED };
