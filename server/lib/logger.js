// Structured (JSON) logging for the API, built on pino.
//
// The code base logs through console.* in about 150 places. Rather than touch every file, installConsoleBridge() replaces
// the console methods with ones that write one JSON line per call (level, time, message, and the stack when an Error was
// passed), so a log platform can search and alert on them. It is on by default in production and off otherwise, so local
// output and the tests are unchanged. New code can use `logger` directly.
//
//   LOG_FORMAT=json|text   force it on or off (default: json when NODE_ENV=production)
//   LOG_LEVEL=info         pino level (default: info; silent under NODE_ENV=test)
const pino = require('pino');
const util = require('util');

// Values that must never reach a log line, wherever they appear in a logged object.
const REDACT_PATHS = [
  'req.headers.authorization', 'req.headers.cookie',
  '*.password', '*.newPassword', '*.currentPassword', '*.token', '*.accessToken', '*.refreshToken', '*.secret', '*.otp',
];

function createLogger({ level, destination } = {}) {
  return pino({
    level: level || process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    base: { service: 'gradzest-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  }, destination);
}

const logger = createLogger();

const LEVEL_FOR_METHOD = { log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug' };
let structured = false;

// Replaces the console methods on `target`. Returns a function that puts the originals back.
function installConsoleBridge(log = logger, target = console) {
  const originals = {};
  for (const [method, level] of Object.entries(LEVEL_FOR_METHOD)) {
    originals[method] = target[method];
    target[method] = (...args) => {
      const err = args.find((a) => a instanceof Error);
      const message = util.format(...args.map((a) => (a instanceof Error ? a.message : a)));
      if (err) log[level]({ err }, message);
      else log[level](message);
    };
  }
  structured = true;
  return function uninstall() {
    for (const [method, original] of Object.entries(originals)) target[method] = original;
    structured = false;
  };
}

function installConsoleBridgeFromEnv(env = process.env, target = console) {
  const format = String(env.LOG_FORMAT || '').trim().toLowerCase();
  const on = format ? format === 'json' : env.NODE_ENV === 'production';
  if (!on) return false;
  installConsoleBridge(logger, target);
  return true;
}

// True once console output is JSON. logError uses it to attach the stack to the log line only when it can be read as data.
const isStructured = () => structured;

module.exports = { logger, createLogger, installConsoleBridge, installConsoleBridgeFromEnv, isStructured, REDACT_PATHS };
