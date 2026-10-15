// University enrichment saves what it finds without anyone reviewing it, so every source must be fetched over HTTPS:
// a plain-HTTP answer can be rewritten by anyone on the network path (it used to call Hipolabs over http://).
const axios = require('axios');
const { fetchEnrichmentData, clearCache } = require('../lib/enrichUniversity');

describe('fetchEnrichmentData', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never makes a plain-HTTP request', async () => {
    const urls = [];
    vi.spyOn(axios, 'get').mockImplementation(async (url) => {
      urls.push(String(url));
      throw new Error('offline in tests');
    });
    clearCache('Example Test University');
    await fetchEnrichmentData('Example Test University').catch(() => {});
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => u.startsWith('http://'))).toEqual([]);
  });
});
