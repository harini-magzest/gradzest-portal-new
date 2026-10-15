const dns = require('dns').promises;
const net = require('net');

// Blocks SSRF via admin-supplied or scraped image URLs (university logo/cover image): rejects
// anything that isn't a plain http(s) URL, and rejects any hostname that resolves to a
// private/loopback/link-local/CGNAT/cloud-metadata address (e.g. 169.254.169.254). This closes
// the realistic "paste (or scrape) an internal URL" attack.
//
// It does NOT pin the resolved IP for the request that follows, so a fast DNS-rebinding attack
// (the hostname's answer changes between this check and the real fetch, milliseconds later) is
// a known residual risk. Accepted here because the threat model is a trusted admin pasting a
// URL or an automated scrape of a third-party page, not an anonymous attacker racing DNS.
// Both checks use safeHttp's address test, the stricter of the two the app had: this one used to let through the IPv6
// unspecified address (::, which can reach the local machine), multicast ranges and NAT64 (64:ff9b::/96, which can
// wrap a private IPv4 address).
const { isPrivateAddress } = require('./safeHttp');
const isPrivateIPv4 = (ip) => isPrivateAddress(ip);
const isPrivateIPv6 = (ip) => isPrivateAddress(ip);

/**
 * Throws if the URL isn't a plain http(s) URL pointing at a public address.
 * `lookupFn` is injectable (defaults to the real dns.lookup) so tests can supply a fake
 * resolver instead of depending on real DNS — mirrors the `intelFn` pattern already used in
 * server/lib/detectIncidents.js.
 */
async function assertPublicHttpUrl(rawUrl, lookupFn = dns.lookup) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed');
  }
  const hostname = parsed.hostname;
  if (!hostname || hostname === 'localhost') throw new Error('URL host is not allowed');

  // URL.hostname keeps the brackets around an IPv6 literal (e.g. "[::1]"); net.isIP needs
  // them stripped, or it reports "not an IP" and this would wrongly fall through to a DNS
  // lookup of the literal bracketed string, which simply fails to resolve.
  const bareHost = hostname.replace(/^\[|\]$/g, '');
  const ipVersion = net.isIP(bareHost);
  if (ipVersion) {
    const blocked = ipVersion === 4 ? isPrivateIPv4(bareHost) : isPrivateIPv6(bareHost);
    if (blocked) throw new Error('URL resolves to a private address');
    return;
  }

  let addresses;
  try {
    addresses = await lookupFn(hostname, { all: true });
  } catch {
    throw new Error('Could not resolve URL host');
  }
  for (const { address, family } of addresses) {
    const blocked = family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
    if (blocked) throw new Error('URL resolves to a private address');
  }
}

module.exports = { assertPublicHttpUrl, isPrivateIPv4, isPrivateIPv6 };
