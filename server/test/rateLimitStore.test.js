const { MongoRateLimitStore } = require('../lib/mongoRateLimitStore');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('MongoDB rate-limit store', () => {
  it('counts hits across separate store instances, so every server sees the same count', async () => {
    const a = new MongoRateLimitStore('test-shared');
    const b = new MongoRateLimitStore('test-shared');
    a.init({ windowMs: 60000 });
    b.init({ windowMs: 60000 });
    await a.increment('ip-1');
    await b.increment('ip-1');
    const seen = await a.increment('ip-1');
    expect(seen.totalHits).toBe(3);
    expect((await b.get('ip-1')).totalHits).toBe(3);
  });

  it('keeps limiters apart: the same key under a different prefix starts at zero', async () => {
    const login = new MongoRateLimitStore('test-login');
    const general = new MongoRateLimitStore('test-general');
    login.init({ windowMs: 60000 });
    general.init({ windowMs: 60000 });
    await login.increment('ip-2');
    expect(await general.get('ip-2')).toBeUndefined();
  });

  it('starts a fresh window once the old one has expired', async () => {
    const s = new MongoRateLimitStore('test-window');
    s.init({ windowMs: 100 });
    await s.increment('ip-3');
    await s.increment('ip-3');
    await wait(150);
    const after = await s.increment('ip-3');
    expect(after.totalHits).toBe(1);
  });

  it('resetKey clears one client without touching others', async () => {
    const s = new MongoRateLimitStore('test-reset');
    s.init({ windowMs: 60000 });
    await s.increment('ip-4');
    await s.increment('ip-5');
    await s.resetKey('ip-4');
    expect(await s.get('ip-4')).toBeUndefined();
    expect((await s.get('ip-5')).totalHits).toBe(1);
  });
});
