import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api';
import { FORM_COUNTRIES } from '../../lib/leadFormFields';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500';

// "Talk to a counselor" inside the guest Zest chat. Zest can't save anything itself, so the visitor's details are
// collected here as a real form and sent to /zest/public/lead (saved once, counselor assigned, admins alerted).
export default function ZestLeadForm({ onClose, onSent }: { onClose: () => void; onSent: (message: string) => void }) {
  const [v, setV] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [countries, setCountries] = useState<string[]>([]);
  const [website, setWebsite] = useState(''); // bot trap, hidden from people
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV(s => ({ ...s, [k]: e.target.value }));
  const toggle = (c: string) => setCountries(cs => (cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSending(true);
    try {
      const { message } = await api.zest.publicLead({ ...v, preferredCountries: countries, wantsHuman: true, website });
      onSent(message);
    } catch (err: any) {
      setError(err?.message || 'Could not send your details. Please try again.');
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white border border-blue-100 rounded-2xl shadow-xs p-4 space-y-3" aria-label="Talk to a counselor">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">Talk to a counselor</p>
          <p className="text-xs text-gray-500">Share your details and a Gradzest counselor will call you.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close form" className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input required aria-label="First name" placeholder="First name *" autoComplete="given-name" value={v.firstName} onChange={set('firstName')} className={inputCls} />
        <input aria-label="Last name" placeholder="Last name" autoComplete="family-name" value={v.lastName} onChange={set('lastName')} className={inputCls} />
      </div>
      <input required type="tel" inputMode="tel" aria-label="Phone number" placeholder="Phone number *" autoComplete="tel" value={v.phone} onChange={set('phone')} className={inputCls} />
      <input type="email" aria-label="Email" placeholder="Email" autoComplete="email" value={v.email} onChange={set('email')} className={inputCls} />
      <fieldset>
        <legend className="text-xs font-medium text-gray-600 mb-1.5">Preferred country</legend>
        <div className="flex flex-wrap gap-1.5">
          {FORM_COUNTRIES.map(c => {
            const on = countries.includes(c);
            return (
              <button key={c} type="button" aria-pressed={on} onClick={() => toggle(c)}
                className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-[#0d1b4b] text-white border-[#0d1b4b]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}>
                {c}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg">{error}</p>}
      <button type="submit" disabled={sending}
        className="w-full py-2.5 rounded-xl bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-semibold disabled:opacity-60">
        {sending ? 'Sending…' : 'Request a call'}
      </button>
      <p className="text-[11px] text-gray-400 text-center">By sending, you agree to be contacted by Gradzest. <a href="/privacy" className="underline">Privacy policy</a></p>
    </form>
  );
}
