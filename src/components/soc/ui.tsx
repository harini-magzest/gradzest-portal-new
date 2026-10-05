import { type ReactNode } from 'react';
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
  return <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />{label}</div>;
}

export function EmptyState({ icon: Icon, title, hint, children }: { icon: any; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <Icon className="w-10 h-10 text-gray-200 mb-3" />
      <p className="text-sm font-semibold text-gray-500">{title}</p>
      {hint && <p className="text-xs text-gray-400 mt-1 max-w-sm">{hint}</p>}
      {children}
    </div>
  );
}

// "3 views", "1 view"
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "30 Sep, 3 PM" for chart axes / "30 Sep" when the bucket is a whole day
export function formatBucket(bucket: string): string {
  const hasHour = bucket.includes('T');
  const d = new Date(hasHour ? `${bucket}Z` : `${bucket}T00:00:00Z`);
  if (isNaN(d.getTime())) return bucket;
  return hasHour
    ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', hour12: true })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
