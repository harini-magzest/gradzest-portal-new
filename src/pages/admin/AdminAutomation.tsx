import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Zap, Plus, Pencil, Trash2, X, Mail, Bell, ListChecks, UserCheck, Flag, Play,
  FileText, History, Copy, Send, RefreshCw, ArrowRight, CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../../context/ToastContext';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Opt { key: string; label: string }
interface Field extends Opt { options?: Record<string, string>; number?: boolean; groups?: string[]; triggers?: string[] }
interface Trigger extends Opt { group: string }
interface Operator extends Opt { noValue?: boolean }
interface Variable extends Opt { sample: string }
interface Meta {
  triggers: Trigger[]; fields: Field[]; operators: Operator[]; variables: Variable[];
  actionTypes: Opt[]; recipients: Opt[]; leadStages: Record<string, string>;
  roles: { _id: string; name: string }[];
  staff: { _id: string; name: string; role: string; isAppTeam?: boolean }[];
}
interface Template {
  _id: string; name: string; channel: 'email' | 'notification'; category: string;
  subject: string; body: string; usedBy?: string[]; updatedAt?: string;
}
interface Condition { field: string; op: string; value: string }
interface Action {
  type: string; templateId?: string | null; recipient?: string; roleId?: string | null; userId?: string | null;
  taskTitle?: string; taskDescription?: string; taskPriority?: string; taskDueDays?: number; leadStage?: string;
}
interface Rule {
  _id?: string; name: string; description: string; active: boolean; trigger: string; scheduleHour: number;
  conditionMatch: 'all' | 'any'; conditions: Condition[]; actions: Action[];
  runCount?: number; lastRunAt?: string | null;
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500';

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  send_email: Mail, send_notification: Bell, create_task: ListChecks, assign_counselor: UserCheck, change_stage: Flag,
};

