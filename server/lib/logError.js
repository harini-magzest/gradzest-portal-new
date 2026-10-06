// Route catch blocks return a generic 500 to the client, so without this the real cause is lost.
function logError(scope, err) {
  console.error(`[${scope}]`, err?.message || err);
}

module.exports = { logError };
