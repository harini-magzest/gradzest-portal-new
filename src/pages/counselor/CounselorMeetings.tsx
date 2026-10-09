import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Clock, Users, Video, ExternalLink, Search, RefreshCw, CalendarCheck, CalendarX, Plus, X, Link as LinkIcon } from 'lucide-react';
import { api } from '../../api';
import AddToCalendar from '../../components/AddToCalendar';
import { useAuth } from '../../context/AuthContext';
import { usePortalName } from '../../hooks/usePortalName';
import { openExternal } from '../../lib/safeUrl';

function Spinner() {
  return <span className="w-4 h-4 border-2 border-gray-300 border-t-sky-500 rounded-full animate-spin inline-block flex-shrink-0" />;
}

function normalId(obj: any) { return (obj?._id || obj?.id)?.toString() ?? ''; }

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> = {
  teams: { label: 'Microsoft Teams', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '🟣' },
  zoom:  { label: 'Zoom',            color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: '🔵' },
  meet:  { label: 'Google Meet',     color: 'bg-green-100 text-green-700 border-green-200',    icon: '🟢' },
  jitsi: { label: 'Jitsi Meet',      color: 'bg-sky-100 text-sky-700 border-sky-200',          icon: '🎥' },
  other: { label: 'Other',           color: 'bg-gray-100 text-gray-700 border-gray-200',       icon: '⚫' },
};

function isFuture(date: string, time: string) {
  return new Date(`${date}T${time}`) > new Date();
}

function isSessionActive(date: string, time: string, duration: number) {
  const end = new Date(`${date}T${time}`).getTime() + (duration || 60) * 60 * 1000;
  return Date.now() <= end;
}

function formatDateTime(date: string, time: string) {
  return new Date(`${date}T${time}`).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function MeetingCard({ meeting, onDelete }: { meeting: any; onDelete: (id: string) => void }) {
  const upcoming = isFuture(meeting.scheduledDate, meeting.scheduledTime);
  const active = isSessionActive(meeting.scheduledDate, meeting.scheduledTime, meeting.duration);
  const [showExpired, setShowExpired] = useState(false);
  const meta = PLATFORM_META[meeting.platform] ?? PLATFORM_META.other;
  const { user } = useAuth();
  const canDelete = user?.role === 'admin' || meeting.createdBy?.toString() === user?.id?.toString();

  const handleJoin = () => {
    if (!active) {
      setShowExpired(true);
      setTimeout(() => setShowExpired(false), 3000);
      return;
    }
    openExternal(meeting.meetingLink);
  };

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${upcoming ? 'border-gray-100' : 'border-gray-100 opacity-75'}`}>
      <div className={`h-1.5 ${upcoming ? 'bg-gradient-to-r from-sky-400 to-blue-500' : 'bg-gray-200'}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${meta.color}`}>
              {meta.icon} {meta.label}
            </span>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${upcoming ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {upcoming ? 'Upcoming' : 'Past'}
            </span>
          </div>
          {canDelete && (
            <button type="button" onClick={() => onDelete(normalId(meeting))}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
              title="Delete meeting">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <h3 className="text-base font-bold text-gray-900 mb-3 truncate">{meeting.title}</h3>

        <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span>{formatDateTime(meeting.scheduledDate, meeting.scheduledTime)}</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">{meeting.duration || 60} min</span>
        </div>

        {meeting.participants?.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500">
                {meeting.participants.length} participant{meeting.participants.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {meeting.participants.map((p: any, i: number) => (
                <span key={i} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium
                  ${p.role === 'counselor' ? 'bg-purple-50 text-purple-700' : 'bg-sky-50 text-sky-700'}`}>
                  {p.role === 'counselor' ? '🟣' : '🔵'} {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {meeting.notes && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3 line-clamp-2">{meeting.notes}</p>
        )}

        {showExpired ? (
          <div className="w-full py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm font-semibold text-red-600 text-center">
            Session expired — this meeting has ended
          </div>
        ) : (
          <button type="button" onClick={handleJoin}
            className={`w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all
              ${active
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg active:scale-[0.98]'
                : 'bg-gray-100 text-gray-500 cursor-default'}`}>
            <Video className="w-4 h-4" />
            {active ? <>Join {meta.label} Meeting<ExternalLink className="w-3.5 h-3.5 opacity-70" /></> : 'Session Ended'}
          </button>
        )}
        {upcoming && <div className="mt-3"><AddToCalendar meeting={meeting} /></div>}
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  title: '',
  scheduledDate: '',
  scheduledTime: '',
  duration: 60,
  platform: 'teams' as string,
  meetingLink: '',
  notes: '',
};

