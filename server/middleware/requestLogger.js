const RequestLog = require('../models/RequestLog');
const { checkSuspiciousIpRule } = require('../lib/detectIncidents');
const { createRequestLogBuffer, DEFAULT_FLUSH_MS } = require('../lib/requestLogBuffer');
const { redactUrl } = require('../lib/redactUrl');

// Response codes worth an immediate live ping to admins, on top of the
// persisted row every request gets. Everything else is Mongo-only and
// browsed via the paginated SOC "investigate" endpoints — streaming every
// request would flood the live feed under normal traffic.
const ALERTABLE_STATUSES = [401, 403, 429];

// Every other row is batched into one insertMany every REQUEST_LOG_FLUSH_MS (default 2s; 0 = write each row at once)
// rather than one Mongo write per request. The alertable rows above are still written one by one, straight away: the
// suspicious-IP rule counts them in Mongo the moment they happen, so they must already be there.
const flushMs = process.env.NODE_ENV === 'test' ? 0 : Number(process.env.REQUEST_LOG_FLUSH_MS ?? DEFAULT_FLUSH_MS);
const buffer = createRequestLogBuffer({
  write: (rows) => RequestLog.insertMany(rows, { ordered: false }),
  flushMs: Number.isFinite(flushMs) ? flushMs : DEFAULT_FLUSH_MS,
  onError: (err) => console.error('[requestLogger] Failed:', err.message),
});

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;

    const row = {
      method: req.method,
      path: redactUrl(req.originalUrl), // never store a token or link signature sent in the query string
      status: res.statusCode,
      latencyMs: Math.round(latencyMs),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      userId: req.user?.id || null,
      role: req.user?.role || '',
    };

    if (!ALERTABLE_STATUSES.includes(res.statusCode)) { buffer.add(row); return; }

    RequestLog.create(row).then((entry) => {
      req.app.get('io')?.to('admin-room').emit('security_request_alert', {
        method: req.method, path: row.path, status: res.statusCode, ip: req.ip, at: new Date(),
      });
      checkSuspiciousIpRule(entry, req.app.get('io')).catch((err) => console.error('[detectIncidents] Failed:', err.message));
    }).catch((err) => console.error('[requestLogger] Failed:', err.message));
  });

  next();
}

module.exports = requestLogger;
// Writes whatever is still waiting; db.js calls it on SIGINT/SIGTERM before it closes the connection.
module.exports.flushRequestLogs = () => buffer.flush();