function fmtHour(h: number) {
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${suffix}`;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderSample(text: string, vars: Variable[]) {
  const map = Object.fromEntries(vars.map(v => [v.key, v.sample]));
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => map[k] ?? '');
}

function fieldsForTrigger(meta: Meta, trigger: string) {
  const group = meta.triggers.find(t => t.key === trigger)?.group;
  return meta.fields.filter(f =>
    (!f.groups || (group && f.groups.includes(group))) && (!f.triggers || f.triggers.includes(trigger)));
}

function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div role="presentation" className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="presentation" onClick={e => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Template editor ───────────────────────────────────────────────────────── */

function TemplateEditor({ template, meta, categories, onClose, onSaved }: {
  template?: Partial<Template>; meta: Meta; categories: string[]; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: template?.name || '', channel: template?.channel || 'email' as 'email' | 'notification',
    category: template?.category || 'General', subject: template?.subject || '', body: template?.body || '',
  });
  const [saving, setSaving] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<'subject' | 'body'>('body');

  const insertVar = (key: string) => {
    const token = `{{${key}}}`;
    const target = lastFocus.current;
    const el = target === 'subject' ? subjectRef.current : bodyRef.current;
    const value = form[target];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setForm(f => ({ ...f, [target]: value.slice(0, start) + token + value.slice(end) }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (template?._id) await api.automation.updateTemplate(template._id, form);
      else await api.automation.createTemplate(form);
      toast.success('Template saved');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isEmail = form.channel === 'email';
  return (
    <Modal wide title={template?._id ? 'Edit template' : 'New template'} onClose={onClose} footer={<>
      <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
      <button type="button" onClick={save} disabled={saving || !form.name.trim() || !form.body.trim()}
        className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save template'}
      </button>
    </>}>
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4 min-w-0">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Offer received" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input list="tpl-categories" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls} />
              <datalist id="tpl-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              {(['email', 'notification'] as const).map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, channel: c })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md ${form.channel === c ? 'bg-white shadow-xs text-purple-700 font-medium' : 'text-gray-600'}`}>
                  {c === 'email' ? <Mail className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                  {c === 'email' ? 'Email' : 'In-app notification'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{isEmail ? 'Subject' : 'Title'}</label>
            <input ref={subjectRef} value={form.subject} onFocus={() => { lastFocus.current = 'subject'; }}
              onChange={e => setForm({ ...form, subject: e.target.value })} className={inputCls}
              placeholder={isEmail ? 'Congratulations {{student.firstName}}!' : 'New document from {{student.name}}'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
            <textarea ref={bodyRef} value={form.body} onFocus={() => { lastFocus.current = 'body'; }}
              onChange={e => setForm({ ...form, body: e.target.value })} rows={isEmail ? 11 : 5}
              className={`${inputCls} font-mono text-[13px]`}
              placeholder={'Hi {{student.firstName}},\n\n…'} />
            <p className="text-xs text-gray-500 mt-1">Click a field on the right to insert it where your cursor is. New lines are kept.</p>
          </div>

          {/* Preview */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Preview (sample data)</p>
            {isEmail ? (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b text-sm"><span className="text-gray-500">Subject: </span>{renderSample(form.subject, meta.variables) || <em className="text-gray-400">No subject</em>}</div>
                <div className="bg-[#3b0764] text-white text-center py-3 font-semibold">Gradzest</div>
                <div className="p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{renderSample(form.body, meta.variables)}</div>
              </div>
            ) : (
              <div className="flex gap-3 rounded-xl border border-gray-200 p-3 max-w-sm">
                <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0"><Bell className="w-4 h-4" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{renderSample(form.subject || form.name, meta.variables)}</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{renderSample(form.body, meta.variables)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Insert field</p>
          <div className="space-y-1 lg:max-h-[60vh] overflow-y-auto pr-1">
            {meta.variables.map(v => (
              <button key={v.key} type="button" onClick={() => insertVar(v.key)}
                className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 hover:border-purple-300 hover:bg-purple-50 group">
                <p className="text-sm text-gray-800">{v.label}</p>
                <p className="text-[11px] font-mono text-purple-600">{`{{${v.key}}}`}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── Rule editor ───────────────────────────────────────────────────────────── */

const EMPTY_RULE: Rule = {
  name: '', description: '', active: true, trigger: 'student.created', scheduleHour: 9,
  conditionMatch: 'all', conditions: [], actions: [{ type: 'send_email', recipient: 'student', templateId: '' }],
};

function RecipientPicker({ action, meta, allowStudent, onChange }: {
  action: Action; meta: Meta; allowStudent: boolean; onChange: (patch: Partial<Action>) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{allowStudent ? 'Send to' : 'Assign to'}</label>
        <select value={action.recipient || ''} onChange={e => onChange({ recipient: e.target.value })} className={inputCls}>
          {meta.recipients.filter(r => allowStudent || r.key !== 'student').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>
      {action.recipient === 'role' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
          <select value={action.roleId || ''} onChange={e => onChange({ roleId: e.target.value })} className={inputCls}>
            <option value="">Choose role…</option>
            {meta.roles.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
          </select>
          {meta.roles.length === 0 && <p className="text-xs text-amber-600 mt-1">Create roles on the Roles page first.</p>}
        </div>
      )}
      {action.recipient === 'user' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Staff member</label>
          <select value={action.userId || ''} onChange={e => onChange({ userId: e.target.value })} className={inputCls}>
            <option value="">Choose…</option>
            {meta.staff.map(s => <option key={s._id} value={s._id}>{s.name} ({s.role === 'counselor' ? 'Counselor' : s.isAppTeam ? 'App Team' : 'Admin'})</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-gray-50 rounded-t-xl">
        <span className="text-[11px] font-bold tracking-wide text-white bg-purple-600 rounded-sm px-1.5 py-0.5">{n}</span>
        <span className="text-sm font-semibold text-gray-800">{title}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function RuleEditor({ rule, meta, templates, onClose, onSaved }: {
  rule?: Rule; meta: Meta; templates: Template[]; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<Rule>(() => rule ? JSON.parse(JSON.stringify(rule)) : JSON.parse(JSON.stringify(EMPTY_RULE)));
  const [saving, setSaving] = useState(false);
  const fields = fieldsForTrigger(meta, form.trigger);
  const counselors = meta.staff.filter(s => s.role === 'counselor');

  const setCond = (i: number, patch: Partial<Condition>) =>
    setForm(f => ({ ...f, conditions: f.conditions.map((c, j) => j === i ? { ...c, ...patch } : c) }));
  const setAction = (i: number, patch: Partial<Action>) =>
    setForm(f => ({ ...f, actions: f.actions.map((a, j) => j === i ? { ...a, ...patch } : a) }));

  const changeTrigger = (trigger: string) => {
    const allowed = new Set(fieldsForTrigger(meta, trigger).map(f => f.key));
    setForm(f => ({ ...f, trigger, conditions: f.conditions.filter(c => allowed.has(c.field)) }));
  };

  const changeActionType = (i: number, type: string) => {
    const defaults: Record<string, Partial<Action>> = {
      send_email: { recipient: 'student', templateId: '' },
      send_notification: { recipient: 'counselor', templateId: '' },
      create_task: { recipient: 'counselor', taskTitle: 'Follow up with {{student.name}}', taskPriority: 'medium', taskDueDays: 1 },
      assign_counselor: { userId: '' },
      change_stage: { leadStage: '' },
    };
    setForm(f => ({ ...f, actions: f.actions.map((a, j) => j === i ? { type, ...defaults[type] } : a) }));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (form._id) await api.automation.updateRule(form._id, form);
      else await api.automation.createRule(form);
      toast.success('Rule saved');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal wide title={form._id ? 'Edit workflow rule' : 'New workflow rule'} onClose={onClose} footer={<>
      <label className="mr-auto flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="accent-purple-600" />
        Rule is active
      </label>
      <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
      <button type="button" onClick={save} disabled={saving || !form.name.trim()}
        className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save rule'}
      </button>
    </>}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rule name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Welcome new UK leads" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="Optional" />
          </div>
        </div>

        <Step n="WHEN" title="What starts this rule?">
          <div className="grid sm:grid-cols-2 gap-3">
            <select value={form.trigger} onChange={e => changeTrigger(e.target.value)} className={inputCls}>
              {meta.triggers.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {form.trigger === 'schedule.daily' && (
              <select value={form.scheduleHour} onChange={e => setForm({ ...form, scheduleHour: Number(e.target.value) })} className={inputCls}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>at {fmtHour(h)} (IST)</option>)}
              </select>
            )}
          </div>
          {form.trigger === 'schedule.daily' && (
            <p className="text-xs text-gray-500">Checks every student once a day. Add conditions like <em>Days since signup is 3</em>. Each student gets it at most once per day.</p>
          )}
        </Step>

        <Step n="IF" title="Only when these conditions match (optional)">
          {form.conditions.length > 1 && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              Match
              <select value={form.conditionMatch} onChange={e => setForm({ ...form, conditionMatch: e.target.value as 'all' | 'any' })}
                className="border border-gray-200 rounded-lg px-2 py-1 text-sm">
                <option value="all">ALL conditions</option>
                <option value="any">ANY condition</option>
              </select>
            </div>
          )}
          {form.conditions.length === 0 && <p className="text-sm text-gray-500">No conditions. The rule runs every time.</p>}
          {form.conditions.map((c, i) => {
            const field = fields.find(f => f.key === c.field);
            const op = meta.operators.find(o => o.key === c.op);
            return (
              <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <select value={c.field} onChange={e => setCond(i, { field: e.target.value, value: '' })} className={`${inputCls} sm:w-56`}>
                  {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select value={c.op} onChange={e => setCond(i, { op: e.target.value })} className={`${inputCls} sm:w-44`}>
                  {meta.operators
                    .filter(o => field?.number ? !['contains', 'not_contains'].includes(o.key) : !['greater_than', 'less_than'].includes(o.key))
                    .map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                {!op?.noValue && (field?.options && ['equals', 'not_equals'].includes(c.op) ? (
                  <select value={c.value} onChange={e => setCond(i, { value: e.target.value })} className={inputCls}>
                    <option value="">Choose…</option>
                    {Object.entries(field.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                ) : (
                  <input value={c.value} onChange={e => setCond(i, { value: e.target.value })} type={field?.number ? 'number' : 'text'}
                    className={inputCls} placeholder={field?.number ? '0' : 'Value'} />
                ))}
                <button type="button" aria-label="Remove condition" onClick={() => setForm(f => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}
                  className="p-2 text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            );
          })}
          <button type="button" onClick={() => setForm(f => ({ ...f, conditions: [...f.conditions, { field: fields[0]?.key || '', op: 'equals', value: '' }] }))}
            className="text-sm text-purple-600 hover:underline flex items-center gap-1"><Plus className="w-4 h-4" /> Add condition</button>
        </Step>

        <Step n="THEN" title="Do these actions">
          {form.actions.map((a, i) => {
            const Icon = ACTION_ICONS[a.type] || Zap;
            const tplOptions = templates.filter(t => a.type === 'send_notification' || t.channel === 'email');
            return (
              <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-3 bg-white">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
                  <select value={a.type} onChange={e => changeActionType(i, e.target.value)} className={`${inputCls} sm:w-64`}>
                    {meta.actionTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <button type="button" aria-label="Remove action" onClick={() => setForm(f => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }))}
                    className="ml-auto p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>

                {(a.type === 'send_email' || a.type === 'send_notification') && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Template</label>
                      <select value={a.templateId || ''} onChange={e => setAction(i, { templateId: e.target.value })} className={inputCls}>
                        <option value="">Choose template…</option>
                        {tplOptions.map(t => <option key={t._id} value={t._id}>{t.name} · {t.channel === 'email' ? 'Email' : 'Notification'}</option>)}
                      </select>
                    </div>
                    <RecipientPicker action={a} meta={meta} allowStudent onChange={p => setAction(i, p)} />
                  </>
                )}

                {a.type === 'create_task' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Task title (fields like {'{{student.name}}'} allowed)</label>
                      <input value={a.taskTitle || ''} onChange={e => setAction(i, { taskTitle: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <textarea rows={2} value={a.taskDescription || ''} onChange={e => setAction(i, { taskDescription: e.target.value })} className={inputCls} />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                        <select value={a.taskPriority || 'medium'} onChange={e => setAction(i, { taskPriority: e.target.value })} className={inputCls}>
                          <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Due in (days)</label>
                        <input type="number" min={0} value={a.taskDueDays ?? 1} onChange={e => setAction(i, { taskDueDays: Number(e.target.value) })} className={inputCls} />
                      </div>
                    </div>
                    <RecipientPicker action={a} meta={meta} allowStudent={false} onChange={p => setAction(i, p)} />
                  </>
                )}

                {a.type === 'assign_counselor' && (
                  <select value={a.userId || ''} onChange={e => setAction(i, { userId: e.target.value })} className={inputCls}>
                    <option value="">Choose counselor…</option>
                    {counselors.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                )}

                {a.type === 'change_stage' && (
                  <select value={a.leadStage || ''} onChange={e => setAction(i, { leadStage: e.target.value })} className={inputCls}>
                    <option value="">Choose stage…</option>
                    {Object.entries(meta.leadStages).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => setForm(f => ({ ...f, actions: [...f.actions, { type: 'send_notification', recipient: 'counselor', templateId: '' }] }))}
            className="text-sm text-purple-600 hover:underline flex items-center gap-1"><Plus className="w-4 h-4" /> Add action</button>
        </Step>
      </div>
    </Modal>
  );
}

/* ── Test-run modal ────────────────────────────────────────────────────────── */

function RunRuleModal({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const { toast } = useToast();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => { api.admin.students({ fields: ['name', 'email'] }).then(setStudents).catch(() => toast.error('Failed to load students.')); }, [toast]);
  const filtered = students.filter(s => `${s.name} ${s.email}`.toLowerCase().includes(search.toLowerCase())).slice(0, 50);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      setResult(await api.automation.runRule(rule._id!, studentId));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal title={`Test "${rule.name}"`} onClose={onClose} footer={<>
      <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
      <button type="button" onClick={run} disabled={!studentId || running}
        className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
        <Play className="w-4 h-4" /> {running ? 'Running…' : 'Run now'}
      </button>
    </>}>
      <p className="text-sm text-gray-600 mb-3">
        Runs this rule's actions for one student right now (conditions are still checked). <strong>Emails and tasks are real.</strong>
      </p>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student…" className={`${inputCls} mb-2`} />
      <select size={6} value={studentId} onChange={e => setStudentId(e.target.value)} className={inputCls}>
        {filtered.map(s => <option key={s._id || s.id} value={s._id || s.id}>{s.name} · {s.email}</option>)}
      </select>
      {result && (
        <div className="mt-4 rounded-lg border p-3 text-sm">
          {!result.matched ? (
            <p className="text-amber-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{result.message}</p>
          ) : (
            <ul className="space-y-1">
              {result.log.actions.map((a: any, i: number) => (
                <li key={i} className="flex gap-2"><StatusIcon status={a.status} /><span>{a.detail}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-red-600 shrink-0" />;
  return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

type Tab = 'rules' | 'templates' | 'logs';

export default function AdminAutomation() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('rules');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState({ ruleId: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<Rule | 'new' | null>(null);
  const [runRule, setRunRule] = useState<Rule | null>(null);
  const [editTpl, setEditTpl] = useState<Partial<Template> | null>(null);
  const [tplFilter, setTplFilter] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [m, r, t] = await Promise.all([api.automation.meta(), api.automation.rules(), api.automation.templates()]);
      setMeta(m); setRules(r); setTemplates(t);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  // toast is a new object each render; its methods are stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLogs = useCallback(async () => {
    try { setLogs(await api.automation.logs(logFilter)); } catch (err: any) { toast.error(err.message); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  const tplById = useMemo(() => new Map(templates.map(t => [t._id, t])), [templates]);
  const categories = useMemo(() => [...new Set(templates.map(t => t.category))].sort(), [templates]);

  const summarizeCondition = (c: Condition) => {
    if (!meta) return '';
    const f = meta.fields.find(x => x.key === c.field);
    const o = meta.operators.find(x => x.key === c.op);
    const v = f?.options?.[c.value] ?? c.value;
    return `${f?.label || c.field} ${o?.label || c.op}${o?.noValue ? '' : ` "${v}"`}`;
  };

  const summarizeAction = (a: Action) => {
    if (!meta) return '';
    const who = meta.recipients.find(r => r.key === a.recipient)?.label
      .replace('Everyone in a role', meta.roles.find(r => r._id === a.roleId)?.name || 'role')
      .replace('A specific staff member', meta.staff.find(s => s._id === a.userId)?.name || 'staff');
    switch (a.type) {
      case 'send_email': return `Email "${tplById.get(a.templateId || '')?.name || '?'}" → ${who}`;
      case 'send_notification': return `Notify "${tplById.get(a.templateId || '')?.name || '?'}" → ${who}`;
      case 'create_task': return `Task "${a.taskTitle}" → ${who}`;
      case 'assign_counselor': return `Assign to ${meta.staff.find(s => s._id === a.userId)?.name || '?'}`;
      case 'change_stage': return `Stage → ${meta.leadStages[a.leadStage || ''] || '?'}`;
      default: return a.type;
    }
  };

  const toggleActive = async (r: Rule) => {
    try {
      await api.automation.setRuleActive(r._id!, !r.active);
      setRules(prev => prev.map(x => x._id === r._id ? { ...x, active: !r.active } : x));
    } catch (err: any) { toast.error(err.message); }
  };

  const deleteRule = async (r: Rule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    try { await api.automation.deleteRule(r._id!); toast.success('Rule deleted'); loadAll(); } catch (err: any) { toast.error(err.message); }
  };

  const deleteTpl = async (t: Template) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try { await api.automation.deleteTemplate(t._id); toast.success('Template deleted'); loadAll(); } catch (err: any) { toast.error(err.message); }
  };

  const testTpl = async (t: Template) => {
    try { toast.success((await api.automation.testTemplate(t._id)).message); } catch (err: any) { toast.error(err.message); }
  };

  const shownTemplates = templates.filter(t => !tplFilter || t.category === tplFilter);

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { key: 'rules', label: 'Workflow Rules', icon: Zap, count: rules.length },
    { key: 'templates', label: 'Templates', icon: FileText, count: templates.length },
    { key: 'logs', label: 'Logs', icon: History },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Zap className="w-6 h-6 text-purple-600" /> Automation</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            <strong>When</strong> something happens, <strong>if</strong> it matches your conditions, <strong>then</strong> send
            emails, notify the team, create tasks or update the student automatically.
          </p>
        </div>
        {tab === 'rules' && (
          <button type="button" onClick={() => setEditRule('new')} disabled={!meta}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            <Plus className="w-4 h-4" /> New rule
          </button>
        )}
        {tab === 'templates' && (
          <button type="button" onClick={() => setEditTpl({})} disabled={!meta}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            <Plus className="w-4 h-4" /> New template
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? 'border-purple-600 text-purple-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
            {t.count !== undefined && <span className="text-[11px] bg-gray-100 text-gray-600 rounded-full px-1.5">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading || !meta ? (
        <div className="p-10 flex justify-center"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : tab === 'rules' ? (
        rules.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
            <Zap className="w-10 h-10 text-purple-300 mx-auto mb-3" />
            <p className="font-medium text-gray-800">No workflow rules yet</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">Example: when a new student signs up → send the "Welcome new student" email.</p>
            <button type="button" onClick={() => setEditRule('new')} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700">Create your first rule</button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map(r => (
              <div key={r._id} className={`bg-white rounded-xl border p-4 ${r.active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{r.name}</h3>
                      {!r.active && <span className="text-[11px] bg-gray-100 text-gray-500 rounded-sm px-1.5 py-0.5">Paused</span>}
                    </div>
                    {r.description && <p className="text-sm text-gray-500">{r.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" role="switch" aria-checked={r.active} onClick={() => toggleActive(r)} title={r.active ? 'Pause' : 'Activate'}
                      className={`relative w-10 h-5 rounded-full transition-colors ${r.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${r.active ? 'left-5' : 'left-0.5'}`} />
                    </button>
                    <button type="button" title="Test on a student" onClick={() => setRunRule(r)} className="p-2 text-gray-500 hover:text-purple-700"><Play className="w-4 h-4" /></button>
                    <button type="button" title="Edit" onClick={() => setEditRule(r)} className="p-2 text-gray-500 hover:text-purple-700"><Pencil className="w-4 h-4" /></button>
                    <button type="button" title="Delete" onClick={() => deleteRule(r)} className="p-2 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="bg-blue-50 text-blue-700 rounded-full px-2.5 py-1">
                    {meta.triggers.find(t => t.key === r.trigger)?.label}{r.trigger === 'schedule.daily' ? ` · ${fmtHour(r.scheduleHour)}` : ''}
                  </span>
                  {r.conditions.map((c, i) => (
                    <span key={i} className="bg-amber-50 text-amber-800 rounded-full px-2.5 py-1">
                      {i > 0 && <span className="font-semibold">{r.conditionMatch === 'any' ? 'OR ' : 'AND '}</span>}{summarizeCondition(c)}
                    </span>
                  ))}
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                  {r.actions.map((a, i) => (
                    <span key={i} className="bg-purple-50 text-purple-700 rounded-full px-2.5 py-1">{summarizeAction(a)}</span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-gray-400">Ran {r.runCount || 0} time(s) · last {fmtDate(r.lastRunAt)}</p>
              </div>
            ))}
          </div>
        )
      ) : tab === 'templates' ? (
        <>
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {['', ...categories].map(c => (
                <button key={c || 'all'} type="button" onClick={() => setTplFilter(c)}
                  className={`text-sm px-3 py-1 rounded-full border ${tplFilter === c ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}>
                  {c || 'All'}
                </button>
              ))}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shownTemplates.map(t => (
              <div key={t._id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.channel === 'email' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                    {t.channel === 'email' ? <Mail className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{t.name}</h3>
                    <p className="text-[11px] text-gray-500">{t.category} · {t.channel === 'email' ? 'Email' : 'Notification'}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-800 font-medium line-clamp-1">{t.subject}</p>
                <p className="text-sm text-gray-500 line-clamp-3 whitespace-pre-line flex-1">{t.body}</p>
                <p className="text-[11px] text-gray-400 mt-2">
                  {t.usedBy?.length ? `Used by: ${t.usedBy.join(', ')}` : 'Not used by any rule'}
                </p>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
                  <button type="button" onClick={() => setEditTpl(t)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-purple-700 px-2 py-1"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                  <button type="button" onClick={() => setEditTpl({ ...t, _id: undefined, name: `${t.name} (copy)` })} className="flex items-center gap-1 text-xs text-gray-600 hover:text-purple-700 px-2 py-1"><Copy className="w-3.5 h-3.5" /> Duplicate</button>
                  {t.channel === 'email' && (
                    <button type="button" onClick={() => testTpl(t)} title="Send a test email to yourself" className="flex items-center gap-1 text-xs text-gray-600 hover:text-purple-700 px-2 py-1"><Send className="w-3.5 h-3.5" /> Test</button>
                  )}
                  <button type="button" onClick={() => deleteTpl(t)} className="ml-auto text-gray-400 hover:text-red-600 p-1" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex flex-wrap gap-2 p-3 border-b">
            <select value={logFilter.ruleId} onChange={e => setLogFilter(f => ({ ...f, ruleId: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">All rules</option>
              {rules.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
            </select>
            <select value={logFilter.status} onChange={e => setLogFilter(f => ({ ...f, status: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">All results</option>
              <option value="success">Success</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
            </select>
            <button type="button" onClick={loadLogs} className="ml-auto flex items-center gap-1 text-sm text-gray-600 hover:text-purple-700"><RefreshCw className="w-4 h-4" /> Refresh</button>
          </div>
          {logs.length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-500">No automation has run yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {logs.map(l => (
                <li key={l._id} className="p-4 flex gap-3">
                  <StatusIcon status={l.status === 'partial' ? 'skipped' : l.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900"><strong>{l.ruleName}</strong> ran for <strong>{l.studentName || '—'}</strong></p>
                    <ul className="mt-1 space-y-0.5">
                      {l.actions.map((a: any, i: number) => (
                        <li key={i} className={`text-xs ${a.status === 'failed' ? 'text-red-600' : a.status === 'skipped' ? 'text-amber-600' : 'text-gray-600'}`}>
                          • {meta.actionTypes.find(t => t.key === a.type)?.label}: {a.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editRule && meta && (
        <RuleEditor rule={editRule === 'new' ? undefined : editRule} meta={meta} templates={templates}
          onClose={() => setEditRule(null)} onSaved={() => { setEditRule(null); loadAll(); }} />
      )}
      {runRule && <RunRuleModal rule={runRule} onClose={() => { setRunRule(null); loadAll(); }} />}
      {editTpl && meta && (
        <TemplateEditor template={editTpl} meta={meta} categories={categories}
          onClose={() => setEditTpl(null)} onSaved={() => { setEditTpl(null); loadAll(); }} />
      )}
    </div>
  );
}
