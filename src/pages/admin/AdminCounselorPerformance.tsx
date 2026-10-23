import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Info, AlertCircle } from 'lucide-react';
import { api } from '../../api';
import { CounselorPerformanceView, withCallSummary, PERIODS, Spinner } from '../../components/CounselorPerformanceView';
import {
  CounselorProfileCard, CounselorStatsModal, counselorMetrics, normalId, type StatType,
} from './AdminCounselors';

export default function AdminCounselorPerformance() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api.admin.counselorPerformance(id, days)); }
    catch (err: any) { setError(err.message || 'Failed to load performance.'); }
    finally { setLoading(false); }
  }, [id, days]);

  useEffect(() => { load(); }, [load]);

  // Profile data (same as the Team page profile popup)
  const [profile, setProfile] = useState<{ counselor: any; students: any[]; applications: any[] } | null>(null);
  const [statsType, setStatsType] = useState<StatType | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const [c, st, ap] = await Promise.all([api.admin.counselors(), api.admin.students(), api.admin.applications()]);
      const counselor = c.find((x: any) => normalId(x) === id);
      setProfile(counselor ? { counselor, students: st, applications: ap } : null);
    } catch { setProfile(null); }
  }, [id]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const metrics = useMemo(
    () => profile ? counselorMetrics(profile.counselor, profile.students, profile.applications) : null,
    [profile],
  );

  const refresh = () => { load(); loadProfile(); };

  const sf = data?.smartflo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => navigate('/admin/counselors')} aria-label="Back to counselors"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{data?.counselor?.name || 'Counselor'} · Performance</h1>
          <p className="text-sm text-gray-500 truncate">{data?.counselor?.email}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" role="tablist" aria-label="Time range">
          {PERIODS.map(p => (
            <button key={p.days} type="button" role="tab" aria-selected={days === p.days} onClick={() => setDays(p.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${days === p.days ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={refresh} disabled={loading} aria-label="Refresh"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {loading ? <Spinner /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {profile && metrics && (
        <CounselorProfileCard
          counselor={profile.counselor}
          metrics={metrics}
          onChat={() => navigate('/admin/chat', { state: { openChatWith: { _id: id, name: profile.counselor.name } } })}
          onStatClick={setStatsType}
        />
      )}
      {profile && metrics && statsType && (
        <CounselorStatsModal counselor={profile.counselor} metrics={metrics} type={statsType} onClose={() => setStatsType(null)} />
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {sf && (!sf.configured || !sf.agentSet || sf.error) && (
        <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 text-sky-800 rounded-xl px-4 py-3 text-sm">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {sf.error ? `Smartflo calls could not be loaded: ${sf.error}. Showing in-app calls only.`
              : !sf.configured ? 'Smartflo is not connected yet. Add SMARTFLO_API_TOKEN to server/.env to include phone calls. Showing in-app calls only.'
              : 'Set this counselor\'s Smartflo agent (Counselors → Edit) to include their phone calls. Showing in-app calls only.'}
          </span>
        </div>
      )}

      {data && <CounselorPerformanceView data={data} onCallSaved={(tid, c) => setData((d: any) => withCallSummary(d, tid, c))} />}

      {!data && loading && <div className="flex justify-center py-16"><Spinner /></div>}
    </div>
  );
}
