import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Download, Plus, Trash2, X, XCircle } from 'lucide-react';
import { api } from '../api';

type EventRow = Awaited<ReturnType<typeof api.events.list>>[number];

const EMPTY = { title: '', description: '', startsAt: '', durationMin: '60', capacity: '0', link: '' };

function when(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Admins and counselors create and manage webinars/workshops here (shared by both dashboards).
export default function StaffEvents() {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<{ id: string; rows: { name: string; email: string }[] } | null>(null);

  const load = useCallback(async () => {
    try { setEvents(await api.events.list()); setError(''); }
    catch (err: any) { setError(err?.message || 'Could not load events.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.events.create({
        title: form.title, description: form.description, link: form.link,
        startsAt: new Date(form.startsAt).toISOString(), durationMin: Number(form.durationMin), capacity: Number(form.capacity),
      });
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not create the event.');
    } finally {
      setSaving(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); await load(); } catch (err: any) { setError(err?.message || 'Something went wrong.'); }
  };

  const showPeople = async (id: string) => {
    if (people?.id === id) { setPeople(null); return; }
    try { setPeople({ id, rows: await api.events.registrations(id) }); } catch (err: any) { setError(err?.message || 'Could not load registrations.'); }
  };

  const field = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><CalendarDays className="w-5 h-5" /> Events</h1>
          <p className="text-sm text-gray-500 mt-1">Webinars, workshops and open days students can register for. Registered students get reminders automatically.</p>
        </div>
        <button type="button" onClick={() => setShowForm(s => !s)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-medium">
          {showForm ? <><X className="w-4 h-4" /> Close</> : <><Plus className="w-4 h-4" /> New event</>}
        </button>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {showForm && (
        <form onSubmit={create} className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-gray-600 md:col-span-2">Title<input required maxLength={140} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={field} /></label>
          <label className="text-sm text-gray-600">Starts<input required type="datetime-local" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} className={field} /></label>
          <label className="text-sm text-gray-600">Length (minutes)<input required type="number" min={5} max={600} value={form.durationMin} onChange={e => setForm({ ...form, durationMin: e.target.value })} className={field} /></label>
          <label className="text-sm text-gray-600">Capacity (0 = unlimited)<input required type="number" min={0} step={1} value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} className={field} /></label>
          <label className="text-sm text-gray-600">Join link (Zoom, Meet, …)<input type="url" placeholder="https://" value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} className={field} /></label>
          <label className="text-sm text-gray-600 md:col-span-2">Description<textarea rows={3} maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={field} /></label>
          <div className="md:col-span-2"><button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-[#0d1b4b] text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Create event'}</button></div>
        </form>
      )}

      {!events && !error && <p className="text-sm text-gray-400">Loading events…</p>}
      {events && events.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 p-6">No events yet.</p>}

      <ul className="space-y-3">
        {(events || []).map(e => (
          <li key={e.id} className={`bg-white rounded-2xl border border-gray-100 shadow-xs p-5 ${e.status === 'cancelled' ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">{e.title} {e.status === 'cancelled' && <span className="ml-2 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Cancelled</span>}</h2>
                <p className="text-sm text-gray-600">{when(e.startsAt)} · {e.durationMin} min · by {e.createdByName || 'staff'}</p>
                <p className="text-xs text-gray-400 mt-1">{e.registeredCount} registered{e.capacity ? ` of ${e.capacity}` : ''}</p>
              </div>
              {e.canManage && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button type="button" onClick={() => showPeople(e.id)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">{people?.id === e.id ? 'Hide' : 'Registrations'}</button>
                  <button type="button" onClick={() => act(() => api.events.registrationsCsv(e.id))} className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50" aria-label="Download registrations as CSV"><Download className="w-4 h-4" /></button>
                  {e.status === 'scheduled' && <button type="button" onClick={() => act(() => api.events.update(e.id, { status: 'cancelled' }))} className="p-2 rounded-lg border border-gray-200 text-amber-700 hover:bg-amber-50" aria-label="Cancel event"><XCircle className="w-4 h-4" /></button>}
                  <button type="button" onClick={() => { if (window.confirm(`Delete "${e.title}"? This cannot be undone.`)) act(() => api.events.remove(e.id)); }} className="p-2 rounded-lg border border-gray-200 text-red-600 hover:bg-red-50" aria-label="Delete event"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            {people?.id === e.id && (
              <div className="mt-3 border-t border-gray-100 pt-3 text-sm">
                {people.rows.length === 0 ? <p className="text-gray-400">Nobody has registered yet.</p> : (
                  <ul className="grid gap-1 sm:grid-cols-2">{people.rows.map((r, i) => <li key={i} className="text-gray-700">{r.name} <span className="text-gray-400">{r.email}</span></li>)}</ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
