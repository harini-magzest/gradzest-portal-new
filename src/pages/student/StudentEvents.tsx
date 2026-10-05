import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, PlayCircle, Users } from 'lucide-react';
import { api } from '../../api';
import AddToCalendar from '../../components/AddToCalendar';

type EventRow = Awaited<ReturnType<typeof api.events.list>>[number];

function when(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Webinars, workshops and open days. Registering reveals the join link and adds reminders (in-app, email, and
// WhatsApp if the student opted in under their profile).
export default function StudentEvents() {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setEvents(await api.events.list()); setError(''); }
    catch (err: any) { setError(err?.message || 'Could not load events.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (e: EventRow) => {
    setBusy(e.id);
    setError('');
    try {
      const updated = e.registered ? await api.events.unregister(e.id) : await api.events.register(e.id);
      setEvents(prev => (prev || []).map(x => (x.id === e.id ? updated : x)));
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const now = Date.now();
  const upcoming = (events || []).filter(e => new Date(e.startsAt).getTime() > now);
  const past = (events || []).filter(e => new Date(e.startsAt).getTime() <= now).reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><CalendarDays className="w-5 h-5" /> Events</h1>
        <p className="text-sm text-gray-500 mt-1">Webinars, workshops and open days. Register to get the joining link and a reminder.</p>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {!events && !error && <p className="text-sm text-gray-400">Loading events…</p>}

      {events && upcoming.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 p-6">No upcoming events right now. Check back soon.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {upcoming.map(e => {
          const full = e.spotsLeft === 0 && !e.registered;
          return (
            <article key={e.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
              <h2 className="font-semibold text-gray-900">{e.title}</h2>
              <p className="text-sm text-gray-600 mt-1">{when(e.startsAt)} · {e.durationMin} min</p>
              {e.description && <p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap">{e.description}</p>}
              <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> {e.registeredCount} registered{e.spotsLeft !== null ? ` · ${e.spotsLeft} spot${e.spotsLeft === 1 ? '' : 's'} left` : ''}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(e)}
                  disabled={busy === e.id || full}
                  className={`px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 ${e.registered ? 'border border-gray-200 text-gray-700 hover:bg-gray-50' : 'bg-[#0d1b4b] hover:bg-[#152258] text-white'}`}
                >
                  {busy === e.id ? 'Please wait…' : e.registered ? 'Cancel registration' : full ? 'Full' : 'Register'}
                </button>
                {e.registered && e.link && (
                  <a href={e.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
                    Join link <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              {e.registered && <div className="mt-3"><AddToCalendar event={e} /></div>}
            </article>
          );
        })}
      </div>

      {past.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-900 mb-3">Recent events</h2>
          <ul className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {past.map(e => (
              <li key={e.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                <span><span className="font-medium text-gray-800">{e.title}</span> <span className="text-gray-400">· {when(e.startsAt)}</span></span>
                {e.recordingUrl && (
                  <a href={e.recordingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-blue-700 hover:underline flex-shrink-0">
                    <PlayCircle className="w-4 h-4" /> Recording
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
