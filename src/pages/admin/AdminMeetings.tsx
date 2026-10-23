import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CalendarDays, Plus, X, Video, ExternalLink, Trash2, Clock,
  Users, Search, Check, RefreshCw, CalendarCheck, CalendarX,
} from 'lucide-react';
import { api } from '../../api';
import { usePortalName } from '../../hooks/usePortalName';
import { openExternal } from '../../lib/safeUrl';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import ListPager from '../../components/ListPager';

// ── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ white = false }: { white?: boolean }) {
  return (
    <span className={`w-4 h-4 border-2 rounded-full animate-spin inline-block shrink-0
      ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-gray-600'}`} />
  );
}

function normalId(obj: any) { return (obj?._id || obj?.id)?.toString() ?? ''; }

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> = {
  teams:  { label: 'Microsoft Teams', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '🟣' },
  zoom:   { label: 'Zoom',            color: 'bg-blue-100   text-blue-700   border-blue-200',   icon: '🔵' },
  meet:   { label: 'Google Meet',     color: 'bg-green-100  text-green-700  border-green-200',  icon: '🟢' },
  other:  { label: 'Other',           color: 'bg-gray-100   text-gray-700   border-gray-200',   icon: '⚫' },
};
// Display-only: Jitsi meetings are created from the Students page with an auto-generated link
const JITSI_META = { label: 'Jitsi Meet', color: 'bg-sky-100 text-sky-700 border-sky-200', icon: '🎥' };

function isFuture(date: string, time: string) {
  const dt = new Date(`${date}T${time}`);
  return dt > new Date();
}

function isSessionActive(date: string, time: string, duration: number) {
  const end = new Date(`${date}T${time}`).getTime() + (duration || 60) * 60 * 1000;
  return Date.now() <= end;
}

