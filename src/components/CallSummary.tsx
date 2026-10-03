import { useState } from 'react';
import { FileText, Pencil, AlertCircle, X } from 'lucide-react';
import { api } from '../api';

export const callNeedsSummary = (c: any) => c.status === 'answered' && !c.summary;

/** Staff can summarise answered calls they took part in (Smartflo calls are already scoped to their own agent). */
export const canSummarizeCall = (c: any, me: string, role?: string) =>
  !!me && role !== 'student' && c.status === 'answered' && (c.source === 'smartflo' || c.callerId === me || c.calleeId === me);

const otherPartyOf = (c: any, me: string) => (c.callerId === me ? c.calleeName : c.callerName);

function SummaryForm({ initial, saving, error, onSave, onCancel, autoFocus = true }: {
  initial: string; saving: boolean; error: string; onSave: (text: string) => void; onCancel?: () => void; autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="space-y-2">
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus={autoFocus} maxLength={4000}
        placeholder="What did you discuss? Decisions, next steps, follow-ups…"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 text-gray-900 placeholder-gray-400 bg-white resize-y" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>}
        <button type="button" onClick={() => onSave(text)} disabled={saving || !text.trim()}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1.5">
          {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}Save summary
        </button>
      </div>
    </div>
  );
}

/** The summary under a call in a list: shows it, flags a missing one, and lets the right people write or edit it. */
export function CallSummaryBox({ call, me, role, onSaved }: { call: any; me: string; role?: string; onSaved: (c: any) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editable = canSummarizeCall(call, me, role);

  const save = async (text: string) => {
    setSaving(true); setError('');
    try {
      const r = await api.chat.saveCallSummary(call.id, text.trim(), { otherPartyName: otherPartyOf(call, me), startedAt: call.startedAt });
      onSaved({ ...call, summary: r.summary, summaryBy: r.summaryBy, summaryAt: r.summaryAt });
      setEditing(false);
    } catch (err: any) { setError(err.message || 'Could not save the summary.'); }
    setSaving(false);
  };

  if (editing) return <div className="mt-3"><SummaryForm initial={call.summary || ''} saving={saving} error={error} onSave={save} onCancel={() => setEditing(false)} /></div>;

  if (call.summary) {
    return (
      <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
          <FileText className="w-3 h-3" /><span className="font-semibold text-gray-600">Summary</span>
          {call.summaryBy && <span>· {call.summaryBy}</span>}
          {editable && (
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit summary"
              className="ml-auto p-1 -m-1 rounded text-gray-400 hover:text-gray-700"><Pencil className="w-3 h-3" /></button>
          )}
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-line">{call.summary}</p>
      </div>
    );
  }

  if (!callNeedsSummary(call)) return null;
  return editable ? (
    <button type="button" onClick={() => setEditing(true)}
      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1.5">
      <AlertCircle className="w-3.5 h-3.5" />Add call summary
    </button>
  ) : (
    <p className="mt-2 text-[11px] text-gray-400">No summary written</p>
  );
}

/** Shown to staff right after an answered call ends. */
export function CallSummaryPrompt({ callId, otherName, onClose }: { callId: string; otherName: string; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (text: string) => {
    setSaving(true); setError('');
    try {
      await api.chat.saveCallSummary(callId, text.trim());
      window.dispatchEvent(new Event('call:summary-saved')); // lists showing calls refresh
      onClose();
    }
    catch (err: any) { setError(err.message || 'Could not save the summary.'); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[160] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="call-summary-title">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id="call-summary-title" className="text-base font-semibold text-gray-900">Call summary{otherName ? ` — ${otherName}` : ''}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 -m-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Write down what you discussed while it's fresh. It shows in your call history and on My Performance.</p>
        <SummaryForm initial="" saving={saving} error={error} onSave={save} />
        <button type="button" onClick={onClose} className="mt-1 text-xs text-gray-400 hover:text-gray-600">Write it later</button>
      </div>
    </div>
  );
}
