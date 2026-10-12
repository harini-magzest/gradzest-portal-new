// Route catch blocks return a generic 500 to the client, so without this the real cause is lost.
// The message goes to the console as before; the error itself (stack included) also goes to the structured log when that
// is on, and to error tracking when it is configured.
const errorReporting = require('./errorReporting');
const { logger, isStructured } = require('./logger');

function logError(scope, err) {
  if (isStructured()) logger.error({ err, scope }, err?.message || String(err));
  else console.error(`[${scope}]`, err?.message || err);
  errorReporting.captureError(err, { scope });
}

module.exports = { logError };
