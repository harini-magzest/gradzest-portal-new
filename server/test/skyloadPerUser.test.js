const jwt = require('jsonwebtoken');
const { skyload } = require('../middleware/skyload');
const { clientKey, isAssetRequest, userIdFromToken } = require('../lib/clientKey');
const { tryAcquire, release } = require('../lib/skyload/connectionThrottle');
const { getScore } = require('../lib/skyload/riskRegistry');

const browser = { 'user-agent': 'Mozilla/5.0', 'accept-language': 'en', accept: '*/*' };
const tokenFor = (id) => jwt.sign({ id, role: 'counselor' }, process.env.JWT_SECRET, { expiresIn: '15m' });

// A request through the real middleware. Returns { status, finish } where status is set only if it was rejected.
function hit(ip, path, { token, method = 'GET' } = {}) {
  const listeners = {};
  const out = { status: null };
  const req = { ip, method, originalUrl: path, url: path, path, headers: { ...browser, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
  const res = {
    on: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    status(code) { out.status = code; return this; },
    json() { return this; },
  };
  let passed = false;
  skyload(req, res, () => { passed = true; });
  out.passed = passed;
  out.finish = () => (listeners.finish || []).forEach((fn) => fn());
  return out;
}

describe('clientKey', () => {
  it('uses the user for a valid token and the IP otherwise', () => {
    expect(clientKey({ ip: '1.1.1.1', headers: { authorization: `Bearer ${tokenFor('u1')}` } })).toBe('user:u1');
    expect(clientKey({ ip: '1.1.1.1', headers: {} })).toBe('1.1.1.1');
  });

  it('never trusts a forged, expired or tampered token', () => {
    const forged = jwt.sign({ id: 'u1' }, 'not-the-real-secret');
    const expired = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET, { expiresIn: -10 });
    for (const t of [forged, expired, 'garbage', `${tokenFor('u1')}x`]) {
      expect(clientKey({ ip: '2.2.2.2', headers: { authorization: `Bearer ${t}` } })).toBe('2.2.2.2');
    }
    expect(userIdFromToken({ headers: {} })).toBeNull();
  });

  it('recognises only logo and favicon image GETs as assets', () => {
    expect(isAssetRequest({ method: 'GET', originalUrl: '/api/unilogo/abc' })).toBe(true);
    expect(isAssetRequest({ method: 'GET', originalUrl: '/api/favicon/ubc.ca?x=1' })).toBe(true);
    expect(isAssetRequest({ method: 'POST', originalUrl: '/api/unilogo/abc' })).toBe(false);
    expect(isAssetRequest({ method: 'GET', originalUrl: '/api/universities' })).toBe(false);
    expect(isAssetRequest({ method: 'GET', originalUrl: '/api/unilogos' })).toBe(false); // lookalike
  });
});

describe('connection throttle explicit limit', () => {
  it('lets a pool use its own cap instead of the reputation-based one', () => {
    const key = 'assets:test-pool';
    let n = 0;
    for (let i = 0; i < 50; i++) if (tryAcquire(key, 40)) n++;
    expect(n).toBe(40);
    for (let i = 0; i < n; i++) release(key);
  });
});

// Requests that complete quickly are what trip the velocity rule (an in-flight pile-up trips the concurrency cap instead),
// so the helper below fires requests that finish straight away, like a real dashboard load on a fast server.
function burst(ip, n, opts) {
  for (let i = 0; i < n; i++) hit(ip, `/api/data/${i}`, opts).finish();
}

describe('Skyload accounts per signed-in user, not per shared IP', () => {
  it('a busy dashboard load never flags the user or the shared office IP, and colleagues are unaffected', () => {
    const ip = '203.0.113.50'; // one office, one public IP
    burst(ip, 60, { token: tokenFor('alice') }); // 60 quick requests, far over the 20-in-5s anonymous velocity rule

    expect(getScore('user:alice')).toBe(0); // a signed-in user's page load is not bot behaviour
    expect(getScore(ip)).toBe(0);

    // Alice keeps the full concurrency allowance of 15, and so does a colleague on the same IP
    const alice = [];
    for (let i = 0; i < 15; i++) alice.push(hit(ip, `/api/data/${i}`, { token: tokenFor('alice') }));
    const bob = [];
    for (let i = 0; i < 15; i++) bob.push(hit(ip, `/api/data/${i}`, { token: tokenFor('bob') }));
    expect(alice.every((r) => r.status === null)).toBe(true);
    expect(bob.every((r) => r.status === null)).toBe(true);

    // ...but the cap itself still holds: a 16th at once is refused
    expect(hit(ip, '/api/data/x', { token: tokenFor('alice') }).status).toBe(429);
    alice.forEach((r) => r.finish());
    bob.forEach((r) => r.finish());
  });

  it('anonymous traffic is still counted per IP', () => {
    const ip = '203.0.113.51';
    burst(ip, 25, {});
    expect(getScore(ip)).toBeGreaterThanOrEqual(5);
  });

  it('a forged token does not escape the per-IP limits', () => {
    const ip = '203.0.113.52';
    burst(ip, 25, { token: jwt.sign({ id: 'admin' }, 'wrong-secret') });
    expect(getScore(ip)).toBeGreaterThanOrEqual(5);
    expect(getScore('user:admin')).toBe(0);
  });
});

describe('Skyload and university logo images', () => {
  it('a page full of logos never flags the user or uses up the data-call budget', () => {
    const ip = '203.0.113.60';
    const token = tokenFor('carol');
    const images = [];
    for (let i = 0; i < 35; i++) images.push(hit(ip, `/api/unilogo/uni${i}`, { token })); // 35 logos at once, over both limits
    expect(images.every((r) => r.status === null)).toBe(true); // all served: the image pool is 40 deep
    expect(getScore('user:carol')).toBe(0); // images are never bot-scored
    const data = hit(ip, '/api/students', { token });
    expect(data.status).toBeNull(); // data calls still have their full budget
    images.forEach((r) => r.finish());
    data.finish();
  });

  it('the image pool is still bounded', () => {
    const ip = '203.0.113.61';
    const reqs = [];
    for (let i = 0; i < 45; i++) reqs.push(hit(ip, `/api/favicon/site${i}.com`));
    expect(reqs.filter((r) => r.status === 429)).toHaveLength(5);
    reqs.forEach((r) => r.finish());
  });
});
