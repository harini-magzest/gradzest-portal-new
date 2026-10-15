// Structured logging and error tracking. The console bridge turns the app's console.* calls into JSON lines; error
// reporting is off unless SENTRY_DSN is set, and when it is on it must send exceptions and stacks only, with personal
// data masked. The last group runs the real Sentry SDK against a local server and reads the envelope it actually sends.
const http = require('http');
const { Writable } = require('stream');
const {
  createLogger, installConsoleBridge, installConsoleBridgeFromEnv, isStructured,
} = require('../lib/logger');
const errorReporting = require('../lib/errorReporting');
const errorHandler = require('../middleware/errorHandler');
const { logError } = require('../lib/logError');

// A pino destination that keeps the lines it is given.
function memoryStream() {
  const lines = [];
  const stream = new Writable({ write(chunk, _enc, cb) { lines.push(...String(chunk).split('\n').filter(Boolean)); cb(); } });
  return { stream, records: () => lines.map((l) => JSON.parse(l)) };
}

function fakeConsole() {
  const target = {};
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) target[m] = () => 'original';
  return target;
}

describe('logger', () => {
  it('writes one JSON line with a readable level, an ISO time and the service name', () => {
    const mem = memoryStream();
    createLogger({ level: 'info', destination: mem.stream }).info({ studentCount: 3 }, 'digest sent');
    const [rec] = mem.records();
    expect(rec).toMatchObject({ level: 'info', msg: 'digest sent', service: 'gradzest-api', studentCount: 3 });
    expect(new Date(rec.time).toISOString()).toBe(rec.time);
  });

  it('redacts passwords, tokens and auth headers wherever they appear', () => {
    const mem = memoryStream();
    createLogger({ level: 'info', destination: mem.stream }).info({
      body: { email: 'a@b.co', password: 'hunter2', token: 'abc' },
      req: { headers: { authorization: 'Bearer secret', cookie: 'rt=1', accept: 'json' } },
    }, 'request');
    const text = JSON.stringify(mem.records()[0]);
    expect(text).not.toMatch(/hunter2|Bearer secret|rt=1|"abc"/);
    expect(text).toContain('[redacted]');
    expect(text).toContain('"accept":"json"');
  });

  it('is silent under NODE_ENV=test unless a level is asked for', () => {
    expect(createLogger({ destination: memoryStream().stream }).level).toBe('silent');
  });
});

describe('console bridge', () => {
  it('maps console methods to levels and formats the message like console does', () => {
    const mem = memoryStream();
    const target = fakeConsole();
    const uninstall = installConsoleBridge(createLogger({ level: 'debug', destination: mem.stream }), target);

    target.log('sent %d emails to %s', 3, 'admins');
    target.warn('slow query');
    target.error('[students] failed');
    target.debug('detail');
    uninstall();

    expect(mem.records().map((r) => [r.level, r.msg])).toEqual([
      ['info', 'sent 3 emails to admins'], ['warn', 'slow query'], ['error', '[students] failed'], ['debug', 'detail'],
    ]);
  });

  it('keeps the stack of an Error argument as data instead of flattening it', () => {
    const mem = memoryStream();
    const target = fakeConsole();
    const uninstall = installConsoleBridge(createLogger({ level: 'info', destination: mem.stream }), target);
    target.error('[error] GET /api/x', new Error('boom'));
    uninstall();

    const [rec] = mem.records();
    expect(rec.level).toBe('error');
    expect(rec.msg).toBe('[error] GET /api/x boom');
    expect(rec.err).toMatchObject({ type: 'Error', message: 'boom' });
    expect(rec.err.stack).toContain('logging.test.js');
  });

  it('puts the original console back, and reports whether it is on', () => {
    const target = fakeConsole();
    const originalLog = target.log;
    const uninstall = installConsoleBridge(createLogger({ level: 'info', destination: memoryStream().stream }), target);
    expect(isStructured()).toBe(true);
    expect(target.log).not.toBe(originalLog);
    uninstall();
    expect(target.log).toBe(originalLog);
    expect(isStructured()).toBe(false);
  });

  it('is on by default only in production, and LOG_FORMAT overrides either way', () => {
    const cases = [
      [{ NODE_ENV: 'production' }, true],
      [{ NODE_ENV: 'development' }, false],
      [{}, false],
      [{ NODE_ENV: 'production', LOG_FORMAT: 'text' }, false],
      [{ NODE_ENV: 'development', LOG_FORMAT: 'json' }, true],
    ];
    for (const [env, expected] of cases) {
      const target = fakeConsole();
      const original = target.error;
      expect(installConsoleBridgeFromEnv(env, target)).toBe(expected);
      expect(target.error === original).toBe(!expected);
    }
    // installConsoleBridgeFromEnv switched the module flag on for the cases that were true; reset it
    installConsoleBridge(createLogger({ destination: memoryStream().stream }), fakeConsole())();
  });
});

