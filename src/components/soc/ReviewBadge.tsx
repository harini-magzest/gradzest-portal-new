import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';

export interface ReviewResult { status?: string; by?: string; at?: string | null; note?: string }

// The analyst's manual VirusTotal verdict for a document. "Not checked yet" is the starting state for every upload.
export default function ReviewBadge({ review }: { review?: ReviewResult | null }) {
  const status = review?.status || 'unreviewed';
  const detail = [review?.by && `by ${review.by}`, review?.at && new Date(review.at).toLocaleString('en-IN'), review?.note].filter(Boolean).join(' · ');
  const cfg = status === 'flagged'
    ? { Icon: ShieldAlert, text: 'Flagged as malicious', bg: '#FCE8E8', fg: '#8B1A1A' }
    : status === 'clean'
      ? { Icon: ShieldCheck, text: 'Checked: clean', bg: '#EAF3DE', fg: '#27500A' }
      : { Icon: ShieldQuestion, text: 'Not checked yet', bg: '#F0F0F2', fg: '#4B5563' };
  return (
    <span title={detail || 'Nobody has checked this file\'s hash on VirusTotal yet'} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: cfg.bg, color: cfg.fg }}>
      <cfg.Icon className="w-3 h-3" />{cfg.text}
    </span>
  );
}
