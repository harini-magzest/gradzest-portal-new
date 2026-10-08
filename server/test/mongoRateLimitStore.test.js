const mongoose = require('mongoose');
const { MongoRateLimitStore } = require('../lib/mongoRateLimitStore');

function newStore() {
  const store = new MongoRateLimitStore(`test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  store.init({ windowMs: 60000 });
  return store;
}

describe('MongoRateLimitStore', () => {
  it('counts hits while the database is connected', async () => {
    expect(mongoose.connection.readyState).toBe(1); // the test setup connects an in-memory database
    const store = newStore();
    expect((await store.increment('k')).totalHits).toBe(1);
    expect((await store.increment('k')).totalHits).toBe(2);
    expect((await store.get('k')).totalHits).toBe(2);
    await store.decrement('k');
    expect((await store.get('k')).totalHits).toBe(1);
    await store.resetKey('k');
    expect(await store.get('k')).toBeUndefined();
  });

  it('lets requests through uncounted, and never throws, before the database connection exists', async () => {
    // The first seconds after boot: the limiter used to read .collection of undefined and answer every request with a 500.
    const store = newStore();
    store.ready = () => false;
    store.collection = () => { throw new Error('must not touch the database before it is connected'); };

    const hit = await store.increment('k');
    expect(hit.totalHits).toBe(1);
    expect(hit.resetTime.getTime()).toBeGreaterThan(Date.now());
    expect(await store.get('k')).toBeUndefined();
    await expect(store.decrement('k')).resolves.toBeUndefined();
    await expect(store.resetKey('k')).resolves.toBeUndefined();
    await expect(store.resetAll()).resolves.toBeUndefined();
  });

  it('reports not ready while the connection is down, and ready again once it is back', () => {
    const store = newStore();
    // readyState lives on the connection's prototype; shadow it on the instance for the duration of the check.
    Object.defineProperty(mongoose.connection, 'readyState', { get: () => 0, configurable: true });
    try {
      expect(store.ready()).toBe(false);
    } finally {
      delete mongoose.connection.readyState;
    }
    expect(store.ready()).toBe(true);
  });
});
