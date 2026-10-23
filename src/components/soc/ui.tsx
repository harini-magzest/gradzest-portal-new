import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { ApiError } from '../../api';

// Shared building blocks for the SOC tabs, so a failure looks and behaves the same everywhere: it is SHOWN (with a way
// to retry) instead of being swallowed and leaving a blank section that looks like "no data".

// Turns whatever was thrown into a sentence a person can act on.
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return 'The server is temporarily rate-limiting requests. Wait a few seconds and retry.';
    if (e.status === 403) return e.message && e.message !== 'Request failed' ? e.message : 'You are not authorised to see this.';
    if (e.status === 401) return 'Your session has expired. Sign in again.';
    if (e.status >= 500) return `The server hit a problem${e.message ? ` (${e.message})` : ''}. Retry in a moment.`;
    return e.message || 'The request failed.';
  }
  const msg = e instanceof Error ? e.message : String(e || '');
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Cannot reach the server. Check your connection and retry.';
  return msg || 'Something went wrong.';
}

export function ErrorBanner({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  if (!message) return null;
  return (
    <div role="alert" className={`flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl ${compact ? 'px-3 py-2' : 'p-4'}`}>
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-700 flex-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:bg-red-100 rounded-lg px-2 py-1 flex-shrink-0">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      )}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />{label}</div>;
}

export function EmptyState({ icon: Icon, title, hint, children }: { icon: any; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <Icon className="w-10 h-10 text-gray-200 mb-3" />
      <p className="text-sm font-semibold text-gray-500">{title}</p>
      {hint && <p className="text-xs text-gray-500 mt-1 max-w-sm">{hint}</p>}
      {children}
    </div>
  );
}

// A titled group of cards on the dark page. The tab's cards are h3s under it, so the page reads as an outline
// (h1 SOC → h2 section → h3 card) instead of a flat run of same-level headings.
export function Section({ title, hint, actions, children }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={id} className="text-sm font-semibold text-gray-100">{title}</h2>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// A white card with an h3 title, for use inside a Section.
export function Card({ title, icon: Icon, hint, actions, children, className = '' }: {
  title: string; icon?: any; hint?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-purple-600" aria-hidden="true" />}{title}</h3>
          {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

// "3 views", "1 view"
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Lets an async load tell whether it is still the newest one when it settles. Typing in a filter box or switching a
 * period can start a second request before the first returns, and responses do not always come back in order; without
 * this the slower, older answer overwrites the newer one and the screen shows results for a filter that is no longer set.
 *
 *   const begin = useLatestRequest();
 *   const isCurrent = begin();
 *   const data = await api.something();
 *   if (!isCurrent()) return;
 */
export function useLatestRequest() {
  const seq = useRef(0);
  return useCallback(() => {
    const mine = ++seq.current;
    return () => mine === seq.current;
  }, []);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog that behaves like one: announced as a dialog with a name, Escape closes it, Tab stays inside it, focus moves in
 * when it opens and goes back to what opened it when it closes. A press on the dimmed backdrop closes it too, but only a
 * press that starts there, so selecting text and releasing the mouse outside the box does not dismiss it.
 */
export function Modal({ label, onClose, children, className = 'max-w-sm' }: {
  label: string; onClose: () => void; children: ReactNode; className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const el = box.current;
    const opener = document.activeElement as HTMLElement | null;
    // Something inside may already have asked for focus (autoFocus); only claim it when nothing did.
    if (el && !el.contains(document.activeElement)) el.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, []);

  return (
    <div role="presentation" className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className={`bg-white rounded-2xl shadow-xl w-full outline-none ${className}`}>
        {children}
      </div>
    </div>
  );
}

// A live feed row is read as a wall-clock time; once it is not from today the date is needed too, or a row loaded from
// an earlier day looks like it happened a moment ago.
export function formatEventTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return d.toDateString() === now.toDateString()
    ? time
    : `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${time}`;
}

// "30 Sep, 3 PM" for chart axes / "30 Sep" when the bucket is a whole day
export function formatBucket(bucket: string): string {
  const hasHour = bucket.includes('T');
  const d = new Date(hasHour ? `${bucket}Z` : `${bucket}T00:00:00Z`);
  if (isNaN(d.getTime())) return bucket;
  return hasHour
    ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', hour12: true })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