describe('error reporting is off without a DSN', () => {
  it('does nothing and never throws', async () => {
    expect(errorReporting.initErrorReporting({ env: {} })).toBe(false);
    expect(errorReporting.isEnabled()).toBe(false);
    expect(() => errorReporting.captureError(new Error('x'), { scope: 's' })).not.toThrow();
    await expect(errorReporting.flushErrorReporting(10)).resolves.toBe(true);
  });
});

describe('scrubEvent', () => {
  it('drops the request, user and breadcrumbs and masks e-mails and long numbers in exception text', () => {
    const event = errorReporting.scrubEvent({
      request: { url: 'https://x/api/students?email=a@b.co', headers: { authorization: 'Bearer t' }, data: { password: 'p' } },
      user: { id: 'u1', email: 'a@b.co', ip_address: '1.2.3.4' },
      breadcrumbs: [{ message: 'student asha@example.com' }],
      server_name: 'prod-host-1',
      message: 'Failed for asha@example.com',
      exception: { values: [{ type: 'MongoServerError', value: 'E11000 duplicate key { email: "asha@example.com", phone: "9876543210" }' }] },
      tags: { scope: 'students' },
    });
    const text = JSON.stringify(event);
    expect(event.request).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(text).not.toMatch(/asha@example\.com|9876543210|Bearer|1\.2\.3\.4/);
    expect(text).toContain('[email]');
    expect(text).toContain('[number]');
    expect(event.tags).toEqual({ scope: 'students' });
  });

  it('does not mangle ordinary text or short numbers', () => {
    const event = errorReporting.scrubEvent({ exception: { values: [{ value: 'Cannot read properties of undefined (reading id) at line 42' }] } });
    expect(event.exception.values[0].value).toBe('Cannot read properties of undefined (reading id) at line 42');
  });
});

describe('initErrorReporting with an injected SDK', () => {
  afterEach(async () => { await errorReporting.closeErrorReporting(10); });

  it('starts the SDK lean: no integrations, no tracing, no default PII, and our scrubber', () => {
    const init = vi.fn();
    const sdk = { init, withScope: vi.fn(), captureException: vi.fn(), flush: vi.fn(), close: vi.fn() };
    const ok = errorReporting.initErrorReporting({ env: { SENTRY_DSN: 'https://k@o.ingest.sentry.io/1', NODE_ENV: 'production' }, sdk });

    expect(ok).toBe(true);
    const options = init.mock.calls[0][0];
    expect(options).toMatchObject({
      dsn: 'https://k@o.ingest.sentry.io/1', environment: 'production', sendDefaultPii: false,
      defaultIntegrations: false, integrations: [], skipOpenTelemetrySetup: true, maxBreadcrumbs: 0,
    });
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.beforeSend).toBe(errorReporting.scrubEvent);
  });

  it('turns a failure to start into "off", not a crash', () => {
    const sdk = { init: () => { throw new Error('bad dsn'); } };
    expect(errorReporting.initErrorReporting({ env: { SENTRY_DSN: 'nonsense' }, sdk })).toBe(false);
    expect(errorReporting.isEnabled()).toBe(false);
  });

  it('captures with tags, wraps a non-Error, and survives an SDK that throws', () => {
    const tags = {};
    const captured = [];
    const sdk = {
      init: () => {},
      withScope: (fn) => fn({ setTag: (k, v) => { tags[k] = v; } }),
      captureException: (e) => captured.push(e),
      flush: async () => true, close: async () => true,
    };
    errorReporting.initErrorReporting({ env: { SENTRY_DSN: 'https://k@o.ingest.sentry.io/1' }, sdk });

    errorReporting.captureError(new Error('real'), { scope: 'students', status: 500, skipped: undefined });
    errorReporting.captureError('just a string', { scope: 'x' });
    expect(captured[0].message).toBe('real');
    expect(captured[1]).toBeInstanceOf(Error);
    expect(tags).toMatchObject({ scope: 'x', status: '500' });
    expect('skipped' in tags).toBe(false);

    sdk.captureException = () => { throw new Error('sdk down'); };
    expect(() => errorReporting.captureError(new Error('y'))).not.toThrow();
  });
});

