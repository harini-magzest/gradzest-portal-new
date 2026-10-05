// What can honestly be known about the device behind a request.
//
// A website cannot read a computer's hostname or a phone's marketing name. What it can learn is:
//   - from the User-Agent header: browser + version, operating system, desktop/mobile/tablet;
//   - from the browser's Client Hints (Chrome / Edge only): the precise OS (e.g. Windows 11 vs 10),
//     CPU architecture, and, on Android, the phone MODEL (e.g. "SM-S918B");
//   - from the page: screen size, language and timezone.
// Client-reported values (hints, screen, timezone) can be spoofed by whoever controls the browser, so they
// are display information for an analyst, never something to authenticate on. The server-parsed User-Agent
// is also client-supplied but is what the transport carried; both are kept and the label says which it used.

function parseUserAgent(ua = '') {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', deviceType: 'Unknown' };
  const pick = (rules, fallback) => {
    for (const [re, out] of rules) {
      const m = ua.match(re);
      if (m) return typeof out === 'function' ? out(m) : out;
    }
    return fallback;
  };
  const browser = pick([
    [/Edg(?:e|A|iOS)?\/([\d.]+)/, (m) => `Edge ${m[1].split('.')[0]}`],
    [/OPR\/([\d.]+)/, (m) => `Opera ${m[1].split('.')[0]}`],
    [/Firefox\/([\d.]+)/, (m) => `Firefox ${m[1].split('.')[0]}`],
    [/(?:Chrome|CriOS)\/([\d.]+)/, (m) => `Chrome ${m[1].split('.')[0]}`],
    [/Version\/([\d.]+).*Safari/, (m) => `Safari ${m[1].split('.')[0]}`],
    [/curl\/([\d.]+)/, (m) => `curl ${m[1]}`],
    [/PostmanRuntime\/([\d.]+)/, (m) => `Postman ${m[1]}`],
    [/python-requests|node-fetch|axios|Go-http-client|okhttp/i, 'Script / HTTP client'],
    [/bot|crawler|spider/i, 'Bot / crawler'],
  ], 'Unknown');
  const os = pick([
    [/Windows NT 10\.0/, 'Windows 10/11'], [/Windows NT ([\d.]+)/, (m) => `Windows (NT ${m[1]})`],
    [/Android ([\d.]+)/, (m) => `Android ${m[1]}`],
    [/(?:iPhone|iPad|iPod).*OS ([\d_]+)/, (m) => `iOS ${m[1].replace(/_/g, '.')}`],
    [/Mac OS X ([\d_.]+)/, (m) => `macOS ${m[1].replace(/_/g, '.')}`],
    [/CrOS/, 'ChromeOS'], [/Linux/, 'Linux'],
  ], 'Unknown');
  const deviceType = /iPad|Tablet/i.test(ua) ? 'Tablet'
    : /Mobi|iPhone|Android/i.test(ua) ? 'Mobile'
      : /bot|crawler|curl|Postman|python|node-fetch|axios|Go-http|okhttp/i.test(ua) ? 'Automated client' : 'Desktop';
  return { browser, os, deviceType };
}

const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n) : '');
const num = (v, lo, hi) => (Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : null);

// Cleans a device-hints object sent by the browser: known keys only, bounded lengths, no markup.
function sanitizeHints(raw) {
  if (!raw || typeof raw !== 'object') return {};
  return {
    platform: str(raw.platform, 40), platformVersion: str(raw.platformVersion, 30), architecture: str(raw.architecture, 20),
    bitness: str(raw.bitness, 10), model: str(raw.model, 60), mobile: raw.mobile === true,
    screen: /^\d{3,5}x\d{3,5}(@[\d.]{1,5})?$/.test(String(raw.screen || '')) ? String(raw.screen) : '',
    language: str(raw.language, 20), timezone: str(raw.timezone, 60),
    cores: num(raw.cores, 1, 256), memoryGb: num(raw.memoryGb, 0.25, 1024),
  };
}

// Windows 11 reports itself as "Windows 10" in the User-Agent; Client Hints reveal it (platformVersion >= 13).
function osFromHints(h, uaOs) {
  if (/^windows$/i.test(h.platform || '')) {
    const major = parseInt(h.platformVersion, 10);
    return Number.isFinite(major) ? (major >= 13 ? 'Windows 11' : 'Windows 10') : uaOs;
  }
  if (h.platform === 'Android' && h.platformVersion) return `Android ${h.platformVersion.split('.')[0]}`;
  if (h.platform === 'macOS' && h.platformVersion) return `macOS ${h.platformVersion.split('.').slice(0, 2).join('.')}`;
  return uaOs;
}

/**
 * Builds the device record stored with an activity row.
 * @returns {{ label, browser, os, deviceType, model, architecture, screen, language, timezone, cores, memoryGb, clientReported }}
 */
function buildDevice(userAgent, rawHints) {
  const ua = parseUserAgent(userAgent);
  const h = sanitizeHints(rawHints);
  const os = osFromHints(h, ua.os);
  const deviceType = h.mobile && ua.deviceType === 'Desktop' ? 'Mobile' : ua.deviceType;
  const bits = [h.model || null, os !== 'Unknown' ? os + (h.architecture ? ` (${h.architecture}${h.bitness ? '-' + h.bitness : ''})` : '') : null, ua.browser !== 'Unknown' ? ua.browser : null, deviceType !== 'Unknown' ? deviceType : null, h.screen ? h.screen.split('@')[0].replace('x', '×') : null]
    .filter(Boolean);
  return {
    label: bits.join(' · ') || 'Unknown device',
    browser: ua.browser, os, deviceType, model: h.model, architecture: h.architecture, screen: h.screen,
    language: h.language, timezone: h.timezone, cores: h.cores, memoryGb: h.memoryGb,
    clientReported: Object.values(h).some((v) => v && v !== false),
  };
}

module.exports = { parseUserAgent, sanitizeHints, buildDevice };
