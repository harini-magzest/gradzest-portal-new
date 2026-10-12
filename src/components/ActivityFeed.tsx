import { useEffect, useRef } from 'react';
import { Pause, Play, Trash2, Wifi, WifiOff, Bell } from 'lucide-react';
import { useActivityFeed, FilterType, ActivityEvent } from '../hooks/useActivityFeed';

// ── Color maps (spec-defined palette) ────────────────────────────────────────

const BADGE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  enquiry:   { bg: '#E6F1FB', text: '#0C447C', label: 'Enquiry'   },
  visa:      { bg: '#EEEDFE', text: '#3C3489', label: 'Visa'      },
  document:  { bg: '#FAEEDA', text: '#633806', label: 'Document'  },
  payment:   { bg: '#EAF3DE', text: '#27500A', label: 'Payment'   },
  offer:     { bg: '#E1F5EE', text: '#085041', label: 'Offer'     },
  interview: { bg: '#FAECE7', text: '#712B13', label: 'Interview' },
  alert:     { bg: '#FCEBEB', text: '#791F1F', label: 'Alert'     },
};

// Avatar background color per type (distinct initials circle color)
const AVATAR_COLOR: Record<string, string> = {
  enquiry:   '#0C447C',
  visa:      '#3C3489',
  document:  '#633806',
  payment:   '#27500A',
  offer:     '#085041',
  interview: '#712B13',
  alert:     '#791F1F',
};

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',       label: 'All'        },
  { key: 'enquiry',   label: 'Enquiries'  },
  { key: 'visa',      label: 'Visa'       },
  { key: 'document',  label: 'Documents'  },
  { key: 'payment',   label: 'Payments'   },
  { key: 'alert',     label: 'Alerts'     },
];

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 border-b border-gray-50 animate-pulse">
      <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-3 bg-gray-200 rounded w-28" />
          <div className="h-4 bg-gray-100 rounded-full w-16" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-48" />
        <div className="h-2.5 bg-gray-100 rounded w-32" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-14 flex-shrink-0" />
    </div>
  );
}

// ── Single feed row ───────────────────────────────────────────────────────────

function FeedItem({ event }: { event: ActivityEvent }) {
  const badge  = BADGE_STYLE[event.type] ?? BADGE_STYLE.alert;
  const avatar = AVATAR_COLOR[event.type] ?? '#555';

  const ts = new Date(event.createdAt);
  const time = ts.toLocaleTimeString('en-IN', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div
      className="flex items-start gap-3 px-4 py-3.5 border-b border-gray-50
                 hover:bg-gray-50/60 transition-colors duration-150
                 animate-[slideIn_0.25s_ease-out]"
    >
      {/* Initials avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center
                   text-white text-xs font-bold flex-shrink-0 select-none"
        style={{ backgroundColor: avatar }}
      >
        {event.initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-semibold text-gray-900 truncate">
            {event.studentName}
          </span>
          {/* Type badge */}
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: badge.bg, color: badge.text }}
          >
            {badge.label}
          </span>
        </div>
        <p className="text-xs text-gray-700 leading-snug">{event.action}</p>
        {event.detail && (
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{event.detail}</p>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums pt-0.5">
        {time}
      </span>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ counts }: { counts: Record<string, number | undefined> }) {
  const stats = [
    { key: 'enquiry',  label: 'Enquiries', color: '#0C447C' },
    { key: 'visa',     label: 'Visa',      color: '#3C3489' },
    { key: 'payment',  label: 'Payments',  color: '#27500A' },
    { key: 'alert',    label: 'Alerts',    color: '#791F1F' },
  ];

  return (
    <div className="flex items-center divide-x divide-gray-100 border-t border-gray-100 bg-gray-50/60">
      {stats.map(s => (
        <div key={s.key} className="flex-1 py-2 px-3 text-center">
          <p className="text-base font-bold" style={{ color: s.color }}>
            {counts[s.key] ?? 0}
          </p>
          <p className="text-[10px] text-gray-400 font-medium">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivityFeed() {
  const {
    events, isLive, isPaused, isLoading,
    togglePause, clearFeed,
    setFilter, filter, counts, pendingCount,
  } = useActivityFeed();

  // Auto-scroll list to top when a new event arrives
  const listRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(events.length);
  useEffect(() => {
    if (events.length > prevLen.current && listRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    prevLen.current = events.length;
  }, [events.length]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          {/* Live indicator */}
          <span className="relative flex h-2.5 w-2.5">
            {isLive ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-300" />
            )}
          </span>
          <h2 className="text-sm font-bold text-gray-900">Live Activity Feed</h2>
          {isLive
            ? <span className="text-[10px] text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded-full">Connected</span>
            : <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded-full">Offline</span>
          }
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          {/* Pending badge when paused */}
          {isPaused && pendingCount > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
              +{pendingCount} waiting
            </span>
          )}
          <button
            onClick={togglePause}
            title={isPaused ? 'Resume feed' : 'Pause feed'}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={clearFeed}
            title="Clear feed"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {isLive
            ? <Wifi    className="w-3.5 h-3.5 text-green-500" />
            : <WifiOff className="w-3.5 h-3.5 text-gray-300" />
          }
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-1 px-4 pt-3 pb-2 border-b border-gray-100 overflow-x-auto scrollbar-hide">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition-all ${
              filter === f.key
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Feed list ── */}
      <div ref={listRef} className="flex-1 overflow-y-auto" style={{ maxHeight: '480px', minHeight: '200px' }}>
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
        ) : events.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Bell className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm font-semibold text-gray-500">No activity yet</p>
            <p className="text-xs text-gray-400 mt-1">
              {filter !== 'all'
                ? `No ${filter} events to show. Try the "All" filter.`
                : 'Events will appear here in real time as students take actions.'}
            </p>
          </div>
        ) : (
          events.map(e => <FeedItem key={e._id} event={e} />)
        )}
      </div>

      {/* ── Stats bar ── */}
      <StatsBar counts={counts} />
    </div>
  );
}