describe('errorHandler and logError', () => {
  const res = () => {
    const r = { headersSent: false, statusCode: null, body: null };
    r.status = (s) => { r.statusCode = s; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  };
  let capture;
  beforeEach(() => { capture = vi.spyOn(errorReporting, 'captureError').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('answers a 4xx with its own message and does not report it', () => {
    const r = res();
    const err = Object.assign(new Error('Invalid id'), { status: 400 });
    errorHandler(err, { method: 'GET', path: '/api/x' }, r, () => {});
    expect(r.statusCode).toBe(400);
    expect(r.body).toEqual({ message: 'Invalid id' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('answers a 5xx with a generic message, and reports it with route tags but no query string', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = res();
    const err = new Error('connect ECONNREFUSED 10.0.0.5:27017');
    errorHandler(err, { method: 'POST', path: '/api/students', originalUrl: '/api/students?email=a@b.co' }, r, () => {});
    expect(r.statusCode).toBe(500);
    expect(r.body).toEqual({ message: 'Internal server error' });
    expect(capture).toHaveBeenCalledWith(err, { scope: 'express', method: 'POST', path: '/api/students', status: 500 });
  });

  it('hands over to Express when the response has already started', () => {
    const r = res();
    r.headersSent = true;
    const next = vi.fn();
    const err = new Error('late');
    errorHandler(err, { method: 'GET', path: '/x' }, r, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(r.statusCode).toBeNull();
  });

  it('logError prints the message as before and reports the error with its scope', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('save failed');
    logError('students', err);
    expect(spy).toHaveBeenCalledWith('[students]', 'save failed');
    expect(capture).toHaveBeenCalledWith(err, { scope: 'students' });
  });
});

// ---- the real Sentry SDK against a local server ------------------------------------------------------------------
describe('the real Sentry SDK', () => {
  let server; let port; const envelopes = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        envelopes.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString('utf8') });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });
  afterAll(async () => {
    await errorReporting.closeErrorReporting(500);
    await new Promise((r) => server.close(r));
  });

  it('sends the exception and stack with tags, and nothing personal', async () => {
    expect(errorReporting.initErrorReporting({
      env: { SENTRY_DSN: `http://publickey@127.0.0.1:${port}/1`, NODE_ENV: 'production', SENTRY_RELEASE: 'abc1234' },
    })).toBe(true);

    errorReporting.captureError(
      new Error('E11000 duplicate key { email: "asha@example.com", phone: "9876543210" }'),
      { scope: 'students', method: 'POST', path: '/api/students', status: 500 },
    );
    await errorReporting.flushErrorReporting(3000);

    const sent = envelopes.find((e) => e.url.includes('/api/1/envelope'));
    expect(sent, 'an envelope reached the local server').toBeTruthy();
    expect(sent.method).toBe('POST');

    // An envelope is newline-delimited JSON: header, then item header + payload pairs.
    const parts = sent.body.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const event = parts.find((p) => p && p.exception);
    expect(event, 'an error event is in the envelope').toBeTruthy();

    const text = sent.body;
    expect(text).not.toMatch(/asha@example\.com|9876543210/);
    expect(event.exception.values[0].value).toContain('[email]');
    expect(event.exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);
    expect(event.tags).toMatchObject({ scope: 'students', method: 'POST', path: '/api/students', status: '500' });
    expect(event.environment).toBe('production');
    expect(event.release).toBe('abc1234');
    expect(event.request).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
  });
});
