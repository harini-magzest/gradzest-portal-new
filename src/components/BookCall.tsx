import { useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { api } from '../api';

type Availability = Awaited<ReturnType<typeof api.meetings.availability>>;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const REASONS: Record<string, string> = {
  sunday: 'The office is closed on Sundays. Please pick another day.',
  past: 'That day has passed.',
  too_far: 'You can book up to 60 days ahead.',
  invalid_date: 'Pick a valid date.',
};

function fmt(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// A student picks a day, sees their counselor's free hours, and books a video call in one click.
export default function BookCall({ onBooked }: { onBooked: () => void }) {
  const [date, setDate] = useState(todayStr());
  const [avail, setAvail] = useState<Availability | null>(null);
  const [error, setError] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const loadSlots = async (d: string) => {
    setError('');
    setTime('');
    setAvail(null);
    try { setAvail(await api.meetings.availability(d)); }
    catch (err: any) { setError(err?.message || 'Could not load available times.'); }
  };
  useEffect(() => { loadSlots(date); }, [date]);

  const book = async () => {
    if (!time) return;
    setBusy(true);
    setError('');
    try {
      await api.meetings.book({ date, time, notes: notes.trim() || undefined });
      setDone(`Booked for ${date} at ${fmt(time)}. Your counselor has been notified.`);
      setNotes('');
      onBooked();
      await loadSlots(date);
    } catch (err: any) {
      setError(err?.message || 'Could not book that time.');
      await loadSlots(date);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3"><CalendarPlus className="w-4 h-4" /> Book a call with your counselor</h2>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="text-sm text-gray-600">
          Day
          <input type="date" value={date} min={todayStr()} onChange={e => { setDone(''); setDate(e.target.value); }}
            className="mt-1 block border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 mb-2">{error}</p>}
      {done && <p role="status" className="text-sm text-emerald-700 mb-2">{done}</p>}

      {!avail && !error ? (
        <p className="text-sm text-gray-400">Loading times…</p>
      ) : avail && !avail.open ? (
        <p className="text-sm text-gray-500">{REASONS[avail.reason || ''] || 'No times available that day.'}</p>
      ) : avail ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Available times">
            {avail.slots.map(s => (
              <button
                key={s.time}
                type="button"
                disabled={!s.available}
                onClick={() => setTime(s.time)}
                aria-pressed={time === s.time}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  time === s.time ? 'bg-[#0d1b4b] text-white border-[#0d1b4b]'
                    : s.available ? 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    : 'border-gray-100 text-gray-300 line-through cursor-not-allowed'
                }`}
              >
                {fmt(s.time)}
              </button>
            ))}
          </div>
          {avail.slots.every(s => !s.available) && <p className="text-sm text-gray-500 mt-2">Every time that day is taken. Try another day.</p>}
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={500}
            placeholder="What would you like to talk about? (optional)"
            className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            rows={2}
          />
          <button type="button" onClick={book} disabled={!time || busy}
            className="mt-3 px-4 py-2 rounded-xl bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-medium disabled:opacity-40">
            {busy ? 'Booking…' : time ? `Book ${fmt(time)}` : 'Pick a time'}
          </button>
        </>
      ) : null}
    </section>
  );
}
