// Express's last-resort error handler (mounted at the end of app.js): anything thrown or passed to next(err) in a route
// ends up here. A client error (4xx) gets its own message back; a server error gets a generic one, so internals never
// reach the browser, and is logged and reported with the route it came from (path only, never the query string).
const errorReporting = require('../lib/errorReporting');

module.exports = function errorHandler(err, req, res, next) {
  // Once the response has started there is nothing sensible to send; let Express close the connection.
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.path}`, err);
    errorReporting.captureError(err, { scope: 'express', method: req.method, path: req.path, status });
  }
  res.status(status).json({ message });
};