function ScheduleModal({ onClose, onCreated, students }: {
  onClose: () => void;
  onCreated: () => void;
  students: any[];
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleStudent(id: string) {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduledDate || !form.scheduledTime || !form.meetingLink.trim()) {
      setError('Title, date, time and meeting link are required.');
      return;
    }
    setSaving(true); setError('');
    try {
      const participants = selectedStudents.map(id => {
        const s = students.find(st => normalId(st) === id);
        return { userId: id, name: s?.name || s?.user?.name || 'Student', role: 'student' };
      });
      const m = await api.meetings.create({ ...form, participants });
      window.dispatchEvent(new CustomEvent('meeting:scheduled', { detail: m }));
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to schedule meeting.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-100 rounded-xl flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-[#0d1b4b]" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Schedule Meeting</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Meeting Title *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Admission Guidance Session"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d1b4b]"
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date *</label>
              <input
                type="date"
                value={form.scheduledDate}
                onChange={e => set('scheduledDate', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                aria-label="Meeting date"
                title="Meeting date"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d1b4b]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Time *</label>
              <input
                type="time"
                value={form.scheduledTime}
                onChange={e => set('scheduledTime', e.target.value)}
                aria-label="Meeting time"
                title="Meeting time"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d1b4b]"
              />
            </div>
          </div>

          {/* Duration & Platform */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Duration (min)</label>
              <input
                type="number"
                value={form.duration}
                onChange={e => set('duration', Number(e.target.value))}
                min={15} max={480} step={15}
                aria-label="Duration in minutes"
                title="Duration in minutes"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d1b4b]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Platform</label>
              <select
                value={form.platform}
                onChange={e => set('platform', e.target.value)}
                aria-label="Meeting platform"
                title="Meeting platform"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d1b4b] bg-white">
                <option value="teams">Microsoft Teams</option>
                <option value="zoom">Zoom</option>
                <option value="meet">Google Meet</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Meeting link */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Meeting Link *</label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={form.meetingLink}
                onChange={e => set('meetingLink', e.target.value)}
                placeholder="https://teams.microsoft.com/..."
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d1b4b]"
              />
            </div>
          </div>

          {/* Students */}
          {students.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Add Students
                {selectedStudents.length > 0 && (
                  <span className="ml-2 text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-bold">
                    {selectedStudents.length} selected
                  </span>
                )}
              </label>
              <div className="border border-gray-200 rounded-xl max-h-36 overflow-y-auto divide-y divide-gray-50">
                {students.map(s => {
                  const id = normalId(s);
                  const name = s.name || s.user?.name || 'Student';
                  const checked = selectedStudents.includes(id);
                  return (
                    <label key={id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-sky-50' : 'hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStudent(id)}
                        className="w-4 h-4 rounded border-gray-300 text-[#0d1b4b] focus:ring-[#0d1b4b]"
                      />
                      <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-xs flex-shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-800 font-medium">{name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Agenda, documents to bring, etc."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d1b4b] resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl text-sm font-semibold shadow-md disabled:opacity-60 transition-all flex items-center justify-center gap-2">
              {saving ? <><Spinner /> Scheduling…</> : <><CalendarDays className="w-4 h-4" /> Schedule Meeting</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CounselorMeetings() {
  const { portal } = usePortalName();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [m, s] = await Promise.all([
        api.meetings.list(),
        api.students.list().catch(() => []),
      ]);
      setMeetings(m);
      setStudents(s);
    } catch (err: any) {
      setError(err.message || 'Failed to load meetings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this meeting?')) return;
    try {
      await api.meetings.delete(id);
      setMeetings(prev => prev.filter(m => normalId(m) !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete meeting.');
    }
  }

  const filtered = meetings
    .filter(m => (tab === 'upcoming') === isFuture(m.scheduledDate, m.scheduledTime))
    .filter(m => !search || m.title?.toLowerCase().includes(search.toLowerCase()));

  const upcomingCount = meetings.filter(m => isFuture(m.scheduledDate, m.scheduledTime)).length;
  const pastCount = meetings.length - upcomingCount;

  return (
    <div className="space-y-6">
      {showModal && (
        <ScheduleModal
          students={students}
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <CalendarDays className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sky-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
              <h1 className="text-2xl font-bold leading-tight">My Meetings</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} disabled={loading} aria-label="Refresh meetings"
              className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 bg-white text-[#0d1b4b] hover:bg-[#f0f4ff] font-semibold px-4 py-2 rounded-xl text-sm transition-colors shadow-md active:scale-95">
              <Plus className="w-4 h-4" />
              Schedule
            </button>
          </div>
        </div>
        <p className="text-sky-200 text-sm mt-2">View, join, and schedule meetings with your students.</p>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/10 border border-white/20 rounded-xl p-3">
            <CalendarCheck className="w-4 h-4 text-white/70 mb-1" />
            <div className="text-2xl font-bold">{loading ? '…' : upcomingCount}</div>
            <div className="text-xs text-white/60">Upcoming</div>
          </div>
          <div className="bg-white/10 border border-white/20 rounded-xl p-3">
            <CalendarX className="w-4 h-4 text-white/70 mb-1" />
            <div className="text-2xl font-bold">{loading ? '…' : pastCount}</div>
            <div className="text-xs text-white/60">Past</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Tabs & search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {([
            { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
            { key: 'past',     label: 'Past',     count: pastCount },
          ] as const).map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
                ${tab === t.key ? 'bg-white text-[#0d1b4b] shadow-sm ring-1 ring-gray-200/80' : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'}`}>
              {t.label}
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold
                ${tab === t.key ? 'bg-sky-100 text-sky-700' : 'bg-gray-200 text-gray-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search meetings…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d1b4b] bg-white" />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
          <Spinner /> <span className="text-sm">Loading meetings…</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <CalendarDays className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-base font-medium">
            {search ? 'No meetings match your search.' : tab === 'upcoming' ? 'No upcoming meetings.' : 'No past meetings.'}
          </p>
          {tab === 'upcoming' && !search && (
            <button type="button" onClick={() => setShowModal(true)}
              className="mt-4 inline-flex items-center gap-2 bg-[#0d1b4b] hover:bg-[#152258] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-md">
              <Plus className="w-4 h-4" /> Schedule your first meeting
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered
            .sort((a, b) => {
              const da = new Date(`${a.scheduledDate}T${a.scheduledTime}`).getTime();
              const db = new Date(`${b.scheduledDate}T${b.scheduledTime}`).getTime();
              return tab === 'upcoming' ? da - db : db - da;
            })
            .map(m => <MeetingCard key={normalId(m)} meeting={m} onDelete={handleDelete} />)}
        </div>
      )}
    </div>
  );
}
