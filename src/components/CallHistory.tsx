import { useCallback, useEffect, useState } from 'react';
import {
  PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, Play, Pause, RefreshCw, Info, Download, ArrowRight,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSignedUrl } from '../hooks/useSignedUrl';
import SignedFileLink from './SignedFileLink';
import { CallSummaryBox, callNeedsSummary, canSummarizeCall } from './CallSummary';

const CHANNEL_LABEL: Record<string, string> = {
  incoming: 'Incoming', click_to_call: 'Click to Call', whatsapp: 'WhatsApp',
};

const fmtDuration = (s: number) => (s ? `${Math.floor(s / 60)}m ${s % 60}s` : '');
const fmtWhen = (d: string) => {
  const date = new Date(d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
};
// Mounted when Play is pressed, so the recording's signed link (good for five minutes) is fetched right then
function RecordingPlayer({ url, onEnded }: { url: string; onEnded: () => void }) {
  const { src, failed } = useSignedUrl(url);
  if (failed) return <p className="text-xs text-red-600 mt-3">This recording could not be loaded.</p>;
  if (!src) return <p className="text-xs text-gray-400 mt-3">Loading recording…</p>;
  return <audio controls autoPlay src={src} className="w-full mt-3 h-9" onEnded={onEnded} />;
}

/** Past calls (in-app Gradzest calls + Tata Smartflo phone calls) with recordings. */
export default function CallHistory() {
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const [days, setDays] = useState(30);
  const [userId, setUserId] = useState('');
  const [data, setData] = useState<{ calls: any[]; smartflo: { configured: boolean; error: string }; canSeeAll: boolean } | null>(null);
  const [people, setPeople] = useState<{ _id: string; name: string; group: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api.chat.callHistory(days, userId || undefined)); }
    catch (err: any) { setError(err.message || 'Could not load call history.'); }
    finally { setLoading(false); }
  }, [days, userId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener('call:summary-saved', load);
    return () => window.removeEventListener('call:summary-saved', load);
  }, [load]);

  // Admins who can see everyone get a person filter
  const canSeeAll = data?.canSeeAll;
  useEffect(() => {
    if (!canSeeAll || people.length) return;
    Promise.all([api.tasks.assignees().catch(() => []), api.admin.students().catch(() => [])]).then(([staff, students]) => {
      const dept: Record<string, string> = { counselor: 'Counselors', appteam: 'Application Team', admin: 'Admins' };
      setPeople([
        ...staff.map((s: any) => ({ _id: s._id, name: s.name, group: dept[s.dept] || 'Staff' })),
        ...students.map((s: any) => ({ _id: String(s._id || s.id), name: s.name, group: 'Students' })),
      ]);
    });
  }, [canSeeAll, people.length]);

  const calls = data?.calls || [];
  const answered = calls.filter(c => c.status === 'answered').length;
  const withRec = calls.filter(c => c.recordingUrl).length;
  const needSummary = calls.filter(c => callNeedsSummary(c) && canSummarizeCall(c, me, user?.role)).length;
  const replaceCall = (updated: any) => setData(d => d && { ...d, calls: d.calls.map(c => c.id === updated.id ? updated : c) });
  const groups = Array.from(new Set(people.map(p => p.group)));

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Call history</h3>
          <p className="text-xs text-gray-500">
            {calls.length} calls · {answered} answered · {calls.length - answered} missed · {withRec} recorded
            {needSummary > 0 && <span className="text-amber-700 font-medium"> · {needSummary} need a summary</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canSeeAll && (
            <select value={userId} onChange={e => setUserId(e.target.value)} aria-label="Filter by person"
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700">
              <option value="">Everyone</option>
              {groups.map(g => (
                <optgroup key={g} label={g}>
                  {people.filter(p => p.group === g).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </optgroup>
              ))}
            </select>
          )}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5" role="tablist" aria-label="Time range">
            {[7, 30, 90].map(d => (
              <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${days === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {d}d
              </button>
            ))}
          </div>
          <button type="button" onClick={load} disabled={loading} aria-label="Refresh call history"
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {data?.smartflo?.error && (
        <p className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />Phone calls from Smartflo couldn't be loaded ({data.smartflo.error}). Showing in-app calls only.
        </p>
      )}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {!loading && calls.length === 0 ? (
        <div className="text-center py-10 bg-white border border-gray-100 rounded-xl">
          <PhoneOff className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No calls in the last {days} days.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {calls.map(c => {
            const outgoing = c.callerId === me;
            const incoming = c.calleeId === me;
            const missed = c.status !== 'answered';
            const Icon = missed ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
            const src = c.recordingUrl || '';
            return (
              <li key={c.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${missed ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                      {outgoing ? <>To {c.calleeName}</>
                        : incoming ? <>From {c.callerName}</>
                        : <>{c.callerName}<ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />{c.calleeName}</>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {fmtWhen(c.startedAt)}
                      {' · '}{missed ? (c.status === 'declined' ? 'Declined' : 'Missed') : fmtDuration(c.durationSec) || 'Answered'}
                      {' · '}{c.source === 'smartflo' ? `Phone${c.channel ? ` (${CHANNEL_LABEL[c.channel] || c.channel})` : ''}` : 'In-app'}
                    </p>
                  </div>
                  {src ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setPlaying(playing === c.id ? null : c.id)}
                        aria-label={playing === c.id ? 'Hide recording' : 'Play recording'}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${playing === c.id ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                        {playing === c.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}Recording
                      </button>
                      <SignedFileLink href={src} download target="_blank" rel="noopener noreferrer" aria-label="Download recording"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                        <Download className="w-3.5 h-3.5" />
                      </SignedFileLink>
                    </div>
                  ) : !missed && <span className="text-[11px] text-gray-400">No recording</span>}
                </div>
                {playing === c.id && src && (
                  <RecordingPlayer url={src} onEnded={() => setPlaying(null)} />
                )}
                <CallSummaryBox call={c} me={me} role={user?.role} onSaved={replaceCall} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
