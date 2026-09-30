import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Plus, Video, Clock, Users, ExternalLink,
  RefreshCw, X, Search, Check, ChevronRight, CalendarX,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MeetingPanelProps {
  theme: 'purple' | 'orange';
  meetingsPagePath: string;
  hideSchedule?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { label: string; icon: string }> = {
  teams: { label: 'Teams', icon: '🟣' },
  zoom:  { label: 'Zoom',  icon: '🔵' },
  meet:  { label: 'Meet',  icon: '🟢' },
  other: { label: 'Other', icon: '⚫' },
};

const THEME = {
  purple: {
    headerBg:  'from-purple-600 to-indigo-600',
    schedBtn:  'bg-white text-purple-700 hover:bg-purple-50',
    badge:     'bg-purple-100 text-purple-700',
    joinBtn:   'bg-purple-600 hover:bg-purple-700 text-white',
    dot:       'bg-purple-500',
    statText:  'text-purple-600',
    viewAll:   'text-purple-600 hover:text-purple-800',
    ring:      'focus:ring-purple-400',
    modalBtn:  'from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700',
    checkAccent:'accent-purple-600',
    checkBorder:'border-purple-200 bg-purple-50',
  },
  orange: {
    headerBg:  'from-orange-500 to-amber-500',
    schedBtn:  'bg-white text-orange-700 hover:bg-orange-50',
    badge:     'bg-orange-100 text-orange-700',
    joinBtn:   'bg-orange-500 hover:bg-orange-600 text-white',
    dot:       'bg-orange-500',
    statText:  'text-orange-600',
    viewAll:   'text-orange-600 hover:text-orange-800',
    ring:      'focus:ring-orange-400',
    modalBtn:  'from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600',
    checkAccent:'accent-orange-500',
    checkBorder:'border-orange-200 bg-orange-50',
  },
};

function isFuture(date: string, time: string) {
  return new Date(`${date}T${time}`) > new Date();
}

function isSessionActive(date: string, time: string, duration: number) {
  const end = new Date(`${date}T${time}`).getTime() + (duration || 60) * 60 * 1000;
  return Date.now() <= end;
}

function formatWhen(date: string, time: string) {
  const dt   = new Date(`${date}T${time}`);
  const now  = new Date();
  const tom  = new Date(now); tom.setDate(now.getDate() + 1);
  const todayStr    = now.toISOString().split('T')[0];
  const tomorrowStr = tom.toISOString().split('T')[0];
  const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (date === todayStr)    return `Today · ${timeStr}`;
  if (date === tomorrowStr) return `Tomorrow · ${timeStr}`;
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ` · ${timeStr}`;
}

function normalId(obj: any) { return (obj?._id || obj?.id)?.toString() ?? ''; }

// ── Schedule modal (compact) ──────────────────────────────────────────────────

function ScheduleModal({
  onClose, onCreated, theme,
}: {
  onClose: () => void;
  onCreated: (m: any) => void;
  theme: 'purple' | 'orange';
}) {
  const tc = THEME[theme];
  const [title, setTitle]       = useState('');
  const [date, setDate]         = useState('');
  const [time, setTime]         = useState('');
  const [duration, setDuration] = useState('60');
  const [platform, setPlatform] = useState<'teams'|'zoom'|'meet'|'other'>('teams');
  const [link, setLink]         = useState('');
  const [notes, setNotes]       = useState('');
  const [search, setSearch]     = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [participants, setParticipants] = useState<any[]>([]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const { user } = useAuth();

  useEffect(() => {
    const role = user?.role;
    if (role === 'admin' || role === 'appteam') {
      Promise.all([
        api.admin.students().catch(() => []),
        api.admin.counselors().catch(() => []),
      ]).then(([students, counselors]) => {
        setParticipants([
          ...students.map((s: any) => ({ ...s, _role: 'student' })),
          ...counselors.map((c: any) => ({ ...c, _role: 'counselor' })),
        ]);
      });
    } else if (role === 'counselor') {
      api.students.list().catch(() => []).then((students: any[]) => {
        setParticipants(students.map((s: any) => ({ ...s, _role: 'student' })));
      });
    }
  }, [user?.role]);

  const filtered = participants.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !time || !link) { setError('Title, date, time and link are required.'); return; }
    setSaving(true); setError('');
    try {
      const parts = participants
        .filter(p => selectedIds.has(normalId(p)))
        .map(p => ({ userId: normalId(p), name: p.name, role: p._role, email: p.email }));
      const m = await api.meetings.create({
        title, scheduledDate: date, scheduledTime: time,
        duration: parseInt(duration), platform, meetingLink: link,
        participants: parts, notes,
      });
      window.dispatchEvent(new CustomEvent('meeting:scheduled', { detail: m }));
      onCreated(m);
    } catch (err: any) {
      setError(err.message || 'Failed to schedule meeting.');
    } finally {
      setSaving(false);
    }
  };

  const inp = `w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${tc.ring} placeholder:text-gray-400`;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 bg-gradient-to-r ${tc.headerBg} rounded-t-2xl`}>
          <div className="flex items-center gap-2.5">
            <CalendarDays className="w-5 h-5 text-white" />
            <h2 className="text-base font-bold text-white">Schedule Meeting</h2>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Meeting title *" className={inp} />

          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]} className={inp} title="Date" />
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className={inp} title="Time" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select value={duration} onChange={e => setDuration(e.target.value)}
              className={`${inp} bg-white`} title="Duration">
              {['30','45','60','90','120'].map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
            <select value={platform} onChange={e => setPlatform(e.target.value as any)}
              className={`${inp} bg-white`} title="Platform">
              {Object.entries(PLATFORM_META).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>

          <input type="url" value={link} onChange={e => setLink(e.target.value)}
            placeholder={`${PLATFORM_META[platform].label} meeting link *`} className={inp} />

          {/* Participants */}
          {participants.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">
                Participants <span className="text-gray-400 font-normal">({selectedIds.size} selected)</span>
              </p>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none" />
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-1.5 bg-gray-50">
                {filtered.slice(0, 20).map(p => {
                  const id = normalId(p); const checked = selectedIds.has(id);
                  return (
                    <label key={id}
                      className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer border transition-colors ${
                        checked ? tc.checkBorder : 'bg-white border-transparent hover:bg-gray-100'
                      }`}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(id)}
                        className={`w-3.5 h-3.5 ${tc.checkAccent} flex-shrink-0`} />
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${
                        p._role === 'counselor' ? 'bg-purple-500' : 'bg-blue-500'
                      }`}>{p.name?.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{p._role}</p>
                      </div>
                      {checked && <Check className="w-3 h-3 text-green-500 flex-shrink-0" />}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)" rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none placeholder:text-gray-400" />

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${tc.modalBtn} disabled:opacity-60 shadow-md transition-all`}>
              {saving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</>
                : <><CalendarDays className="w-3.5 h-3.5" />Schedule</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Compact meeting card ───────────────────────────────────────────────────────

function MeetingCard({ meeting, theme }: { meeting: any; theme: 'purple' | 'orange' }) {
  const tc   = THEME[theme];
  const meta = PLATFORM_META[meeting.platform] ?? (meeting.platform === 'jitsi' ? { label: 'Jitsi', icon: '🎥' } : PLATFORM_META.other);
  const upcoming = isFuture(meeting.scheduledDate, meeting.scheduledTime);
  const active = isSessionActive(meeting.scheduledDate, meeting.scheduledTime, meeting.duration);
  const [showExpired, setShowExpired] = useState(false);

  const handleJoin = () => {
    if (!active) {
      setShowExpired(true);
      setTimeout(() => setShowExpired(false), 3000);
      return;
    }
    window.open(meeting.meetingLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`rounded-xl border bg-white overflow-hidden transition-all hover:shadow-sm ${
      upcoming ? 'border-gray-100' : 'border-gray-100 opacity-60'
    }`}>
      <div className={`h-1 ${upcoming ? tc.dot : 'bg-gray-200'}`} />
      <div className="p-3.5">
        <div className="flex items-start gap-2 mb-2">
          <span className="text-base leading-none flex-shrink-0 mt-0.5">{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{meeting.title}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3 flex-shrink-0" />
              {formatWhen(meeting.scheduledDate, meeting.scheduledTime)}
            </p>
          </div>
          {upcoming && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${tc.badge}`}>
              {meeting.duration || 60}m
            </span>
          )}
        </div>

        {meeting.participants?.length > 0 && (
          <div className="flex items-center gap-1 mb-3 text-[11px] text-gray-400">
            <Users className="w-3 h-3" />
            <span>{meeting.participants.length} participant{meeting.participants.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        {showExpired ? (
          <div className="w-full py-2 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-600 text-center">
            Session expired — this meeting has ended
          </div>
        ) : (
          <button type="button" onClick={handleJoin}
            className={`w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              active ? `${tc.joinBtn} shadow-sm` : 'bg-gray-100 text-gray-400 cursor-default'
            }`}>
            <Video className="w-3 h-3" />
            {active ? <>Join {meta.label}<ExternalLink className="w-3 h-3 opacity-70" /></> : 'Session Ended'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function MeetingPanel({ theme, meetingsPagePath, hideSchedule = false }: MeetingPanelProps) {
  const tc = THEME[theme];
  const [meetings, setMeetings]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAll, setShowAll]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api.meetings.list();
      setMeetings(all);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upcoming = meetings
    .filter(m => isFuture(m.scheduledDate, m.scheduledTime))
    .sort((a, b) =>
      new Date(`${a.scheduledDate}T${a.scheduledTime}`).getTime() -
      new Date(`${b.scheduledDate}T${b.scheduledTime}`).getTime()
    );

  const todayCount = upcoming.filter(m => m.scheduledDate === new Date().toISOString().split('T')[0]).length;
  const displayed  = showAll ? upcoming : upcoming.slice(0, 4);

  return (
    <>
      {showSchedule && (
        <ScheduleModal
          theme={theme}
          onClose={() => setShowSchedule(false)}
          onCreated={m => { setMeetings(prev => [...prev, m]); setShowSchedule(false); }}
        />
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`bg-gradient-to-r ${tc.headerBg} px-4 py-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-white" />
              <h2 className="text-sm font-bold text-white">Meetings</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={load} disabled={loading}
                className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 text-white ${loading ? 'animate-spin' : ''}`} />
              </button>
              {!hideSchedule && (
                <button type="button" onClick={() => setShowSchedule(true)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tc.schedBtn}`}>
                  <Plus className="w-3.5 h-3.5" /> Schedule
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/15 rounded-xl px-3 py-2 text-center">
              <p className="text-xl font-bold text-white">{loading ? '…' : upcoming.length}</p>
              <p className="text-[10px] text-white/70">Upcoming</p>
            </div>
            <div className="bg-white/15 rounded-xl px-3 py-2 text-center">
              <p className="text-xl font-bold text-white">{loading ? '…' : todayCount}</p>
              <p className="text-[10px] text-white/70">Today</p>
            </div>
          </div>
        </div>

        {/* Meeting list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5" style={{ maxHeight: '480px' }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-3.5 animate-pulse">
                <div className="flex gap-2 mb-2">
                  <div className="w-5 h-5 bg-gray-200 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-7 bg-gray-100 rounded-lg" />
              </div>
            ))
          ) : displayed.length > 0 ? (
            displayed.map(m => (
              <MeetingCard key={normalId(m)} meeting={m} theme={theme} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarX className={`w-10 h-10 mb-2 ${tc.statText} opacity-30`} />
              <p className="text-sm font-medium text-gray-500">No upcoming meetings</p>
              {!hideSchedule && (
                <button type="button" onClick={() => setShowSchedule(true)}
                  className={`mt-3 text-xs font-semibold ${tc.viewAll} hover:underline`}>
                  + Schedule one now
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && upcoming.length > 4 && (
          <div className="px-4 py-2.5 border-t border-gray-100">
            <button type="button" onClick={() => setShowAll(s => !s)}
              className={`text-xs font-semibold ${tc.viewAll} transition-colors`}>
              {showAll ? 'Show less' : `Show ${upcoming.length - 4} more`}
            </button>
          </div>
        )}
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">{meetings.length} total</span>
          <Link to={meetingsPagePath}
            className={`inline-flex items-center gap-1 text-xs font-semibold ${tc.viewAll} transition-colors`}>
            View all <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </>
  );
}
