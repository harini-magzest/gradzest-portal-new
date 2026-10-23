import { useCallback, useEffect, useState } from 'react';
import { PhoneCall, RefreshCw, AlertCircle, Info } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useCallContext } from '../context/CallContext';
import { CounselorPerformanceView, withCallSummary, PERIODS, Spinner } from './CounselorPerformanceView';

/** The signed-in counselor's own calls and activity — the same view admins get, defaulting to today. */
export default function MyCallPerformance() {
  const { user } = useAuth();
  const { lastMessageTime } = useCallContext();
  const [days, setDays] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api.counselors.myPerformance(days)); }
    catch (err: any) { setError(err.message || 'Could not load your calls.'); }
    setLoading(false);
  }, [days]);
  // Reload when a call is logged or a summary is saved from the post-call prompt
  useEffect(() => { load(); }, [load, lastMessageTime]);
  useEffect(() => {
    window.addEventListener('call:summary-saved', load);
    return () => window.removeEventListener('call:summary-saved', load);
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <PhoneCall className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-bold text-gray-900">My Calls &amp; Activity</h2>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" role="tablist" aria-label="Time range">
          {PERIODS.map(p => (
            <button key={p.days} type="button" role="tab" aria-selected={days === p.days} onClick={() => setDays(p.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${days === p.days ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={load} disabled={loading} aria-label="Refresh"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {loading ? <Spinner /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
      {data?.smartflo?.error && (
        <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 text-sky-800 rounded-xl px-4 py-3 text-sm">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />Phone calls couldn't be loaded ({data.smartflo.error}). Showing in-app calls only.
        </div>
      )}

      {data && (
        <CounselorPerformanceView data={data} me={String(user?.id ?? '')} role={user?.role}
          onCallSaved={(tid, c) => setData((d: any) => withCallSummary(d, tid, c))} />
      )}
      {!data && loading && <div className="flex justify-center py-10"><Spinner /></div>}
    </section>
  );
}
