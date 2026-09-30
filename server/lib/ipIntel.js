// Real IP geolocation/context lookup via ip-api.com's free tier — no
// signup, no API key, no cost. Not a substitute for real threat
// intelligence (Cloudflare/AbuseIPDB-grade services correlate abuse
// reports across millions of sources); this gives an analyst basic,
// genuinely useful context (country, ISP, organization) instead of a bare
// IP string, which is what's actually achievable without an account.
//
// Free-tier limits: ~45 requests/minute, HTTP only (not HTTPS) on the free
// endpoint. Cached for an hour per IP since geolocation data changes
// rarely and this keeps well under the rate limit even under active use.

const http = require('http');

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // ip -> { data, cachedAt }

function fetchIpApi(ip) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,regionName,city,isp,org,as,query`,
      { timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ status: 'fail', message: 'Failed to parse response' }); }
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve({ status: 'fail', message: 'Request timed out' }); });
    req.on('error', (err) => resolve({ status: 'fail', message: err.message }));
  });
}

async function getIpIntel(ip) {
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.cachedAt < CACHE_MS) return { ...cached.data, cached: true };

  const result = await fetchIpApi(ip);
  const data = result.status === 'success'
    ? {
        available: true,
        country: result.country, countryCode: result.countryCode,
        region: result.regionName, city: result.city,
        isp: result.isp, org: result.org, asn: result.as,
      }
    : {
        available: false,
        // ip-api.com returns e.g. "private range" for RFC1918/loopback addresses —
        // surfaced honestly instead of guessing.
        reason: result.message || 'No geolocation data available',
      };

  cache.set(ip, { data, cachedAt: Date.now() });
  return { ...data, cached: false };
}

module.exports = { getIpIntel };
