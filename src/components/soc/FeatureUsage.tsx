import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import { ErrorBanner, errorText, plural } from './ui';

type Period = '24h' | '7d' | '30d';

interface Usage {
  totals: { events: number; activeUsers: number; uploads: number };
  pages: { file: string; views: number; users: number; example: string }[];
  features: { file: string; label: string; kind: string; uses: number; users: number }[];
  users: { userId: string; email: string; role: string; actions: number; distinctPages: number; lastActive: string }[];
}

// 'src/pages/admin/AdminStudents.tsx' -> 'Admin Students'
export function featureName(file: string): string {
  if (!file) return 'Unmapped page';
  const base = file.split('/').pop()!.replace(/\.tsx?$/, '');
  return base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function Bar({ value, max }: { value: number; max: number }) {
  return <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1"><div className="h-full bg-purple-500 rounded-full" style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} /></div>;
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      {sub && <p className="text-[11px] text-gray-500 mb-3">{sub}</p>}
      <div className={sub ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}

const KIND_VERB: Record<string, string> = { click: 'clicked', download: 'downloaded', form_submit: 'submitted' };

// What people actually use: most-visited pages, most-used buttons/actions, and the busiest accounts.
// Optionally scoped to one person (pass userId) to see exactly which features that account uses.
export default function FeatureUsage({ onInvestigateUser, userId }: { onInvestigateUser?: (id: string) => void; userId?: string }) {
  const [period, setPeriod] = useState<Period>('7d');
  const [data, setData] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api.soc.featureUsage(period, userId)
      .then(d => { if (!cancelled) setData(d); })
      // The previous period's numbers must not stay on screen under a failure for the one now selected.
      .catch(e => { if (!cancelled) { setData(null); setError(errorText(e)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, userId, attempt]);

  const pageMax = Math.max(1, ...(data?.pages || []).map(p => p.views));
  const featMax = Math.max(1, ...(data?.features || []).map(f => f.uses));
  const userMax = Math.max(1, ...(data?.users || []).map(u => u.actions));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {(['24h', '7d', '30d'] as Period[]).map(p => (
            <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === p ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{p}</button>
          ))}
        </div>
        {data && <p className="text-xs text-gray-400">{data.totals.events} actions · {data.totals.activeUsers} active {data.totals.activeUsers === 1 ? 'account' : 'accounts'} · {data.totals.uploads} upload{data.totals.uploads === 1 ? '' : 's'}</p>}
      </div>
      {error && <ErrorBanner message={error} onRetry={retry} />}
      {loading ? <div className="p-8 text-center text-sm text-gray-500">Loading…</div> : data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Most-used pages" sub="By number of times opened">
            {data.pages.length === 0 ? <p className="text-sm text-gray-500 italic">No page views in this period.</p> : (
              <div className="space-y-3">
                {data.pages.map(p => (
                  <div key={p.file}>
                    <div className="flex justify-between gap-2 text-xs"><span className="font-medium text-gray-800 truncate min-w-0" title={p.file}>{featureName(p.file)}</span><span className="text-gray-500 flex-shrink-0">{plural(p.views, 'view')} · {plural(p.users, 'person', 'people')}</span></div>
                    <Bar value={p.views} max={pageMax} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Most-used buttons and actions" sub="What was clicked, downloaded or submitted, and on which page">
            {data.features.length === 0 ? <p className="text-sm text-gray-500 italic">No labelled clicks in this period.</p> : (
              <div className="space-y-3">
                {data.features.map((f, i) => (
                  <div key={`${f.file}|${f.label}|${f.kind}|${i}`}>
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="text-gray-800 truncate min-w-0"><span className="font-medium">“{f.label}”</span> <span className="text-gray-500">{KIND_VERB[f.kind] || f.kind} on {featureName(f.file)}</span></span>
                      <span className="text-gray-500 flex-shrink-0">{f.uses}× · {f.users} {f.users === 1 ? 'person' : 'people'}</span>
                    </div>
                    <Bar value={f.uses} max={featMax} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          {!userId && (
            <div className="lg:col-span-2">
              <Card title="Busiest accounts" sub="Click an account to see its details and respond">
                {data.users.length === 0 ? <p className="text-sm text-gray-500 italic">No activity in this period.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-gray-500 uppercase"><th className="pb-2 font-semibold">Account</th><th className="pb-2 font-semibold">Role</th><th className="pb-2 font-semibold text-right">Actions</th><th className="pb-2 font-semibold text-right">Pages</th><th className="pb-2 font-semibold text-right">Last active</th></tr></thead>
                      <tbody>
                        {data.users.map(u => (
                          <tr key={u.userId} className="border-t border-gray-50">
                            <td className="py-2">
                              <button type="button" onClick={() => onInvestigateUser?.(u.userId)} className="font-medium text-purple-700 hover:underline">{u.email}</button>
                              <Bar value={u.actions} max={userMax} />
                            </td>
                            <td className="py-2 capitalize text-gray-500">{u.role}</td>
                            <td className="py-2 text-right text-gray-700">{u.actions}</td>
                            <td className="py-2 text-right text-gray-500">{u.distinctPages}</td>
                            <td className="py-2 text-right text-gray-500 whitespace-nowrap">{new Date(u.lastActive).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
