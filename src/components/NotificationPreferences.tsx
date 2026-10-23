import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../api';

type Prefs = Awaited<ReturnType<typeof api.notificationPrefs.get>>;

// How the signed-in person wants deadline and meeting reminders delivered. The in-app bell always works; email is on
// unless switched off; WhatsApp is opt-in and needs a phone number in the profile.
export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => api.notificationPrefs.get())
      .then(p => { if (live) setPrefs(p); })
      .catch(err => { if (live) setError(err?.message || 'Could not load your notification settings.'); });
    return () => { live = false; };
  }, []);

  const toggle = async (key: 'email' | 'whatsapp') => {
    if (!prefs) return;
    setSaving(true);
    setError('');
    setNote('');
    try {
      const next = await api.notificationPrefs.update({ [key]: !prefs[key] });
      setPrefs(next);
      if (next.warning) setNote(next.warning);
    } catch (err: any) {
      setError(err?.message || 'Could not save that change.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !prefs) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!prefs) return null;

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-xs">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1"><Bell className="w-4 h-4" /> Reminders</h2>
      <p className="text-sm text-gray-500 mb-4">Choose how we remind you about intake deadlines and meetings. You will always see them in the bell at the top.</p>
      {error && <p role="alert" className="text-sm text-red-600 mb-2">{error}</p>}
      <ul className="divide-y divide-gray-50">
        <Row label="Email" hint="Sent to your account email." on={prefs.email} disabled={saving} onToggle={() => toggle('email')} />
        <Row
          label="WhatsApp"
          hint={!prefs.whatsappAvailable ? 'Not available yet: WhatsApp messaging has not been set up.' : !prefs.hasPhone ? 'Add a phone number to your profile first.' : 'Sent to the phone number in your profile.'}
          on={prefs.whatsapp}
          disabled={saving || !prefs.whatsappAvailable}
          onToggle={() => toggle('whatsapp')}
        />
      </ul>
      {note && <p role="status" className="text-sm text-amber-700 mt-2">{note}</p>}
    </section>
  );
}

function Row({ label, hint, on, disabled, onToggle }: { label: string; hint: string; on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <li className="py-3 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${label} reminders`}
        disabled={disabled}
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
    </li>
  );
}
