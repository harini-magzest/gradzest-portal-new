import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, AlertTriangle } from 'lucide-react';
import { api } from '../../api';
import FollowupDraftModal from './FollowupDraftModal';

type Data = Awaited<ReturnType<typeof api.dashboards.counselorFollowups>>;

// The counselor's own work queue: leads that have stalled, applications stuck in one status,
// and tasks past their due date. Same signals the admin daily alerts use, scoped to this counselor.
export default function FollowupQueue() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [drafting, setDrafting] = useState<{ studentId: string; name: string } | null>(null);

  useEffect(() => {
    let live = true;
    api.dashboards.counselorFollowups()
      .then(d => { if (live) setData(d); })
      .catch(err => { if (live) setError(err.message || 'Could not load your follow-up queue.'); });
    return () => { live = false; };
  }, []);

  if (error) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!data) return <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-sm text-gray-400">Loading follow-ups…</div>;

  const total = data.stale.length + data.stuck.length + data.overdueTasks.length;
  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><ListChecks className="w-4 h-4" /> Follow-up queue</h2>
        <span className="text-xs text-gray-500">{total} item{total === 1 ? '' : 's'}</span>
      </div>
      {total === 0 ? (
        <p className="text-sm text-gray-400">Nothing needs follow-up right now.</p>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Stalled for {data.staleDays}+ days</p>
            <ul className="space-y-1.5 text-sm">
              {data.stale.slice(0, 8).map(s => (
                <li key={s.studentId}><Link className="text-blue-700 hover:underline" to={`/counselor/students?lead=${s.studentId}`}>{s.name}</Link> <span className="text-gray-400">· {s.days}d</span> <button type="button" onClick={() => setDrafting({ studentId: s.studentId, name: s.name })} className="ml-1 text-xs text-blue-700 hover:underline">Draft message</button></li>
              ))}
              {data.stale.length === 0 && <li className="text-gray-400">None</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Applications stuck</p>
            <ul className="space-y-1.5 text-sm">
              {data.stuck.slice(0, 8).map(a => (
                <li key={`${a.studentId}-${a.universityName}`}><span className="text-gray-800">{a.name}</span> <span className="text-gray-400">· {a.universityName || 'Application'} · {a.status.replace('_', ' ')} {a.days}d</span></li>
              ))}
              {data.stuck.length === 0 && <li className="text-gray-400">None</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> Overdue tasks</p>
            <ul className="space-y-1.5 text-sm">
              {data.overdueTasks.slice(0, 8).map(t => (
                <li key={t.id}><span className="text-gray-800">{t.title}</span> <span className="text-gray-400">· due {t.dueDate}{t.studentName ? ` · ${t.studentName}` : ''}</span></li>
              ))}
              {data.overdueTasks.length === 0 && <li className="text-gray-400">None</li>}
            </ul>
          </div>
        </div>
      )}
      {drafting && <FollowupDraftModal studentId={drafting.studentId} name={drafting.name} onClose={() => setDrafting(null)} />}
    </section>
  );
}
