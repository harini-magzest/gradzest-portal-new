// Covers the two operational switches added for running more than one API instance: RUN_JOBS (which instance runs the
// scheduled jobs) and the request-log buffer (one batched Mongo write instead of one write per request).
const { jobsEnabled } = require('../lib/runJobs');
const { createRequestLogBuffer } = require('../lib/requestLogBuffer');

describe('jobsEnabled (RUN_JOBS)', () => {
  it('is on when RUN_JOBS is unset or empty, so a single instance behaves as before', () => {
    expect(jobsEnabled({})).toBe(true);
    expect(jobsEnabled({ RUN_JOBS: '' })).toBe(true);
  });

  it.each(['false', 'FALSE', ' False ', '0', 'off', 'no'])('is off for %j', (value) => {
    expect(jobsEnabled({ RUN_JOBS: value })).toBe(false);
  });

  it.each(['true', '1', 'on', 'yes'])('stays on for %j', (value) => {
    expect(jobsEnabled({ RUN_JOBS: value })).toBe(true);
  });
});

describe('createRequestLogBuffer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const row = (n) => ({ path: `/api/x/${n}`, status: 200 });

  it('writes the rows collected within the window as one batch, in order', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const buffer = createRequestLogBuffer({ write, flushMs: 2000 });

    buffer.add(row(1)); buffer.add(row(2)); buffer.add(row(3));
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith([row(1), row(2), row(3)]);
    expect(buffer.size()).toBe(0);
  });

  it('writes early once maxBatch rows are waiting', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const buffer = createRequestLogBuffer({ write, flushMs: 60000, maxBatch: 3 });

    buffer.add(row(1)); buffer.add(row(2));
    expect(write).not.toHaveBeenCalled();
    buffer.add(row(3));
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledWith([row(1), row(2), row(3)]);
  });

  it('writes every row at once when flushMs is 0', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const buffer = createRequestLogBuffer({ write, flushMs: 0 });

    buffer.add(row(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledWith([row(1)]);
  });

  it('flush() writes what is waiting now and resolves after the write finished', async () => {
    let finished = false;
    const write = vi.fn(async () => { await new Promise((r) => setTimeout(r, 50)); finished = true; });
    const buffer = createRequestLogBuffer({ write, flushMs: 60000 });

    buffer.add(row(1));
    const done = buffer.flush();
    await vi.advanceTimersByTimeAsync(50);
    await done;
    expect(finished).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('reports a failed write and keeps working: the next batch is still written', async () => {
    const onError = vi.fn();
    const write = vi.fn().mockRejectedValueOnce(new Error('mongo down')).mockResolvedValue(undefined);
    const buffer = createRequestLogBuffer({ write, flushMs: 1000, onError });

    buffer.add(row(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(1);

    buffer.add(row(2));
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenLastCalledWith([row(2)]);
  });

  it('caps memory while the database is unreachable by dropping the oldest rows', () => {
    const buffer = createRequestLogBuffer({ write: vi.fn(), flushMs: 60000, maxBatch: 1000, maxBuffered: 3 });
    for (let i = 1; i <= 10; i++) buffer.add(row(i));
    expect(buffer.size()).toBe(3);
  });

  it('does not write anything when there is nothing to flush', async () => {
    const write = vi.fn();
    const buffer = createRequestLogBuffer({ write, flushMs: 1000 });
    await buffer.flush();
    expect(write).not.toHaveBeenCalled();
  });
});

describe('requestLogger with real Mongo', () => {
  const { EventEmitter } = require('events');
  const RequestLog = require('../models/RequestLog');
  const requestLogger = require('../middleware/requestLogger');

  // Runs one request through the middleware and fires the response's 'finish' event, like Express does.
  function run({ status, ip, ua = 'jest-agent', path = '/api/probe' }) {
    const res = new EventEmitter();
    res.statusCode = status;
    const req = { method: 'GET', originalUrl: path, ip, headers: { 'user-agent': ua }, app: { get: () => null } };
    requestLogger(req, res, () => {});
    res.emit('finish');
  }

  // The write is not awaited by the middleware, so wait for it to land rather than guess how long it takes: a fixed
  // sleep passed alone and failed when the whole suite loaded the machine.
  async function until(check, ms = 3000) {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value || Date.now() > end) return value;
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('stores batched rows with ip and userAgent encrypted at rest, and reads them back as plaintext', async () => {
    run({ status: 200, ip: '203.0.113.77', ua: 'batched-agent' });
    await requestLogger.flushRequestLogs();

    const raw = await until(() => RequestLog.collection.findOne({ path: '/api/probe', status: 200 }));
    expect(raw).toBeTruthy();
    expect(raw.ip).not.toBe('203.0.113.77');
    expect(raw.userAgent).not.toBe('batched-agent');

    const viaModel = await RequestLog.find({ ip: '203.0.113.77' }).lean(); // the filter is encrypted too
    expect(viaModel).toHaveLength(1);
    expect(viaModel[0]).toMatchObject({ ip: '203.0.113.77', userAgent: 'batched-agent', status: 200 });
  });

  it('still writes a 401 on the spot, because the suspicious-IP rule counts those rows in Mongo', async () => {
    run({ status: 401, ip: '203.0.113.78', path: '/api/auth/login' });
    const filter = { ip: '203.0.113.78', status: 401 };
    await until(async () => (await RequestLog.countDocuments(filter)) > 0);
    expect(await RequestLog.countDocuments(filter)).toBe(1);
  });
});
