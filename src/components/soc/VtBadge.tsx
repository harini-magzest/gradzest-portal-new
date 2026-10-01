import { ShieldAlert, ShieldCheck, ShieldQuestion, Loader2, AlertCircle } from 'lucide-react';

export interface VtResult {
  status: string; malicious?: number; suspicious?: number; harmless?: number; undetected?: number;
  label?: string; checkedAt?: string | null; error?: string;
}

const STYLES: Record<string, { bg: string; fg: string }> = {
  malicious: { bg: '#FCE8E8', fg: '#8B1A1A' }, suspicious: { bg: '#FAEEDA', fg: '#633806' },
  clean: { bg: '#EAF3DE', fg: '#27500A' }, unknown: { bg: '#F0F0F2', fg: '#4B5563' },
  pending: { bg: '#E6F1FB', fg: '#0C447C' }, rate_limited: { bg: '#FAEEDA', fg: '#633806' },
  error: { bg: '#FCEBEB', fg: '#791F1F' }, not_configured: { bg: '#F0F0F2', fg: '#6b7280' },
};

// One compact verdict for a document's VirusTotal hash lookup. "Not seen" is the normal result for a
// private document (only the hash is checked, the file is never uploaded) and is deliberately not styled as a warning.
export default function VtBadge({ vt }: { vt: VtResult }) {
  const s = STYLES[vt.status] || STYLES.unknown;
  const engines = (vt.malicious || 0) + (vt.suspicious || 0) + (vt.harmless || 0) + (vt.undetected || 0);
  let Icon: any = ShieldQuestion;
  let text = '';
  let title = '';
  switch (vt.status) {
    case 'malicious': Icon = ShieldAlert; text = `Malicious · ${vt.malicious}/${engines}`; title = `${vt.malicious} engines flag this file as malicious${vt.label ? ` (${vt.label})` : ''}`; break;
    case 'suspicious': Icon = ShieldAlert; text = `Suspicious · ${vt.suspicious}/${engines}`; title = `${vt.suspicious} engines call this file suspicious`; break;
    case 'clean': Icon = ShieldCheck; text = `Clean · 0/${engines}`; title = 'No engine on VirusTotal flags this file'; break;
    case 'unknown': text = 'Not seen by VirusTotal'; title = 'VirusTotal has never seen this exact file. Normal for private documents — it is not a risk signal. ClamAV already scanned it locally.'; break;
    case 'pending': Icon = Loader2; text = 'Checking…'; title = 'Waiting for the VirusTotal lookup'; break;
    case 'rate_limited': Icon = AlertCircle; text = 'Rate limited — retrying'; title = 'VirusTotal free-tier limit reached; will retry automatically'; break;
    case 'error': Icon = AlertCircle; text = 'Check failed'; title = vt.error || 'The VirusTotal lookup failed'; break;
    default: text = 'Not checked'; title = 'VirusTotal is not configured on the server (VT_API_KEY)';
  }
  return (
    <span title={title} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: s.bg, color: s.fg }}>
      <Icon className={`w-3 h-3 ${vt.status === 'pending' ? 'animate-spin' : ''}`} />{text}
    </span>
  );
}
