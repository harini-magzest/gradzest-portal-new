import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { LEAD_STAGES } from './LeadStageSelect';

type Action = 'set_stage' | 'add_tag' | 'create_task' | 'reassign';
type Result = Awaited<ReturnType<typeof api.students.bulk>>;

const ACTION_LABELS: Record<Action, string> = {
  set_stage: 'Change lead stage', add_tag: 'Add a tag', create_task: 'Create a follow-up task', reassign: 'Reassign counselor',
};

const REASONS: Record<string, string> = {
  not_found: 'not found', forbidden: 'you do not manage this student', too_many_tags: 'already has the maximum number of tags',
};

function summary(r: Result): string {
  const bits = [`${r.updated} updated`];
  if (r.unchanged) bits.push(`${r.unchanged} already up to date`);
  if (r.skipped.length) bits.push(`${r.skipped.length} skipped`);
  return bits.join(' · ');
}

// Appears when students are ticked in a list. One action is applied to every ticked student; the result says what
// happened to each, so a student the user may not change never blocks the others.
export default function BulkActionBar({ ids, onClear, onDone, counselors }: {
  ids: string[];
  onClear: () => void;
  onDone: () => void;
  /** Pass the counselor list to offer "Reassign counselor" (admins only). */
  counselors?: { _id?: string; id?: string; name: string }[];
}) {
  const [action, setAction] = useState<Action>('set_stage');
  const [stage, setStage] = useState<string>(LEAD_STAGES[0].value);
  const [tag, setTag] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [counselorId, setCounselorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  if (ids.length === 0 && !result) return null;

  const actions: Action[] = counselors ? ['set_stage', 'add_tag', 'create_task', 'reassign'] : ['set_stage', 'add_tag', 'create_task'];

  const value = (): unknown => {
    if (action === 'set_stage') return stage;
    if (action === 'add_tag') return tag;
    if (action === 'create_task') return { title: taskTitle, dueDate: dueDate || undefined };
    return counselorId || null;
  };

  const ready = action === 'set_stage' || action === 'reassign'
    || (action === 'add_tag' && tag.trim()) || (action === 'create_task' && taskTitle.trim());

  const run = async () => {
    if (action === 'reassign' && !counselorId
      && !window.confirm(`Remove the counselor from ${ids.length} student${ids.length === 1 ? '' : 's'}?`)) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api.students.bulk({ ids, action, value: value() }));
      onClear();
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Could not apply that change.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white';

  return (
    <div className="bg-[#0d1b4b]/5 border border-[#0d1b4b]/15 rounded-2xl px-4 py-3 space-y-2" role="region" aria-label="Bulk actions">
      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">{ids.length} selected</span>
          <select value={action} onChange={e => setAction(e.target.value as Action)} aria-label="Action" className={field}>
            {actions.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
          {action === 'set_stage' && (
            <select value={stage} onChange={e => setStage(e.target.value)} aria-label="Lead stage" className={field}>
              {LEAD_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
          {action === 'add_tag' && <input value={tag} onChange={e => setTag(e.target.value)} maxLength={40} placeholder="Tag" aria-label="Tag" className={field} />}
          {action === 'create_task' && (
            <>
              <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} maxLength={120} placeholder="Task, e.g. Chase documents" aria-label="Task title" className={`${field} w-56`} />
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} aria-label="Due date" className={field} />
            </>
          )}
          {action === 'reassign' && counselors && (
            <select value={counselorId} onChange={e => setCounselorId(e.target.value)} aria-label="Counselor" className={field}>
              <option value="">Unassigned</option>
              {counselors.map(c => { const id = (c._id || c.id) as string; return <option key={id} value={id}>{c.name}</option>; })}
            </select>
          )}
          <button type="button" onClick={run} disabled={busy || !ready} className="px-4 py-1.5 rounded-lg bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-medium disabled:opacity-40">
            {busy ? 'Applying…' : 'Apply'}
          </button>
          <button type="button" onClick={onClear} className="text-sm text-gray-500 hover:text-gray-800">Clear selection</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {result && (
        <div role="status" className="flex items-start justify-between gap-3 text-sm">
          <div>
            <p className="font-medium text-gray-900">{ACTION_LABELS[result.action as Action]}: {summary(result)}</p>
            {result.skipped.length > 0 && (
              <ul className="mt-1 text-xs text-amber-800 list-disc list-inside">
                {result.skipped.slice(0, 5).map(s => <li key={s.id}>{s.name || 'A student'}: {REASONS[s.reason] || s.reason}</li>)}
                {result.skipped.length > 5 && <li>and {result.skipped.length - 5} more</li>}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => setResult(null)} aria-label="Dismiss" className="p-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
