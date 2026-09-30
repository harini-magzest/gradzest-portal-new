// Shared IP / CIDR matching for the IP blocklist and SOC suppression rules.
// Entries are either a single address ("203.0.113.9") or an IPv4/IPv6 CIDR
// range ("203.0.113.0/24"). Built on node:net's BlockList so v4/v6 handling
// isn't hand-rolled.

const net = require('net');

// req.ip on a dual-stack socket is often "::ffff:1.2.3.4" — normalise to plain v4.
function normalizeIp(ip) {
  if (typeof ip !== 'string') return '';
  const trimmed = ip.trim();
  return trimmed.startsWith('::ffff:') && net.isIPv4(trimmed.slice(7)) ? trimmed.slice(7) : trimmed;
}

// Returns { ok, value, family, prefix } for a valid entry, { ok: false } otherwise.
function parseIpEntry(raw) {
  const value = normalizeIp(String(raw || ''));
  if (!value) return { ok: false };
  const [addr, prefixStr, ...extra] = value.split('/');
  if (extra.length) return { ok: false };
  const family = net.isIPv4(addr) ? 4 : net.isIPv6(addr) ? 6 : 0;
  if (!family) return { ok: false };
  if (prefixStr === undefined) return { ok: true, value: addr, family, prefix: null };
  if (!/^\d{1,3}$/.test(prefixStr)) return { ok: false };
  const prefix = parseInt(prefixStr, 10);
  if (prefix < 0 || prefix > (family === 4 ? 32 : 128)) return { ok: false };
  return { ok: true, value: `${addr}/${prefix}`, family, prefix };
}

// Builds a matcher over a list of entries; invalid entries are ignored.
function buildIpMatcher(entries) {
  const list = new net.BlockList();
  let any = false;
  for (const entry of entries) {
    const p = parseIpEntry(entry);
    if (!p.ok) continue;
    const [addr] = p.value.split('/');
    const type = p.family === 4 ? 'ipv4' : 'ipv6';
    if (p.prefix === null) list.addAddress(addr, type);
    else list.addSubnet(addr, p.prefix, type);
    any = true;
  }
  return (ip) => {
    if (!any) return false;
    const n = normalizeIp(ip);
    const type = net.isIPv4(n) ? 'ipv4' : net.isIPv6(n) ? 'ipv6' : null;
    return type ? list.check(n, type) : false;
  };
}

module.exports = { normalizeIp, parseIpEntry, buildIpMatcher };
