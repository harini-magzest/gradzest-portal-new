import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_ORIGIN, getApiToken } from '../api';

// ── Types ────────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'enquiry' | 'visa' | 'document' | 'payment'
  | 'offer'   | 'interview' | 'alert';

export type FilterType = 'all' | ActivityType;

export interface ActivityEvent {
  _id: string;
  studentId?:   string;
  studentName:  string;
  initials:     string;
  type:         ActivityType;
  action:       string;
  detail:       string;
  createdAt:    string;
  counsellorId?: string;
  country?:     string;
  university?:  string;
}

export interface ActivityCounts {
  enquiry?:   number;
  visa?:      number;
  document?:  number;
  payment?:   number;
  offer?:     number;
  interview?: number;
  alert?:     number;
  [key: string]: number | undefined;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useActivityFeed() {
  const [allEvents, setAllEvents]   = useState<ActivityEvent[]>([]);
  const [isLive,    setIsLive]      = useState(false);
  const [isPaused,  setIsPaused]    = useState(false);
  const [isLoading, setIsLoading]   = useState(true);
  const [filter,    setFilter]      = useState<FilterType>('all');
  const [counts,    setCounts]      = useState<ActivityCounts>({});

  const socketRef  = useRef<Socket | null>(null);
  const pauseRef   = useRef(isPaused);           // ref so socket listener reads latest value
  const pendingRef = useRef<ActivityEvent[]>([]); // buffer while paused

  // Keep pauseRef in sync
  useEffect(() => { pauseRef.current = isPaused; }, [isPaused]);

  // ── Fetch initial events via REST ──────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);

    fetch(`${API_ORIGIN}/api/activity?limit=50`, {
      headers: { Authorization: `Bearer ${getApiToken()}` },
    })
      .then(res => res.json())
      .then(data => {
        setAllEvents(data.events || []);
        setCounts(data.counts   || {});
      })
      .catch(err => console.error('[useActivityFeed] Initial fetch failed:', err))
      .finally(() => setIsLoading(false));
  }, []);

  // ── Socket.io connection ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
      reconnectionAttempts: 10,
      reconnectionDelay:    2000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect',       () => setIsLive(true));
    socket.on('disconnect',    () => setIsLive(false));
    socket.on('connect_error', () => setIsLive(false));

    socket.on('new_activity', (event: ActivityEvent) => {
      if (pauseRef.current) {
        // Buffer events while paused; flush on resume
        pendingRef.current = [event, ...pendingRef.current];
      } else {
        setAllEvents(prev => [event, ...prev].slice(0, 200));
        setCounts(prev => ({
          ...prev,
          [event.type]: (prev[event.type] || 0) + 1,
        }));
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  // ── Resume: flush buffered events ─────────────────────────────────────────
  const togglePause = useCallback(() => {
    setIsPaused(was => {
      const resuming = was; // if it was paused, we're now resuming
      if (resuming && pendingRef.current.length > 0) {
        const pending = pendingRef.current;
        pendingRef.current = [];
        setAllEvents(prev => [...pending, ...prev].slice(0, 200));
        pending.forEach(e =>
          setCounts(prev => ({
            ...prev,
            [e.type]: (prev[e.type] || 0) + 1,
          }))
        );
      }
      return !was;
    });
  }, []);

  const clearFeed = useCallback(() => {
    setAllEvents([]);
    pendingRef.current = [];
  }, []);

  // ── Derived: apply filter ─────────────────────────────────────────────────
  const events = filter === 'all'
    ? allEvents
    : allEvents.filter(e => e.type === filter);

  const pendingCount = pendingRef.current.length;

  return {
    events,
    allEvents,
    isLive,
    isPaused,
    isLoading,
    togglePause,
    clearFeed,
    setFilter,
    filter,
    counts,
    pendingCount,
  };
}
