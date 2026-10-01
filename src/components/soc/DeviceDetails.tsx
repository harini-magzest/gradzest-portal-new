import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../api';
import { Mask } from './Mask';

export interface DeviceEvent {
  _id: string; type: string; severity: string; email?: string; role?: string; ip?: string;
  userAgent?: string; message: string; createdAt: string; meta?: Record<string, unknown>;
}

// Loopback / private-network addresses have no public location or ISP, so the
// lookup can never answer for them — say that plainly instead of "unavailable".
export function classifyIp(ip: string): { kind: 'loopback' | 'private' | 'public'; label: string } {
  const v = ip.replace(/^::ffff:/, '');
  if (v === '::1' || /^127\./.test(v)) return { kind: 'loopback', label: 'Local machine (loopback) — this request came from the same computer running the server' };
  if (/^10\./.test(v) || /^192\.168\./.test(v) || /^172\.(1[6-9]|2\d|3[01])\./.test(v) || /^169\.254\./.test(v) || /^f[cd]/i.test(v) || /^fe80:/i.test(v)) {
    return { kind: 'private', label: 'Private network address — internal to a LAN/VPN, not visible on the internet' };
  }
  return { kind: 'public', label: '' };
}

// Small dependency-free user-agent parser. Order matters: Edge/Opera/Chrome
// all contain "Chrome", iOS contains "Mac OS X", Android contains "Linux".
export function parseUserAgent(ua: string) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  const pick = (rules: [RegExp, string | ((m: RegExpMatchArray) => string)][], fallback: string) => {
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
  const device = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'Mobile' : /bot|crawler|curl|Postman|python|node-fetch|axios|Go-http/i.test(ua) ? 'Automated client' : 'Desktop';
  return { browser, os, device };
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex gap-3 text-xs py-1">
      <dt className="w-28 flex-shrink-0 text-gray-400">{label}</dt>
      <dd className={`text-gray-800 break-all min-w-0 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

// Everything known about the device/source behind one security event: the parsed
// user agent, the raw string, and the IP's location/ISP/block status/recent activity.
export default function DeviceDetails({ event }: { event: DeviceEvent }) {
  const [ipData, setIpData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const ua = parseUserAgent(event.userAgent || '');

  useEffect(() => {
    if (!event.ip || classifyIp(event.ip).kind !== 'public') return; // nothing to look up for local addresses
    let cancelled = false;
    setLoading(true); setFailed(false); setIpData(null);
    api.soc.investigateIp(event.ip)
      .then(d => { if (!cancelled) setIpData(d); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [event.ip]);

  const intel = ipData?.intel;
  const timeline: any[] = ipData?.timeline || [];
  const failedLogins = timeline.filter(t => t.type === 'login_failure').length;
  const openIncidents = (ipData?.relatedIncidents || []).filter((i: any) => i.status === 'open' || i.status === 'investigating').length;
  const ipClass = event.ip ? classifyIp(event.ip) : null;
  const isLocal = ipClass !== null && ipClass.kind !== 'public';
  const location = intel?.available ? [intel.city, intel.region, intel.country].filter(Boolean).join(', ') : '';

  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50/70 p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6" onClick={e => e.stopPropagation()}>
      <dl>
        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Device</p>
        <Row label="Browser / client" value={ua.browser} />
        <Row label="Operating system" value={ua.os} />
        <Row label="Device type" value={ua.device} />
        <Row label="User agent" value={event.userAgent || 'Not sent'} mono />
        <p className="text-[10px] font-semibold text-gray-400 uppercase mt-3 mb-1">Event</p>
        <Row label="Account" value={<Mask value={event.email} fallback="Unknown" />} />
        <Row label="Role" value={event.role} />
        <Row label="Type" value={event.type.replace(/_/g, ' ')} />
        <Row label="Severity" value={event.severity} />
        <Row label="Time" value={new Date(event.createdAt).toLocaleString('en-IN')} />
        <Row label="Message" value={event.message} />
        <Row label="Event ID" value={event._id} mono />
      </dl>
      <dl>
        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Network</p>
        <Row label="IP address" value={event.ip || 'Not recorded'} mono />
        {isLocal && <Row label="Address type" value={ipClass!.label} />}
        {isLocal && <Row label="Location / ISP" value="Not applicable for local addresses. Once the app is deployed behind a public IP, real location and ISP details appear here." />}
        {loading && <p className="text-xs text-gray-400 flex items-center gap-1.5 py-1"><Loader2 className="w-3 h-3 animate-spin" /> Looking up IP…</p>}
        {failed && <p className="text-xs text-red-500 py-1">Could not look up this IP.</p>}
        {ipData && (
          <>
            <Row label="Location" value={location || (intel?.reason ? `Unavailable (${intel.reason})` : 'Unavailable')} />
            {intel?.available && <Row label="ISP" value={intel.isp} />}
            {intel?.available && intel.org && intel.org !== intel.isp && <Row label="Organization" value={intel.org} />}
            {intel?.available && <Row label="ASN" value={intel.asn} mono />}
            {intel?.available && typeof intel.lat === 'number' && <Row label="Coordinates" value={`${intel.lat}, ${intel.lon}`} mono />}
            <Row label="Blocked" value={ipData.isBlocked ? 'Yes — currently blocked' : 'No'} />
            <Row label="Recent activity" value={`${timeline.length} recorded events (${failedLogins} failed login${failedLogins === 1 ? '' : 's'})`} />
            <Row label="Open incidents" value={String(openIncidents)} />
          </>
        )}
      </dl>
    </div>
  );
}
