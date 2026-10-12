import { useCallback, useEffect, useRef, useState } from 'react';

// Watches for a person walking away. The server is the authority (it refuses to renew an idle or over-age session, see
// server/lib/sessionPolicy.js); this hook is the courtesy on top: it warns before the limit, lets the person say "I'm still
// here", keeps the session alive while they really are working, and signs them out cleanly when the time is up.

export interface SessionTimeoutOptions {
  /** Only watch while someone is signed in. */
  enabled: boolean;
  /** How long without activity ends the session (from the server's session info). */
  idleMs: number;
  /** When the session ends no matter what (ISO date from the server). */
  expiresAt: string | null;
  /** Called once when the idle limit is reached. */
  onIdleTimeout: () => void;
  /** Called once when the hard end is reached. */
  onExpired: () => void;
  /** Called when the person says they are still here, and to renew the server's idle clock while they are active. */
  onKeepAlive: () => void;
  /** How long before the idle limit to start warning. */
  warnMs?: number;
  /** How long before the hard end to start warning. */
  warnEndMs?: number;
  /** Renew the server session at most this often while the person is active. */
  keepAliveEveryMs?: number;
}

export type TimeoutWarning = { kind: 'idle' | 'ending'; secondsLeft: number } | null;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function useSessionTimeout(opts: SessionTimeoutOptions): { warning: TimeoutWarning; stayActive: () => void } {
  const { enabled, idleMs, expiresAt, warnMs = 60_000, warnEndMs = 5 * 60_000, keepAliveEveryMs = 10 * 60_000 } = opts;
  const [warning, setWarning] = useState<TimeoutWarning>(null);

  // Latest callbacks and state without re-creating the timers every render
  const cb = useRef(opts);
  cb.current = opts;
  const lastActivity = useRef(Date.now());
  const lastKeepAlive = useRef(Date.now());
  const warningRef = useRef<TimeoutWarning>(null);
  const done = useRef(false);

  const stayActive = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    lastKeepAlive.current = now;
    done.current = false;
    warningRef.current = null;
    setWarning(null);
    cb.current.onKeepAlive();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    lastActivity.current = now;
    lastKeepAlive.current = now;
    done.current = false;

    // While the warning is showing, only the button counts: moving the mouse must not quietly cancel the countdown
    const onActivity = () => { if (!warningRef.current) lastActivity.current = Date.now(); };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true, capture: true }));

    const tick = () => {
      if (done.current) return;
      const t = Date.now();
      const idleLeft = idleMs - (t - lastActivity.current);
      const endLeft = expiresAt ? new Date(expiresAt).getTime() - t : Infinity;

      if (endLeft <= 0) { done.current = true; cb.current.onExpired(); return; }
      if (idleLeft <= 0) { done.current = true; cb.current.onIdleTimeout(); return; }

      let next: TimeoutWarning = null;
      if (idleLeft <= warnMs) next = { kind: 'idle', secondsLeft: Math.ceil(idleLeft / 1000) };
      else if (endLeft <= warnEndMs) next = { kind: 'ending', secondsLeft: Math.ceil(endLeft / 1000) };
      const prev = warningRef.current;
      if (next?.kind !== prev?.kind || next?.secondsLeft !== prev?.secondsLeft) {
        warningRef.current = next;
        setWarning(next);
      }

      // The person is really using the page: renew the server's idle clock now and then (its access token expires sooner
      // than the idle limit, so without this a reader who makes no requests would be refused on their next click)
      if (!next && t - lastActivity.current < keepAliveEveryMs && t - lastKeepAlive.current >= keepAliveEveryMs) {
        lastKeepAlive.current = t;
        cb.current.onKeepAlive();
      }
    };

    const timer = window.setInterval(tick, 1000);
    // A laptop waking from sleep or a tab coming back: judge the elapsed time straight away rather than at the next tick
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity, { capture: true } as EventListenerOptions));
      warningRef.current = null;
      setWarning(null);
    };
  }, [enabled, idleMs, expiresAt, warnMs, warnEndMs, keepAliveEveryMs]);

  return { warning, stayActive };
}
