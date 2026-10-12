// lib/zestGuestCap.js: one daily cap shared by every signed-out visitor, kept in the database, with a SOC incident at 80%.
const request = require('supertest');
const { app } = require('../app');
const Counter = require('../models/Counter');
const SecurityIncident = require('../models/SecurityIncident');
const { takeGuestQuestion, dailyLimit, FRIENDLY_MESSAGE, DEFAULT_LIMIT } = require('../lib/zestGuestCap');

const before = process.env.GUEST_ZEST_DAILY_LIMIT;
afterEach(() => { if (before === undefined) delete process.env.GUEST_ZEST_DAILY_LIMIT; else process.env.GUEST_ZEST_DAILY_LIMIT = before; });

// Each test counts on its own day, far from today, so counters never mix
const day = (n) => Date.UTC(2031, 0, n, 12);

describe('takeGuestQuestion', () => {
  it('allows the day\'s limit, refuses the next question, and keeps the count in the database', async () => {
    process.env.GUEST_ZEST_DAILY_LIMIT = '5';
    const results = [];
    for (let i = 0; i < 6; i += 1) results.push((await takeGuestQuestion({ now: day(1) })).allowed);
    expect(results).toEqual([true, true, true, true, true, false]);
    // a restarted server reads the same count
    expect((await Counter.findById('zest-guest:2031-01-01').lean()).value).toBe(6);
  });

  it('starts again the next day', async () => {
    process.env.GUEST_ZEST_DAILY_LIMIT = '1';
    expect((await takeGuestQuestion({ now: day(2) })).allowed).toBe(true);
    expect((await takeGuestQuestion({ now: day(2) })).allowed).toBe(false);
    expect((await takeGuestQuestion({ now: day(3) })).allowed).toBe(true);
  });

  it('raises one SOC incident when the count reaches 80% of the limit', async () => {
    process.env.GUEST_ZEST_DAILY_LIMIT = '10';
    // only this test's alerts (the alert is not awaited, so earlier tests' alerts may still be landing). Titles are
    // encrypted at rest, so they are matched after the model decrypts them, not in the query.
    const mine = async () => (await SecurityIncident.find({ type: 'ai_usage' })).filter((i) => /of today's limit of 10 /.test(i.title));
    const alerts = async () => (await mine()).length;
    for (let i = 0; i < 7; i += 1) await takeGuestQuestion({ now: day(4) });
    expect(await alerts()).toBe(0);
    await takeGuestQuestion({ now: day(4) }); // the 8th: 80% of 10
    await vi.waitFor(async () => expect(await alerts()).toBe(1));
    for (let i = 0; i < 4; i += 1) await takeGuestQuestion({ now: day(4) });
    expect(await alerts()).toBe(1);
    expect((await mine())[0].severity).toBe('medium');
  });

  it('0 turns guest questions off; an unset or invalid value means the default', async () => {
    process.env.GUEST_ZEST_DAILY_LIMIT = '0';
    expect((await takeGuestQuestion({ now: day(5) })).allowed).toBe(false);
    delete process.env.GUEST_ZEST_DAILY_LIMIT;
    expect(dailyLimit()).toBe(DEFAULT_LIMIT);
    process.env.GUEST_ZEST_DAILY_LIMIT = 'lots';
    expect(dailyLimit()).toBe(DEFAULT_LIMIT);
  });
});

describe('POST /api/zest/public/ask-stream', () => {
  it('answers a friendly 429 once today\'s limit is used up', async () => {
    process.env.GUEST_ZEST_DAILY_LIMIT = '0';
    const res = await request(app).post('/api/zest/public/ask-stream').send({ question: 'Which countries do you help with?' });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ message: FRIENDLY_MESSAGE, code: 'GUEST_DAILY_LIMIT' });
  });

  it('does not count a request without a question', async () => {
    process.env.GUEST_ZEST_DAILY_LIMIT = '3';
    const key = `zest-guest:${new Date().toISOString().slice(0, 10)}`;
    const count = async () => (await Counter.findById(key).lean())?.value || 0;
    const start = await count();
    expect((await request(app).post('/api/zest/public/ask-stream').send({ question: '   ' })).status).toBe(400);
    expect(await count()).toBe(start);
  });
});
