import { useCallback, useEffect, useState } from 'react';
import { Globe, Lock, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { api, NoteVisibility, StudentNote } from '../api';
import { useAuth } from '../context/AuthContext';

// Staff notes on a student, shared by the admin, Application Team and counselor pages.
// Public notes are seen by every staff member who can open the student, with the author's
// name; private notes only by their author. Only the author can edit a note or change who
// sees it. The server enforces all of this — the UI just mirrors it.

const fmt = (d?: string) => d ? new Date(d).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const wasEdited = (n: StudentNote) => !!(n.updatedAt && n.createdAt && new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime() > 1000);

function VisibilityToggle({ value, onChange, disabled }: { value: NoteVisibility; onChange: (v: NoteVisibility) => void; disabled?: boolean }) {
  const opts: { v: NoteVisibility; label: string; icon: typeof Globe; hint: string }[] = [
    { v: 'public', label: 'Public', icon: Globe, hint: 'Every staff member who can open this student will see it' },
    { v: 'private', label: 'Private', icon: Lock, hint: 'Only you will see it' },
  ];
  return (
    <div role="radiogroup" aria-label="Who can see this note" className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
      {opts.map(({ v, label, icon: Icon, hint }) => {
        const on = value === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} title={hint} disabled={disabled} onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-r border-gray-200 last:border-r-0 transition-colors disabled:opacity-50 ${
              on ? (v === 'public' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        );
      })}
    </div>
  );
}

function VisibilityBadge({ value }: { value: NoteVisibility }) {
  return value === 'public' ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
      <Globe className="w-3 h-3" />Public
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200" title="Only you can see this note">
      <Lock className="w-3 h-3" />Private
    </span>
  );
}

export default function StudentNotes({ studentId, canAdd = true, onChange }: {
  studentId: string;
  canAdd?: boolean;
  /** Called after any change, e.g. to refresh a tab count */
  onChange?: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [notes, setNotes] = useState<StudentNote[] | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibility>('private');
  const [filter, setFilter] = useState<'all' | NoteVisibility>('all');
  const [editing, setEditing] = useState<{ id: string; text: string; visibility: NoteVisibility } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try { setNotes((await api.students.notes(studentId)).notes); }
    catch (err: any) { setError(err.message || 'Could not load notes.'); setNotes([]); }
  }, [studentId]);
  useEffect(() => { setNotes(null); setEditing(null); load(); }, [load]);

  const run = async (fn: () => Promise<{ notes: StudentNote[] }>) => {
    setSaving(true); setError('');
    try { setNotes((await fn()).notes); onChange?.(); return true; }
    catch (err: any) { setError(err.message || 'Could not save the note.'); return false; }
    finally { setSaving(false); }
  };

  const add = async () => {
    if (!text.trim()) return;
    if (await run(() => api.students.addNote(studentId, text.trim(), visibility))) setText('');
  };
  const saveEdit = async () => {
    if (!editing || !editing.text.trim()) return;
    if (await run(() => api.students.editNote(studentId, editing.id, { text: editing.text.trim(), visibility: editing.visibility }))) setEditing(null);
  };
  const remove = async (n: StudentNote) => {
    if (!window.confirm(n.mine ? 'Delete this note?' : `Delete ${n.authorName}'s public note?`)) return;
    await run(() => api.students.deleteNote(studentId, n.id));
  };

  const list = notes || [];
  const counts = { all: list.length, public: list.filter(n => n.visibility === 'public').length, private: list.filter(n => n.visibility === 'private').length };
  const shown = filter === 'all' ? list : list.filter(n => n.visibility === filter);

  return (
    <div className="space-y-4">
      {canAdd && (
        <div className="space-y-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={5000} aria-label="New note"
            placeholder={visibility === 'public' ? 'Add a note for the team…' : 'Add a private note — only you will see it…'}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <VisibilityToggle value={visibility} onChange={setVisibility} disabled={saving} />
              <span className="text-xs text-gray-500">
                {visibility === 'public' ? 'Visible to all staff who can open this student' : 'Only visible to you'}
              </span>
            </div>
            <button type="button" onClick={add} disabled={saving || !text.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors">
              <StickyNote className="w-4 h-4" />{saving && !editing ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {list.length > 0 && (
        <div className="flex gap-1.5" role="tablist" aria-label="Filter notes">
          {(['all', 'public', 'private'] as const).map(f => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filter === f ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {f === 'all' ? 'All' : f === 'public' ? 'Public' : 'My private'} ({counts[f]})
            </button>
          ))}
        </div>
      )}

      {notes === null ? (
        <div className="py-10 text-center"><span className="w-5 h-5 border-2 rounded-full animate-spin inline-block border-gray-300 border-t-gray-600" /></div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <StickyNote className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">{list.length ? 'No notes in this view.' : 'No notes yet.'}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map(n => {
            const isEditing = editing?.id === n.id;
            const canDelete = n.mine || (isAdmin && n.visibility === 'public');
            return (
              <li key={n.id} className={`rounded-xl border p-4 ${n.visibility === 'public' ? 'bg-amber-50/60 border-amber-100' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-700 flex-shrink-0">
                    {(n.authorName || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{n.authorName}{n.mine && <span className="font-normal text-gray-500"> (you)</span>}</span>
                  <VisibilityBadge value={n.visibility} />
                  <span className="text-xs text-gray-500">{fmt(n.createdAt)}{wasEdited(n) && ' · edited'}</span>
                  {!isEditing && (n.mine || canDelete) && (
                    <span className="ml-auto flex gap-1">
                      {n.mine && (
                        <button type="button" onClick={() => setEditing({ id: n.id, text: n.text, visibility: n.visibility })} aria-label="Edit note" title="Edit note"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-100"><Pencil className="w-3.5 h-3.5" /></button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => remove(n)} disabled={saving} aria-label="Delete note" title="Delete note"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea value={editing!.text} onChange={e => setEditing({ ...editing!, text: e.target.value })} rows={3} maxLength={5000} aria-label="Edit note"
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <VisibilityToggle value={editing!.visibility} onChange={v => setEditing({ ...editing!, visibility: v })} disabled={saving} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                        <button type="button" onClick={saveEdit} disabled={saving || !editing!.text.trim()}
                          className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{n.text}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
