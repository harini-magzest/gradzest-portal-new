const { scoreRequest } = require('../lib/skyload/botDetection');
const { tryAcquire, release } = require('../lib/skyload/connectionThrottle');
const { bump, getScore } = require('../lib/skyload/riskRegistry');

describe('Skyload — bot detection scoring', () => {
  it('scores a normal browser-like request as low/zero', () => {
    const req = {
      ip: '198.51.100.10',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept-language': 'en-US',
        'accept': 'text/html',
      },
    };
    const { score } = scoreRequest(req);
    expect(score).toBeLessThan(4); // below BOT_FLAG_THRESHOLD in server/middleware/skyload.js
  });

  it('scores a request with no headers at all higher than a normal one', () => {
    const req = { ip: '198.51.100.11', headers: {} };
    const { score, reasons } = scoreRequest(req);
    expect(score).toBeGreaterThan(0);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('flags sustained high-velocity requests from one IP', () => {
    const ip = '198.51.100.12';
    let last;
    for (let i = 0; i < 25; i++) {
      last = scoreRequest({ ip, headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'en', accept: 'text/html' } });
    }
    expect(last.score).toBeGreaterThanOrEqual(5); // velocity signal alone is weighted at 5
    expect(last.reasons.some((r) => r.includes('requests in'))).toBe(true);
  });
});

describe('Skyload — connection throttle', () => {
  it('caps concurrent acquisitions at the configured limit and releases correctly', () => {
    const ip = '198.51.100.20';
    let acquired = 0;
    for (let i = 0; i < 20; i++) {
      if (tryAcquire(ip)) acquired++;
    }
    expect(acquired).toBe(15); // NORMAL_LIMIT in connectionThrottle.js

    // Fully release, should be able to acquire the full limit again
    for (let i = 0; i < acquired; i++) release(ip);
    let reacquired = 0;
    for (let i = 0; i < 20; i++) {
      if (tryAcquire(ip)) reacquired++;
    }
    expect(reacquired).toBe(15);
    for (let i = 0; i < reacquired; i++) release(ip);
  });

  it('applies a stricter limit once an IP is flagged in the risk registry', () => {
    const ip = '198.51.100.21';
    bump(ip, 10); // well above RISK_THRESHOLD (5)
    expect(getScore(ip)).toBeGreaterThanOrEqual(5);

    let acquired = 0;
    for (let i = 0; i < 20; i++) {
      if (tryAcquire(ip)) acquired++;
    }
    expect(acquired).toBe(4); // FLAGGED_LIMIT in connectionThrottle.js
    for (let i = 0; i < acquired; i++) release(ip);
  });
});

describe('Skyload — risk registry', () => {
  it('returns 0 for an IP that has never been bumped', () => {
    expect(getScore('198.51.100.99')).toBe(0);
  });

  it('accumulates score across multiple bumps for the same IP', () => {
    const ip = '198.51.100.22';
    bump(ip, 3);
    bump(ip, 3);
    expect(getScore(ip)).toBeGreaterThanOrEqual(5); // decay is time-based, both bumps landed within ms of each other
  });
});
