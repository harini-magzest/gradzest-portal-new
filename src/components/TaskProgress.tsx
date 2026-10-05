import { useState, useEffect } from 'react';
import { Send, Plus, ArrowRight, MessageCircle } from 'lucide-react';
import { api } from '../api';

export type TaskStatus = 'pending' | 'in_progress' | 'on_hold' | 'completed';

export const TASK_STATUS: Record<TaskStatus, { label: string; chip: string; dot: string }> = {
  pending:     { label: 'Pending',     chip: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400' },
  in_progress: { label: 'In progress', chip: 'bg-blue-50 text-blue-700',      dot: 'bg-blue-500' },
  on_hold:     { label: 'On hold',     chip: 'bg-amber-50 text-amber-700',    dot: 'bg-amber-500' },
  completed:   { label: 'Completed',   chip: 'bg-green-50 text-green-700',    dot: 'bg-green-500' },
};
const STATUS_ORDER: TaskStatus[] = ['pending', 'in_progress', 'on_hold', 'completed'];

const ROLE_CHIP: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700', counselor: 'bg-green-100 text-green-700', student: 'bg-blue-100 text-blue-700',
};

export function TaskStatusPill({ status }: { status: string }) {
  const s = TASK_STATUS[status as TaskStatus] || TASK_STATUS.pending;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5 whitespace-nowrap ${s.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  );
}

function timeAgo(at: string | Date) {
  const secs = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 7) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type Entry =
  | { kind: 'created'; id: string; at: string; by: string }
  | { kind: 'status'; id: string; at: string; by: string; role: string; from: string; to: string; note: string }
  | { kind: 'comment'; id: string; at: string; by: string; role: string; text: string };

// Everything that happened on the task, oldest first
function taskEntries(task: any): Entry[] {
  const out: Entry[] = [];
  if (task.createdAt) out.push({ kind: 'created', id: 'created', at: task.createdAt, by: task.assignedByName || '' });
  (task.history || []).forEach((h: any) => out.push({
    kind: 'status', id: h._id, at: h.createdAt, by: h.by, role: h.byRole, from: h.from, to: h.to, note: h.note || '',
  }));
  (task.comments || []).forEach((c: any) => out.push({
    kind: 'comment', id: c._id, at: c.createdAt, by: c.author, role: c.authorRole, text: c.text,
  }));
  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export const taskUpdateCount = (task: any) => (task.history?.length || 0) + (task.comments?.length || 0);

/** One-line summary of the most recent progress, for the collapsed task card. */
export function LatestTaskUpdate({ task }: { task: any }) {
  const last = taskEntries(task).filter(e => e.kind !== 'created').pop();
  if (!last) return <p className="text-xs text-gray-400 italic mt-1">No updates yet</p>;
  const text = last.kind === 'status'
    ? `${TASK_STATUS[last.to as TaskStatus]?.label || last.to}${last.note ? ` — ${last.note}` : ''}`
    : last.kind === 'comment' ? last.text : '';
  return (
    <p className="text-xs text-gray-500 mt-1 truncate">
      <span className="font-medium text-gray-700">{last.by || 'Someone'}</span>
      <span className="text-gray-400"> · {timeAgo(last.at)}: </span>{text}
    </p>
  );
}

/** Full progress history plus the form to post an update or move the task to another stage. */
export function TaskTimeline({ task, canUpdate, onChanged }: { task: any; canUpdate: boolean; onChanged: (t: any) => void }) {
  const [status, setStatus] = useState<TaskStatus>(task.status);
  // Follow changes made elsewhere (the card's checkbox, or a live update from the other side)
  useEffect(() => { setStatus(task.status); }, [task.status]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const entries = taskEntries(task);
  const statusChanged = status !== task.status;

  const submit = async () => {
    const text = note.trim();
    if (!statusChanged && !text) return;
    setSaving(true); setError('');
    try {
      const updated = statusChanged
        ? await api.tasks.update(task._id, { status, note: text })
        : await api.tasks.addComment(task._id, text);
      setNote('');
      onChanged(updated);
    } catch (err: any) { setError(err.message || 'Could not save the update.'); }
    setSaving(false);
  };

  return (
    <div className="bg-gray-50 border border-gray-100 border-t-0 rounded-b-xl px-4 pb-4 pt-3 space-y-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Progress</p>
      <ol className="relative max-h-72 overflow-y-auto pr-1">
        {entries.map((e, i) => (
          <li key={e.id} className="relative pl-6 pb-3 last:pb-0">
            {i < entries.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-px bg-gray-200" />}
            <span className={`absolute left-0 top-1 w-[15px] h-[15px] rounded-full border-2 border-white flex items-center justify-center ${
              e.kind === 'status' ? TASK_STATUS[e.to as TaskStatus]?.dot || 'bg-gray-400'
              : e.kind === 'comment' ? 'bg-white ring-1 ring-gray-300' : 'bg-gray-300'}`}>
              {e.kind === 'comment' && <MessageCircle className="w-2.5 h-2.5 text-gray-400" />}
              {e.kind === 'created' && <Plus className="w-2.5 h-2.5 text-white" />}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-800">{e.by || 'Someone'}</span>
              {e.kind !== 'created' && e.role && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${ROLE_CHIP[e.role] || ROLE_CHIP.student}`}>{e.role}</span>
              )}
              {e.kind === 'created' && <span className="text-xs text-gray-500">created this task</span>}
              {e.kind === 'status' && (
                <span className="text-xs text-gray-500 inline-flex items-center gap-1 flex-wrap">
                  moved it <TaskStatusPill status={e.from || 'pending'} /><ArrowRight className="w-3 h-3" /><TaskStatusPill status={e.to} />
                </span>
              )}
              <span className="text-[10px] text-gray-400 ml-auto" title={new Date(e.at).toLocaleString()}>{timeAgo(e.at)}</span>
            </div>
            {e.kind === 'status' && e.note && <p className="text-sm text-gray-700 mt-1 bg-white border border-gray-100 rounded-lg px-3 py-2 whitespace-pre-line">{e.note}</p>}
            {e.kind === 'comment' && <p className="text-sm text-gray-700 mt-1 bg-white border border-gray-100 rounded-lg px-3 py-2 whitespace-pre-line">{e.text}</p>}
          </li>
        ))}
      </ol>

      {canUpdate && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Task status">
            {STATUS_ORDER.map(s => (
              <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  status === s ? `${TASK_STATUS[s].chip} border-current` : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {TASK_STATUS[s].label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-end">
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder={statusChanged ? `What changed? (optional) — moving to ${TASK_STATUS[status].label}` : 'Post an update — e.g. "Called him, will send documents tomorrow"'}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 text-gray-900 placeholder-gray-400 bg-white resize-none" />
            <button type="button" onClick={submit} disabled={saving || (!statusChanged && !note.trim())}
              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center gap-1.5">
              {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {statusChanged ? 'Update' : 'Post'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
