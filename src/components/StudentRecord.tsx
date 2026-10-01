import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, CalendarDays, Check, ChevronDown, ChevronRight, FileCheck, FileText, GitBranch, Mail,
  MessageCircle, MessageSquare, Phone, PhoneMissed, Send, StickyNote, Trash2, UserPlus, Video,
  AlertCircle, Download, Clock, XCircle, Plus, CheckSquare, Square, ChevronLeft,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { uploadUrl } from '../utils/uploadUrl';
import LeadStageSelect, { PIPELINE_STAGES, leadStageOf } from './LeadStageSelect';

// ── Tabs ─────────────────────────────────────────────────────────────────────
export type RecordTab = 'timeline' | 'notes' | 'messages' | 'activities' | 'emails' | 'pipelines' | 'files';
export const RECORD_TABS: { key: RecordTab; label: string }[] = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'notes', label: 'Notes' },
  { key: 'messages', label: 'Messages' },
  { key: 'activities', label: 'Activities' },
  { key: 'emails', label: 'Emails' },
  { key: 'pipelines', label: 'Pipelines' },
  { key: 'files', label: 'Files' },
];

/** Item count shown as a badge next to a tab label (null = no badge). */
export function recordTabCount(tab: string, student: any, record: any): number | null {
  if (tab === 'notes') return student?.counselorNotes?.length || null;
  if (tab === 'files') return student?.documents?.length || null;
  if (!record) return null;
  if (tab === 'activities') return ((record.tasks || []).filter((t: any) => t.status !== 'completed').length + (record.activities || []).length) || null;
  if (tab === 'emails') return record.emails?.length || null;
  return null;
}

export function TabCount({ n }: { n: number | null }) {
  if (!n) return null;
  return <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">{n}</span>;
}

/** Previous / next arrows for stepping through a list of student records. */
export function RecordNav({ index, total, onPrev, onNext, dark = false }: {
  index: number; total: number; onPrev: () => void; onNext: () => void; dark?: boolean;
}) {
  if (index < 0 || total < 2) return null;
  const btn = `w-9 h-9 flex items-center justify-center rounded-full border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
    dark ? 'border-white/30 text-white hover:bg-white/20' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`;
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className={`text-xs tabular-nums ${dark ? 'text-white/70' : 'text-gray-500'}`}>{index + 1} of {total}</span>
      <button type="button" onClick={onPrev} disabled={index === 0} aria-label="Previous student" title="Previous student" className={btn}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button type="button" onClick={onNext} disabled={index === total - 1} aria-label="Next student" title="Next student" className={btn}>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Loads timeline / activities / emails / chats for one student. */
export function useStudentRecord(studentId?: string) {
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!studentId) return;
    setLoading(true); setError('');
    try { setRecord(await api.students.record(studentId)); }
    catch (err: any) { setError(err.message || 'Could not load the student record.'); }
    finally { setLoading(false); }
  }, [studentId]);
  useEffect(() => { setRecord(null); reload(); }, [reload]);
  return { record, loading, error, reload };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const sid = (s: any) => String(s?._id || s?.id || '');
const fmtTime = (d: any) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: any) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const hasTime = (d: any) => typeof d !== 'string' || d.length > 10;

function dayLabel(d: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return fmtDate(d);
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12">
      <Icon className="w-8 h-8 text-gray-300 mb-2" />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 rounded-full animate-spin inline-block border-gray-300 border-t-gray-600" />;
}

const btnPrimary = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors';
const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// ── Timeline ─────────────────────────────────────────────────────────────────
const TIMELINE_ICON: Record<string, any> = {
  stage: GitBranch, application: FileText, comment: MessageCircle, document: FileCheck, note: StickyNote,
  meeting: CalendarDays, student: UserPlus, email: Mail, call: Phone, task: CheckSquare,
};

