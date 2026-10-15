const { getIpIntel } = require('../lib/ipIntel');

// Hits the real ip-api.com free tier — this is an external network
// dependency, unlike everything else tested in this suite (local DB, local
// ClamAV). Assertions are kept loose (structural, not exact city/ISP text)
// so the test stays meaningful even if ip-api.com is unreachable in a given
// environment: getIpIntel() is designed to fail closed to `available: false`
// on any network error, which is itself the behavior being verified for
// reserved-range IPs, and happens to also hold true if the network is down.
describe('IP intel (real ip-api.com lookup)', () => {
  it('reports a loopback/private IP as unavailable with a reason, not fake data', async () => {
    const result = await getIpIntel('127.0.0.1');
    expect(result.available).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  }, 10000);

  it('caches repeated lookups for the same IP', async () => {
    const first = await getIpIntel('1.1.1.1');
    expect(first.cached).toBe(false);
    const second = await getIpIntel('1.1.1.1');
    expect(second.cached).toBe(true);
    // Cached response should be the same underlying data either way.
    expect(second.available).toBe(first.available);
  }, 10000);
});
