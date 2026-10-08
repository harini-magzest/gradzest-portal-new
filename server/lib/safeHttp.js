// Fetching an image from a URL that a person (or a third-party database) supplied, without letting that URL aim the server at
// its own network. Without this, a university "logo" set to http://169.254.169.254/... (the cloud metadata service),
// http://localhost:5000/..., or an internal address would make the server fetch it and hand the response to whoever asked
// for the logo: server-side request forgery (SSRF).
//
// What is enforced, per request AND per redirect hop:
//   * only http: and https:, on the default ports, with no user:password@ in the URL
//   * the host must resolve to PUBLIC addresses only (loopback, private, link-local, carrier-grade NAT, multicast, reserved,
//     and IPv6 equivalents including IPv4-mapped ones are refused). The check runs inside the socket's DNS lookup, so it is
//     the address actually connected to that is validated: a DNS name that flips to 127.0.0.1 after a check cannot get through
//   * the response must be an image, at most `maxBytes`, delivered within the timeout
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const axios = require('axios');

function ipv4ToInt(ip) {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
}
const V4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => ({ base: ipv4ToInt(base), mask: bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0 }));

/** True for any address that is not an ordinary public internet address. Unparseable input counts as private (fail closed). */
function isPrivateAddress(address) {
  const ip = String(address || '').trim().replace(/^\[|\]$/g, '').split('%')[0];
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(({ base, mask }) => ((n & mask) >>> 0) === ((base & mask) >>> 0));
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d or ::ffff:7f00:1) and IPv4-compatible forms: judge by the embedded IPv4 address
    const dotted = lower.match(/^(?:0{0,4}:){0,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hexMapped = lower.match(/^(?:0{0,4}:){0,5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (lower === '::' || lower === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;      // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;      // fe80::/10 link-local
    if (/^ff[0-9a-f]{2}:/.test(lower)) return true;         // ff00::/8 multicast
    if (/^(64:ff9b:|2001:db8:|2002:)/.test(lower)) return true; // NAT64, documentation, 6to4 (can wrap a private IPv4)
    return false;
  }
  return true;
}

// DNS lookup that refuses non-public answers. Used as the `lookup` of the agents, so it guards every connection, redirect
// hops included.
function guardedLookup(hostname, options, callback) {
  const opts = typeof options === 'function' ? {} : options || {};
  const cb = typeof options === 'function' ? options : callback;
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: opts.family || 4 }];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (!list.length || bad) {
      const e = new Error(`Refusing to connect to a non-public address for ${hostname}`);
      e.code = 'ESSRF';
      return cb(e);
    }
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

const agents = {
  http: new http.Agent({ lookup: guardedLookup }),
  https: new https.Agent({ lookup: guardedLookup }),
};

/** Throws if `url` is not an http(s) URL on a default port without credentials, or is an IP literal that is not public. */
function assertFetchable(url) {
  let u;
  try { u = typeof url === 'string' ? new URL(url) : url; } catch { throw Object.assign(new Error('Invalid URL'), { code: 'ESSRF' }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw Object.assign(new Error('Only http(s) URLs are allowed'), { code: 'ESSRF' });
  if (u.username || u.password) throw Object.assign(new Error('URLs with credentials are not allowed'), { code: 'ESSRF' });
  if (u.port && !['80', '443'].includes(u.port)) throw Object.assign(new Error('Non-standard ports are not allowed'), { code: 'ESSRF' });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateAddress(host)) throw Object.assign(new Error('Refusing a private address'), { code: 'ESSRF' });
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw Object.assign(new Error('Refusing an internal hostname'), { code: 'ESSRF' });
  return u;
}

/**
 * GET an image from an untrusted URL. Resolves to { buf, ct } or throws. Never follows a redirect to a private target.
 * @param {string} url
 * @param {{ headers?: object, timeout?: number, maxBytes?: number, minBytes?: number }} [opts]
 */
async function fetchPublicImage(url, { headers = {}, timeout = 8000, maxBytes = 2 * 1024 * 1024, minBytes = 0 } = {}) {
  const target = assertFetchable(url);
  const resp = await axios.get(target.href, {
    responseType: 'arraybuffer',
    timeout,
    maxRedirects: 3,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    httpAgent: agents.http,
    httpsAgent: agents.https,
    // Each redirect hop is re-checked (scheme, port, credentials, IP literal); the agents' lookup checks the resolved address
    beforeRedirect: (options) => {
      assertFetchable(`${options.protocol}//${options.hostname}${options.port ? `:${options.port}` : ''}${options.path || '/'}`);
    },
    validateStatus: (s) => s === 200,
    headers,
  });
  const ct = String(resp.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!ct.startsWith('image/')) throw Object.assign(new Error('Response is not an image'), { code: 'ENOTIMAGE' });
  const buf = Buffer.from(resp.data);
  if (buf.length < minBytes) throw Object.assign(new Error('Response is too small to be a real image'), { code: 'ENOTIMAGE' });
  return { buf, ct };
}

module.exports = { isPrivateAddress, assertFetchable, fetchPublicImage, guardedLookup };
