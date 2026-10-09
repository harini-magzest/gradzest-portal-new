const RequestLog = require('../models/RequestLog');
const { checkSuspiciousIpRule } = require('../lib/detectIncidents');
const { redactUrl } = require('../lib/redactUrl');

// Response codes worth an immediate live ping to admins, on top of the
// persisted row every request gets. Everything else is Mongo-only and
// browsed via the paginated SOC "investigate" endpoints — streaming every
// request would flood the live feed under normal traffic.
const ALERTABLE_STATUSES = [401, 403, 429];

module.exports = function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;

    RequestLog.create({
      method: req.method,
      path: redactUrl(req.originalUrl), // never store a token or link signature sent in the query string
      status: res.statusCode,
      latencyMs: Math.round(latencyMs),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      userId: req.user?.id || null,
      role: req.user?.role || '',
    }).then((entry) => {
      if (ALERTABLE_STATUSES.includes(res.statusCode)) {
        req.app.get('io')?.to('admin-room').emit('security_request_alert', {
          method: req.method, path: redactUrl(req.originalUrl), status: res.statusCode, ip: req.ip, at: new Date(),
        });
        checkSuspiciousIpRule(entry, req.app.get('io')).catch((err) => console.error('[detectIncidents] Failed:', err.message));
      }
    }).catch((err) => console.error('[requestLogger] Failed:', err.message));
  });

  next();
};