function formatDateTime(date: string, time: string) {
  const dt = new Date(`${date}T${time}`);
  return dt.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Schedule modal ────────────────────────────────────────────────────────────

function ScheduleModal({
  onClose, onCreated, students, counselors,
}: {
  onClose: () => void;
  onCreated: (m: any) => void;
  students: any[];
  counselors: any[];
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('60');
  const [platform, setPlatform] = useState<'teams' | 'zoom' | 'meet' | 'other'>('teams');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const everyone = [
    ...students.map(s => ({ ...s, _role: 'student' })),
    ...counselors.map(c => ({ ...c, _role: 'counselor' })),
  ];

  const filtered = everyone.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !time || !link) {
      setError('Title, date, time and meeting link are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const participants = everyone
        .filter(p => selectedIds.has(normalId(p)))
        .map(p => ({ userId: normalId(p), name: p.name, role: p._role, email: p.email }));
      const meeting = await api.meetings.create({ title, scheduledDate: date, scheduledTime: time, duration: parseInt(duration), platform, meetingLink: link, participants, notes });
      window.dispatchEvent(new CustomEvent('meeting:scheduled', { detail: meeting }));
      onCreated(meeting);
    } catch (err: any) {
      setError(err.message || 'Failed to schedule meeting.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400';

  return (
    <div role="presentation" className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-linear-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-xs">
              <CalendarDays className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Schedule Meeting</h2>
          </div>
          <button aria-label="Close" type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Meeting Title <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Application Review - Aryan Sharma" className={inputCls} />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} min={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Time <span className="text-red-500">*</span></label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Duration (minutes)</label>
            <select value={duration} onChange={e => setDuration(e.target.value)} className={`${inputCls} bg-white`} title="Duration">
              {['30','45','60','90','120'].map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(PLATFORM_META) as Array<'teams'|'zoom'|'meet'|'other'>).map(p => {
                const meta = PLATFORM_META[p];
                const selected = platform === p;
                return (
                  <button key={p} type="button" onClick={() => setPlatform(p)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all
                      ${selected ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-xs' : 'border-gray-200 text-gray-500 hover:border-purple-300 hover:bg-purple-50/50'}`}>
                    <span className="text-lg leading-none">{meta.icon}</span>
                    <span>{p === 'meet' ? 'Meet' : p === 'teams' ? 'Teams' : p === 'zoom' ? 'Zoom' : 'Other'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meeting link */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {PLATFORM_META[platform].label} Link <span className="text-red-500">*</span>
            </label>
            <input type="url" value={link} onChange={e => setLink(e.target.value)}
              placeholder={platform === 'teams' ? 'https://teams.microsoft.com/l/meetup-join/…' : platform === 'zoom' ? 'https://zoom.us/j/…' : 'https://meet.google.com/…'}
              className={inputCls} />
          </div>

          {/* Participants */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Participants <span className="text-gray-400 text-xs font-normal">({selectedIds.size} selected)</span>
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students & counselors…"
                className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1.5 border border-gray-100 rounded-xl p-2 bg-gray-50">
              {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No results</p>}
              {filtered.map(p => {
                const id = normalId(p);
                const checked = selectedIds.has(id);
                return (
                  <label key={id}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-colors
                      ${checked ? 'bg-purple-50 border-purple-200' : 'bg-white border-transparent hover:bg-gray-100'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(id)} className="w-4 h-4 accent-purple-600 shrink-0" />
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0
                      ${p._role === 'counselor' ? 'bg-linear-to-br from-purple-500 to-indigo-600' : 'bg-linear-to-br from-blue-500 to-indigo-600'}`}>
                      {p.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 truncate">{p._role} · {p.email}</p>
                    </div>
                    {checked && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Agenda or instructions for participants…"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400 resize-none" />
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-60 shadow-md transition-all">
              {saving ? <><Spinner white />Scheduling…</> : <><CalendarDays className="w-4 h-4" />Schedule Meeting</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Meeting card ──────────────────────────────────────────────────────────────

function MeetingCard({ meeting, onDelete, onJoin }: {
  meeting: any;
  onDelete: (id: string) => void;
  onJoin: (link: string) => void;
}) {
  const upcoming = isFuture(meeting.scheduledDate, meeting.scheduledTime);
  const active = isSessionActive(meeting.scheduledDate, meeting.scheduledTime, meeting.duration);
  const [showExpired, setShowExpired] = useState(false);
  const meta = PLATFORM_META[meeting.platform] ?? (meeting.platform === 'jitsi' ? JITSI_META : PLATFORM_META.other);
  const [deleting, setDeleting] = useState(false);

  const handleJoin = () => {
    if (!active) {
      setShowExpired(true);
      setTimeout(() => setShowExpired(false), 3000);
      return;
    }
    onJoin(meeting.meetingLink);
  };

  const handleDelete = async () => {
    if (!window.confirm('Cancel this meeting?')) return;
    setDeleting(true);
    await onDelete(normalId(meeting));
  };

  return (
    <div className={`bg-white rounded-2xl border shadow-xs overflow-hidden transition-all hover:shadow-md
      ${upcoming ? 'border-gray-100' : 'border-gray-100 opacity-75'}`}>
      {/* Top color bar */}
      <div className={`h-1.5 ${upcoming ? 'bg-linear-to-r from-purple-500 to-indigo-500' : 'bg-gray-200'}`} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${meta.color}`}>
                {meta.icon} {meta.label}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                upcoming ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {upcoming ? 'Upcoming' : 'Past'}
              </span>
            </div>
            <h3 className="text-base font-bold text-gray-900 truncate">{meeting.title}</h3>
          </div>
          <button aria-label="Delete" type="button" onClick={handleDelete} disabled={deleting}
            className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
            {deleting ? <Spinner /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Date & time */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <Clock className="w-4 h-4 text-gray-400 shrink-0" />
          <span>{formatDateTime(meeting.scheduledDate, meeting.scheduledTime)}</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">{meeting.duration || 60} min</span>
        </div>

        {/* Participants */}
        {meeting.participants?.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500">{meeting.participants.length} participant{meeting.participants.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {meeting.participants.map((p: any, i: number) => (
                <span key={i}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium
                    ${p.role === 'counselor' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                  <span>{p.role === 'counselor' ? '🟣' : '🔵'}</span>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {meeting.notes && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3 line-clamp-2">{meeting.notes}</p>
        )}

        {/* Join button */}
        {showExpired ? (
          <div className="w-full py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm font-semibold text-red-600 text-center">
            Session expired — this meeting has ended
          </div>
        ) : (
          <button type="button" onClick={handleJoin}
            className={`w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all
              ${active
                ? 'bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg active:scale-[0.98]'
                : 'bg-gray-100 text-gray-500 cursor-default'
              }`}>
            <Video className="w-4 h-4" />
            {active ? <>Join {meta.label} Meeting<ExternalLink className="w-3.5 h-3.5 opacity-70" /></> : 'Session Ended'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

// Meetings come from the server a page at a time (server/routes/meetings.js)
const PAGE_SIZE = 30;

// This browser's clock as YYYY-MM-DDTHH:MM: meeting times are local, so "upcoming" is decided against it
function localNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminMeetings() {
  const { portal } = usePortalName();
  // This page of the tab, how many match, and how many meetings each tab holds
  const [meetings, setMeetings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [pastCount, setPastCount] = useState(0);
  const [page, setPage] = useState(1);
  const [students, setStudents] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');

  const searchText = useDebouncedValue(search.trim());
  const query = useMemo(() => ({ when: tab, q: searchText }), [tab, searchText]);
  useEffect(() => { setPage(1); }, [query]);

  // Only the newest request may fill the grid, however the answers arrive
  const latestRequest = useRef(0);
  const loadPage = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const res = await api.meetings.page({ ...query, now: localNow(), page, limit: PAGE_SIZE });
      if (request !== latestRequest.current) return;
      setMeetings(res.items); setTotal(res.total); setUpcomingCount(res.upcoming); setPastCount(res.past);
    } catch (err: any) {
      if (request === latestRequest.current) setError(err.message || 'Failed to load meetings.');
    }
  }, [query, page]);

  // First load and Refresh: the counselors and this page, behind the loading spinner
  const load = async () => {
    setLoading(true); setError('');
    try { setCounselors(await api.admin.counselors()); } catch (err: any) { setError(err.message || 'Failed to load meetings.'); }
    await loadPage();
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page opens; tabs, searches and pages load below
  useEffect(() => { load(); }, []);
  const firstPage = useRef(true);
  useEffect(() => { if (firstPage.current) { firstPage.current = false; return; } loadPage(); }, [loadPage]);

  // The student picker in the schedule dialog needs every student: fetched when the dialog first opens
  const studentsAsked = useRef(false);
  useEffect(() => {
    if (!showSchedule || studentsAsked.current) return;
    studentsAsked.current = true;
    api.admin.students().then(setStudents).catch(() => { studentsAsked.current = false; });
  }, [showSchedule]);

  const handleDelete = async (id: string) => {
    await api.meetings.delete(id);
    setMeetings(prev => prev.filter(m => normalId(m) !== id));
    loadPage();
  };

  const handleJoin = (link: string) => {
    openExternal(link);
  };


  return (
    <>
      {showSchedule && (
        <ScheduleModal
          students={students}
          counselors={counselors}
          onClose={() => setShowSchedule(false)}
          onCreated={() => { setShowSchedule(false); if (tab === 'upcoming') loadPage(); else setTab('upcoming'); }}
        />
      )}

      {/* Not space-y-6: Tailwind 4 puts that gap under every child but the last, and the last child here can be an empty,
          hidden box, which left 24px of extra space at the bottom. This is Tailwind 3's own rule (gap above each visible
          child after the first). */}
      <div className="[&>:not([hidden])~:not([hidden])]:mt-6">
        {/* Header */}
        <div className="bg-linear-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-xs">
                <CalendarDays className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
                <h1 className="text-2xl font-bold leading-tight">Meeting Schedule</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button aria-label="Refresh" type="button" onClick={load} disabled={loading}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={() => setShowSchedule(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-purple-700 font-semibold text-sm rounded-xl hover:bg-purple-50 transition-colors shadow-md">
                <Plus className="w-4 h-4" />Schedule Meeting
              </button>
            </div>
          </div>
          <p className="text-purple-200 text-sm mt-2">Schedule and manage video meetings with students and counselors.</p>

          {/* Stats */}
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

        {/* Error */}
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
                  ${tab === t.key ? 'bg-white text-purple-700 shadow-xs ring-1 ring-gray-200/80' : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'}`}>
                {t.label}
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold
                  ${tab === t.key ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-500'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search meetings or participants…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-white" />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
            <Spinner /> <span className="text-sm">Loading meetings…</span>
          </div>
        )}

        {/* Meeting grid */}
        {!loading && meetings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <CalendarDays className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-base font-medium">
              {search ? 'No meetings match your search.' : tab === 'upcoming' ? 'No upcoming meetings.' : 'No past meetings.'}
            </p>
            {tab === 'upcoming' && !search && (
              <button type="button" onClick={() => setShowSchedule(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors">
                <Plus className="w-4 h-4" /> Schedule your first meeting
              </button>
            )}
          </div>
        )}

        {!loading && meetings.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {meetings.map(m => (
              <MeetingCard key={normalId(m)} meeting={m} onDelete={handleDelete} onJoin={handleJoin} />
            ))}
          </div>
        )}
        {!loading && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden empty:hidden">
            <ListPager page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
          </div>
        )}
      </div>
    </>
  );
}
