import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Mail, MessageCircle, RefreshCw, X } from 'lucide-react';
import { api } from '../../api';

type Channel = 'email' | 'whatsapp';
type Draft = Awaited<ReturnType<typeof api.zest.followupDraft>>;

// Digits only, with a country code (91 assumed for numbers saved without one), for a wa.me link.
function whatsappNumber(phone: string): string | null {
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (!raw.startsWith('+')) {
    if (raw.startsWith('00')) digits = digits.slice(2); else digits = digits.replace(/^0+/, '');
    if (digits.length <= 10) digits = `91${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

// A ready-to-edit follow-up for a student who has gone quiet. Zest cannot send it: the counselor reviews, edits and
// sends it from their own email or WhatsApp.
export default function FollowupDraftModal({ studentId, name, onClose }: { studentId: string; name: string; onClose: () => void }) {
  const [channel, setChannel] = useState<Channel>('email');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (ch: Channel) => {
    setLoading(true);
    setError('');
    try {
      const d = await api.zest.followupDraft(studentId, ch);
      setDraft(d);
      setSubject(d.subject);
      setBody(d.body);
    } catch (err: any) {
      setError(err?.message || 'Could not prepare a draft right now.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);
  useEffect(() => { load(channel); }, [load, channel]);

  const text = channel === 'email' && subject ? `Subject: ${subject}\n\n${body}` : body;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Could not copy. Select the text and copy it by hand.'); }
  };

  const wa = draft ? whatsappNumber(draft.phone) : null;
  const mailto = draft?.email ? `mailto:${draft.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : '';

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`Follow-up message for ${name}`} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Follow up with {name}</h2>
            {draft && <p className="text-xs text-gray-500">Quiet for {draft.daysIdle} day{draft.daysIdle === 1 ? '' : 's'} · {draft.source === 'ai' ? 'Written by Zest' : 'Standard template'}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit" role="group" aria-label="Channel">
            {([['email', 'Email', Mail], ['whatsapp', 'WhatsApp', MessageCircle]] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" onClick={() => setChannel(key)} aria-pressed={channel === key}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${channel === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {loading ? <p className="text-sm text-gray-400 py-8 text-center">Preparing a draft…</p> : draft && (
            <>
              {channel === 'email' && (
                <label className="block text-sm text-gray-600">Subject
                  <input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </label>
              )}
              <label className="block text-sm text-gray-600">Message
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={channel === 'email' ? 10 : 5} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </label>
              <p className="text-xs text-gray-400">Check the details before you send. Zest only used what is on the student's record, and it cannot send messages itself.</p>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm">
                  {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                </button>
                {channel === 'email' && mailto && <a href={mailto} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"><Mail className="w-4 h-4" /> Open in email</a>}
                {channel === 'whatsapp' && wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(body)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"><MessageCircle className="w-4 h-4" /> Open in WhatsApp</a>}
                <button type="button" onClick={() => load(channel)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"><RefreshCw className="w-4 h-4" /> Rewrite</button>
              </div>
              {channel === 'whatsapp' && !wa && <p className="text-xs text-amber-700">No usable phone number on this student's record.</p>}
              {channel === 'email' && !mailto && <p className="text-xs text-amber-700">This student has no email address on record.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