function TimelinePanel({ record }: { record: any }) {
  const items = record.timeline || [];
  if (!items.length) return <Empty icon={Activity} text="No history yet." />;
  const groups: { label: string; items: any[] }[] = [];
  items.forEach((t: any) => {
    const label = dayLabel(new Date(t.at));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(t); else groups.push({ label, items: [t] });
  });
  return (
    <div>
      {groups.map(g => (
        <div key={g.label} className="mb-6 last:mb-0">
          <div className="flex items-center gap-3 mb-3 ml-16">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 -ml-[5px]" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{g.label}</span>
          </div>
          <ol className="border-l border-gray-200 ml-16 space-y-4">
            {g.items.map(t => {
              const Icon = TIMELINE_ICON[t.kind] || Activity;
              return (
                <li key={t.id} className="relative pl-6">
                  <span className="absolute -left-16 top-0.5 w-12 text-right text-xs text-gray-400">{hasTime(t.at) ? fmtTime(t.at) : ''}</span>
                  <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-white border border-gray-300" />
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{t.title}{t.by && <> by <span className="font-semibold">{t.by}</span></>}</p>
                      {t.detail && <p className="text-xs text-gray-500 mt-0.5 break-words">{t.detail}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

// ── Notes ────────────────────────────────────────────────────────────────────
function NotesPanel({ student, canEdit, onStudentChange }: { student: any; canEdit: boolean; onStudentChange: (s: any) => void }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const notes = [...(student.counselorNotes || [])].sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true); setError('');
    try { onStudentChange(await api.students.addNote(sid(student), text.trim())); setText(''); }
    catch (err: any) { setError(err.message || 'Could not save note.'); }
    finally { setSaving(false); }
  };
  const remove = async (noteId: string) => {
    if (!window.confirm('Delete this note?')) return;
    try { onStudentChange(await api.students.deleteNote(sid(student), noteId)); } catch {}
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Add a note…" className={`${inputCls} resize-none`} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={add} disabled={saving || !text.trim()} className={btnPrimary}>
              {saving ? <Spinner /> : <StickyNote className="w-4 h-4" />} Add note
            </button>
          </div>
        </div>
      )}
      {notes.length === 0 ? <Empty icon={StickyNote} text="No notes yet." /> : notes.map((n: any) => (
        <div key={n._id || n.id} className="border border-amber-100 bg-amber-50/50 rounded-xl p-4">
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{n.text}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{n.counselorName || 'Staff'}</span>
            {n.createdAt && <span>· {fmtDate(n.createdAt)} {fmtTime(n.createdAt)}</span>}
            {canEdit && (user?.role === 'admin' || String(n.counselorId) === String(user?.id)) && (
              <button type="button" onClick={() => remove(n._id || n.id)} aria-label="Delete note" className="ml-auto p-1 text-gray-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Messages (Gradzest chat) ─────────────────────────────────────────────────
function MessageBubble({ m, mine }: { m: any; mine: boolean }) {
  let body: React.ReactNode = m.content;
  if (m.type === 'call') {
    const missed = m.callStatus !== 'answered';
    return (
      <div className="flex justify-center">
        <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${missed ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>
          {missed ? <PhoneMissed className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
          {missed ? 'Missed call' : `Call · ${Math.floor((m.callDuration || 0) / 60)}m ${(m.callDuration || 0) % 60}s`} · {m.senderName} · {fmtTime(m.timestamp)}
        </span>
      </div>
    );
  }
  if (m.type === 'file') body = <a href={uploadUrl(m.fileUrl)} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1"><FileText className="w-4 h-4" />{m.fileName || 'File'}</a>;
  if (m.type === 'meeting') body = <span className="inline-flex items-center gap-1"><CalendarDays className="w-4 h-4" />Meeting: {m.meetingDate} at {m.meetingTime}{m.meetingNotes ? ` — ${m.meetingNotes}` : ''}</span>;
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[75%]">
        <p className={`text-xs font-semibold text-gray-600 mb-1 ${mine ? 'text-right' : ''}`}>{m.senderName}{m.senderRole ? <span className="font-normal text-gray-400"> · {m.senderRole}</span> : null}</p>
        <div className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${mine ? 'bg-green-100 text-gray-900 rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'}`}>{body}</div>
        <p className={`text-[10px] text-gray-400 mt-1 ${mine ? 'text-right' : ''}`}>{fmtTime(m.timestamp)}</p>
      </div>
    </div>
  );
}

function MessagesPanel({ student, record, reload, canReply }: { student: any; record: any; reload: () => Promise<void>; canReply: boolean }) {
  const { user } = useAuth();
  const me = String(user?.id ?? '');
  const rooms: any[] = record.rooms || [];
  const myRoom = rooms.find(r => r.participants.includes(me));
  const [roomId, setRoomId] = useState<string>(myRoom?.id || rooms[0]?.id || '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const room = rooms.find(r => r.id === roomId) || (canReply ? null : rooms[0]);
  const replyingHere = canReply && (!room || room.participants.includes(me));

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [roomId, room?.messages?.length]);

  const send = async () => {
    if (!text.trim() || !user) return;
    setSending(true); setError('');
    try {
      let target = myRoom;
      if (!target) target = await api.chat.createRoom([me, sid(student)], [user.name || 'Staff', student.name]);
      await api.chat.send(target.id, text.trim(), user.name || 'Staff');
      setText('');
      await reload();
      setRoomId(target.id);
    } catch (err: any) { setError(err.message || 'Could not send message.'); }
    finally { setSending(false); }
  };

  const title = (r: any) => (r.participantNames || []).filter((n: string) => n !== student.name).join(', ') || 'Conversation';

  return (
    <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden h-[28rem]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center">{student.name?.[0]}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{student.name}</p>
          <p className="text-xs text-gray-500 truncate">{student.phone || student.email}</p>
        </div>
        {rooms.length > 1 && (
          <div className="relative">
            <select value={room?.id || ''} onChange={e => setRoomId(e.target.value)} aria-label="Conversation"
              className="appearance-none pl-3 pr-8 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
              {rooms.map(r => <option key={r.id} value={r.id}>With {title(r)}{r.participants.includes(me) ? ' (you)' : ''}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {!room || room.messages.length === 0
          ? <Empty icon={MessageSquare} text={canReply ? 'No messages yet. Send the first one below.' : 'No conversations with this student yet.'} />
          : room.messages.map((m: any) => <MessageBubble key={m.id} m={m} mine={m.senderId === me} />)}
        <div ref={bottomRef} />
      </div>
      {replyingHere ? (
        <div className="p-3 border-t border-gray-200 bg-white">
          {error && <p className="text-xs text-red-600 mb-1.5">{error}</p>}
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message…"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} className={inputCls} />
            <button type="button" onClick={send} disabled={sending || !text.trim()} aria-label="Send message" className={btnPrimary}>
              {sending ? <Spinner /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center py-2.5 border-t border-gray-200 bg-amber-50">
          {canReply ? 'You can only reply in your own conversation with this student.' : 'Read-only view of this student\'s Gradzest chats.'}
        </p>
      )}
    </div>
  );
}

// ── Activities: Tasks / Events / Calls ──────────────────────────────────────
const PRIORITY_CLS: Record<string, string> = { high: 'bg-red-50 text-red-700', medium: 'bg-amber-50 text-amber-700', low: 'bg-gray-100 text-gray-600' };

function TaskForm({ student, onDone, onCancel }: { student: any; onDone: () => Promise<void>; onCancel: () => void }) {
  const { user } = useAuth();
  const [assignees, setAssignees] = useState<{ _id: string; name: string; title?: string; dept: string }[]>([]);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignedTo, setAssignedTo] = useState(String(user?.id ?? ''));
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.tasks.assignees().then(setAssignees).catch(() => {}); }, []);

  const save = async () => {
    setSaving(true); setError('');
    try {
      await api.tasks.create({ title: title.trim(), description: description.trim(), assignedTo: assignedTo || undefined, priority, dueDate, studentId: sid(student) });
      await onDone();
    } catch (err: any) { setError(err.message || 'Could not create task.'); setSaving(false); }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Task name, e.g. Call about IELTS date" className={inputCls} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} aria-label="Due date" className={inputCls} />
        <select value={priority} onChange={e => setPriority(e.target.value)} aria-label="Priority" className={`${inputCls} bg-white`}>
          <option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option>
        </select>
        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} aria-label="Task owner" className={`${inputCls} bg-white`}>
          {assignees.length === 0 && <option value={String(user?.id ?? '')}>Me</option>}
          {assignees.map(a => <option key={a._id} value={a._id}>{a._id === String(user?.id) ? `${a.name} (me)` : a.name}{a.title ? ` · ${a.title}` : ''}</option>)}
        </select>
      </div>
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Description (optional)" className={`${inputCls} resize-none`} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !title.trim()} className={btnPrimary}>{saving ? <Spinner /> : <Plus className="w-4 h-4" />} Create task</button>
      </div>
    </div>
  );
}

function TasksTable({ tasks, reload }: { tasks: any[]; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const toggle = async (t: any) => {
    setBusy(t.id); setError('');
    try { await api.tasks.update(t.id, { status: t.status === 'completed' ? 'pending' : 'completed' }); await reload(); }
    catch (err: any) { setError(err.message || 'Could not update task.'); }
    finally { setBusy(''); }
  };
  if (!tasks.length) return <Empty icon={CheckSquare} text="This student doesn't have any tasks." />;
  const sorted = [...tasks].sort((a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0));
  return (
    <div className="border border-gray-200 rounded-xl overflow-x-auto">
      {error && <p className="text-xs text-red-600 px-4 pt-3">{error}</p>}
      <table className="w-full text-sm min-w-[36rem]">
        <thead className="bg-gray-50 text-xs text-gray-500 text-left">
          <tr>
            <th className="font-medium px-4 py-2.5">Task name</th>
            <th className="font-medium px-3 py-2.5">Due Date</th>
            <th className="font-medium px-3 py-2.5">Status</th>
            <th className="font-medium px-3 py-2.5">Task Owner</th>
            <th className="font-medium px-3 py-2.5">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map(t => {
            const done = t.status === 'completed';
            const overdue = !done && t.dueDate && new Date(`${t.dueDate}T23:59:59`) < new Date();
            return (
              <tr key={t.id} className={done ? 'text-gray-400' : ''}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => toggle(t)} disabled={busy === t.id} aria-label={done ? 'Mark as open' : 'Mark as completed'}
                      className="text-gray-400 hover:text-blue-600 flex-shrink-0">
                      {busy === t.id ? <Spinner /> : done ? <CheckSquare className="w-4 h-4 text-green-600" /> : <Square className="w-4 h-4" />}
                    </button>
                    <span className={`font-medium ${done ? 'line-through' : 'text-gray-900'}`}>{t.title}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${PRIORITY_CLS[t.priority] || PRIORITY_CLS.medium}`}>{t.priority}</span>
                  </div>
                </td>
                <td className={`px-3 py-3 whitespace-nowrap ${overdue ? 'text-red-600 font-medium' : ''}`}>{t.dueDate ? fmtDate(`${t.dueDate}T00:00`) : '—'}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${done ? 'bg-green-50 text-green-700' : overdue ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                    {done ? 'Completed' : overdue ? 'Overdue' : 'Open'}
                  </span>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{t.assignedToName || '—'}</td>
                <td className="px-3 py-3 max-w-[16rem]"><p className="truncate" title={t.description}>{t.description || '—'}</p></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActivityList({ items }: { items: any[] }) {
  const when = (a: any) => a.at ? new Date(a.at) : new Date(`${a.date}T${a.time?.length === 5 ? a.time : '00:00'}`);
  return (
    <ul className="space-y-3">
      {[...items].sort((a, b) => when(b).getTime() - when(a).getTime()).map(a => {
        const upcoming = a.type === 'meeting' && when(a) > new Date() && a.status !== 'cancelled';
        const Icon = a.type === 'call' ? (a.status === 'answered' ? Phone : PhoneMissed) : a.type === 'meeting' && a.platform === 'jitsi' ? Video : CalendarDays;
        return (
          <li key={a.id} className="flex items-start gap-3 border border-gray-200 rounded-xl p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${a.type === 'call' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{a.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />
                  {a.at ? `${fmtDate(a.at)} ${fmtTime(a.at)}` : `${a.date} ${a.time || ''}`}
                </span>
                {a.type === 'call' && <span>{a.status === 'answered' ? `Answered · ${Math.floor((a.duration || 0) / 60)}m ${(a.duration || 0) % 60}s` : a.status === 'declined' ? 'Declined' : 'Not answered'}</span>}
                {a.type === 'meeting' && <span>{a.duration} min{a.by ? ` · by ${a.by}` : ''}{a.with?.length ? ` · with ${a.with.join(', ')}` : ''}</span>}
                {a.notes && <span>{a.notes}</span>}
              </p>
            </div>
            {a.type === 'meeting' && (
              upcoming && a.link
                ? <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg">Join</a>
                : <span className={`text-[11px] font-semibold px-2 py-1 rounded-full capitalize ${a.status === 'cancelled' ? 'bg-red-50 text-red-700' : upcoming ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{upcoming ? 'Upcoming' : a.status === 'scheduled' ? 'Past' : a.status}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ActivitiesPanel({ student, record, reload, canEdit }: { student: any; record: any; reload: () => Promise<void>; canEdit: boolean }) {
  const [sub, setSub] = useState<'tasks' | 'events' | 'calls'>('tasks');
  const [adding, setAdding] = useState(false);
  const tasks: any[] = record.tasks || [];
  const events = (record.activities || []).filter((a: any) => a.type !== 'call');
  const calls = (record.activities || []).filter((a: any) => a.type === 'call');
  const SUBS = [
    { key: 'tasks' as const, label: 'Tasks', n: tasks.length },
    { key: 'events' as const, label: 'Events', n: events.length },
    { key: 'calls' as const, label: 'Calls', n: calls.length },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex p-1 border border-gray-200 rounded-full">
          {SUBS.map(s => (
            <button key={s.key} type="button" onClick={() => setSub(s.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${sub === s.key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}>
              {s.label}{s.n > 0 && <span className="ml-1 text-xs text-gray-400">{s.n}</span>}
            </button>
          ))}
        </div>
        {canEdit && sub === 'tasks' && !adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4" /> Task
          </button>
        )}
      </div>
      {sub === 'tasks' && adding && <TaskForm student={student} onCancel={() => setAdding(false)} onDone={async () => { setAdding(false); await reload(); }} />}
      {sub === 'tasks' && <TasksTable tasks={tasks} reload={reload} />}
      {sub === 'events' && (events.length ? <ActivityList items={events} /> : <Empty icon={CalendarDays} text="No meetings with this student yet." />)}
      {sub === 'calls' && (calls.length ? <ActivityList items={calls} /> : <Empty icon={Phone} text="No calls with this student yet." />)}
    </div>
  );
}

// ── Emails ───────────────────────────────────────────────────────────────────
function EmailsPanel({ student, record, reload, canEdit }: { student: any; record: any; reload: () => Promise<void>; canEdit: boolean }) {
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const emails: any[] = record.emails || [];

  const send = async () => {
    setSending(true); setError('');
    try {
      await api.students.sendEmail(sid(student), subject.trim(), body.trim());
      setSubject(''); setBody(''); setComposing(false);
      await reload();
    } catch (err: any) { setError(err.message || 'Could not send email.'); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      {canEdit && (composing ? (
        <div className="border border-gray-200 rounded-xl p-4 space-y-2">
          <p className="text-xs text-gray-500">To: <span className="text-gray-800 font-medium">{student.email}</span></p>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className={inputCls} />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} placeholder="Write your message…" className={`${inputCls} resize-y`} />
          {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setComposing(false); setError(''); }} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={send} disabled={sending || !subject.trim() || !body.trim()} className={btnPrimary}>
              {sending ? <Spinner /> : <Send className="w-4 h-4" />} Send email
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button type="button" onClick={() => setComposing(true)} className={btnPrimary}><Mail className="w-4 h-4" /> Send email</button>
        </div>
      ))}

      {emails.length === 0 ? <Empty icon={Mail} text="No emails sent to this student yet." /> : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
          {emails.map(e => (
            <li key={e.id}>
              <button type="button" onClick={() => setOpenId(openId === e.id ? null : e.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                {openId === e.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{e.subject || '(no subject)'}</p>
                  <p className="text-xs text-gray-500">{e.kind === 'manual' ? `by ${e.sentByName || 'staff'}` : 'Automatic'} · {fmtDate(e.createdAt)} {fmtTime(e.createdAt)}</p>
                </div>
                {e.status === 'sent'
                  ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full"><Check className="w-3 h-3" />Sent</span>
                  : <span title={e.error} className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-1 rounded-full"><XCircle className="w-3 h-3" />Failed</span>}
              </button>
              {openId === e.id && (
                <div className="px-4 pb-4">
                  {e.error && <p className="text-xs text-red-600 mb-2">{e.error}</p>}
                  {/* Sandboxed: email HTML can't run scripts or touch this page */}
                  <iframe title={e.subject} sandbox="" srcDoc={e.html} className="w-full h-72 border border-gray-200 rounded-lg bg-white" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Pipelines ────────────────────────────────────────────────────────────────
const APP_STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'offer_received', label: 'Offer' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'enrolled', label: 'Enrolled' },
];

function Stepper({ steps, current, failed }: { steps: { key: string; label: string }[]; current: number; failed?: boolean }) {
  return (
    <ol className="flex items-center w-full overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const done = i < current;
        const here = i === current;
        return (
          <li key={s.key} className="flex items-center flex-1 min-w-[5.5rem] last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                here ? (failed ? 'bg-red-600 border-red-600 text-white' : 'bg-blue-600 border-blue-600 text-white')
                : done ? 'bg-blue-50 border-blue-600 text-blue-700' : 'bg-white border-gray-200 text-gray-400'}`}>
                {done ? <Check className="w-3.5 h-3.5" /> : here && failed ? <XCircle className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className={`text-[11px] text-center whitespace-nowrap ${here ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <span className={`flex-1 h-0.5 mx-1 mb-5 ${done ? 'bg-blue-600' : 'bg-gray-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function PipelinesPanel({ student, canEdit, onLeadStage }: { student: any; canEdit: boolean; onLeadStage: (stage: string) => Promise<unknown> }) {
  const stageIdx = PIPELINE_STAGES.findIndex(s => s.value === leadStageOf(student).value);
  const apps = student.applications || [];
  return (
    <div className="space-y-6">
      <section className="border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h4 className="text-sm font-semibold text-gray-900">Lead pipeline</h4>
          <LeadStageSelect value={student.leadStage} editable={canEdit} onSave={onLeadStage} />
        </div>
        <Stepper steps={PIPELINE_STAGES.map(s => ({ key: s.value, label: s.label }))} current={stageIdx} />
      </section>
      <section>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Applications ({apps.length})</h4>
        {apps.length === 0 ? <Empty icon={FileText} text="No applications yet." /> : (
          <div className="space-y-3">
            {apps.map((a: any) => {
              const rejected = a.status === 'rejected';
              const idx = rejected ? Math.max(0, APP_STEPS.findIndex(s => s.key === a.rejectedFrom)) : APP_STEPS.findIndex(s => s.key === a.status);
              return (
                <div key={a._id || a.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{a.universityName}</p>
                      <p className="text-xs text-gray-500 truncate">{a.courseName}{a.intake ? ` · ${a.intake}` : ''}</p>
                    </div>
                    {rejected && <span className="text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-1 rounded-full">Rejected</span>}
                  </div>
                  <Stepper steps={APP_STEPS} current={idx < 0 ? 0 : idx} failed={rejected} />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Files ────────────────────────────────────────────────────────────────────
function FilesPanel({ student }: { student: any }) {
  const docs = student.documents || [];
  if (!docs.length) return <Empty icon={FileText} text="No documents yet." />;
  const badge: Record<string, string> = { verified: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-700', pending: 'bg-amber-50 text-amber-700' };
  return (
    <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
      {docs.map((d: any) => (
        <li key={d._id || d.id} className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
            <p className="text-xs text-gray-500">{d.type}{d.uploadedDate ? ` · ${d.uploadedDate}` : ''}{!d.url ? ' · requested, not uploaded' : ''}</p>
          </div>
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full capitalize ${badge[d.status] || badge.pending}`}>{d.status || 'pending'}</span>
          {d.url && (
            <a href={uploadUrl(d.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${d.name}`}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"><Download className="w-4 h-4" /></a>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Panel switch + full component ────────────────────────────────────────────
export interface RecordProps {
  student: any;
  record: any;
  reload: () => Promise<void>;
  canEdit: boolean;       // notes, emails, lead stage
  canReply: boolean;      // Gradzest chat replies
  onStudentChange: (s: any) => void;
}

export function StudentRecordPanel({ tab, loading, error, ...p }: RecordProps & { tab: RecordTab; loading?: boolean; error?: string }) {
  const onLeadStage = async (stage: string) => {
    const u = await api.students.setLeadStage(sid(p.student), stage);
    p.onStudentChange({ ...p.student, leadStage: u.leadStage });
    p.reload();
  };
  if (tab === 'notes') return <NotesPanel student={p.student} canEdit={p.canEdit} onStudentChange={s => { p.onStudentChange(s); p.reload(); }} />;
  if (tab === 'pipelines') return <PipelinesPanel student={p.student} canEdit={p.canEdit} onLeadStage={onLeadStage} />;
  if (tab === 'files') return <FilesPanel student={p.student} />;
  if (error) return <p className="text-sm text-red-600 flex items-center gap-1.5 py-6"><AlertCircle className="w-4 h-4" />{error}</p>;
  if (!p.record) return <div className="flex justify-center py-12">{loading && <Spinner />}</div>;
  if (tab === 'timeline') return <TimelinePanel record={p.record} />;
  if (tab === 'messages') return <MessagesPanel student={p.student} record={p.record} reload={p.reload} canReply={p.canReply} />;
  if (tab === 'activities') return <ActivitiesPanel student={p.student} record={p.record} reload={p.reload} canEdit={p.canEdit} />;
  return <EmailsPanel student={p.student} record={p.record} reload={p.reload} canEdit={p.canEdit} />;
}

/** Self-contained record with its own tab bar (used where the page has no tab bar of its own). */
export default function StudentRecord({ student, canEdit, canReply, onStudentChange }: {
  student: any; canEdit: boolean; canReply: boolean; onStudentChange: (s: any) => void;
}) {
  const [tab, setTab] = useState<RecordTab>('timeline');
  const { record, loading, error, reload } = useStudentRecord(sid(student));
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex gap-1 border-b border-gray-200 px-3 overflow-x-auto">
        {RECORD_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.key ? 'text-green-700 border-green-600' : 'text-gray-500 border-transparent hover:text-gray-800'}`}>
            {t.label}<TabCount n={recordTabCount(t.key, student, record)} />
          </button>
        ))}
      </div>
      <div className="p-5">
        <StudentRecordPanel tab={tab} student={student} record={record} reload={reload} loading={loading} error={error}
          canEdit={canEdit} canReply={canReply} onStudentChange={onStudentChange} />
      </div>
    </div>
  );
}
