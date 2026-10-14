import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Plus, Link2, QrCode, Pencil, Trash2, X, Check, Download, ExternalLink } from 'lucide-react';
import { api, type LeadForm, type LeadFormField, type LeadFormInput } from '../../api';
import { LEAD_FORM_FIELDS, formUrl } from '../../lib/leadFormFields';

// Admin → Settings → Forms. Like Bigin's form builder: each form has a public link and QR code, and every
// submission lands in Students as a "Web form" lead tagged with the form and campaign.

const EMPTY: Required<LeadFormInput> = {
  title: 'Start Your Study-Abroad Journey', intro: '', fields: ['email', 'preferredCountries'],
  thankYouMessage: 'Thank you! A Gradzest counselor will contact you shortly.', campaign: '',
};

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="presentation" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function FormEditor({ initial, onCancel, onSave }: {
  initial: LeadForm | null; onCancel: () => void; onSave: (data: Required<LeadFormInput>) => Promise<void>;
}) {
  const [form, setForm] = useState<Required<LeadFormInput>>(initial ? {
    title: initial.title, intro: initial.intro, fields: initial.fields,
    thankYouMessage: initial.thankYouMessage, campaign: initial.campaign,
  } : EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof LeadFormInput>(k: K, v: Required<LeadFormInput>[K]) => setForm(f => ({ ...f, [k]: v }));
  const toggleField = (key: LeadFormField) =>
    set('fields', form.fields.includes(key) ? form.fields.filter(f => f !== key) : [...form.fields, key]);

  const save = async () => {
    if (!form.title.trim()) { setErr('Give the form a title.'); return; }
    setErr(''); setSaving(true);
    try { await onSave(form); } catch (e: any) { setErr(e?.message || 'Could not save the form.'); setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="lf-title">Form title</label>
        <input id="lf-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. UK February Intake 2027" className={inputCls} />
        {!initial && <p className="text-xs text-gray-400 mt-1">The link is made from the title and stays the same afterwards, so printed QR codes keep working.</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="lf-intro">Intro text (optional)</label>
        <textarea id="lf-intro" value={form.intro} onChange={e => set('intro', e.target.value)} rows={2}
          placeholder="Shown under the title, e.g. Get free counselling for UK universities." className={`${inputCls} resize-none`} />
      </div>
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1.5">Questions</legend>
        <p className="text-xs text-gray-400 mb-2">First name, last name and phone are always asked.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {LEAD_FORM_FIELDS.map(f => (
            <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700 px-3 py-2 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={form.fields.includes(f.key)} onChange={() => toggleField(f.key)} className="accent-purple-600" />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="lf-campaign">Campaign name (optional)</label>
        <input id="lf-campaign" value={form.campaign} onChange={e => set('campaign', e.target.value)} placeholder="e.g. hyderabad_fair_2026" className={inputCls} />
        <p className="text-xs text-gray-400 mt-1">Saved on every lead from this form, unless the link has its own utm_campaign.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="lf-thanks">Thank-you message</label>
        <input id="lf-thanks" value={form.thankYouMessage} onChange={e => set('thankYouMessage', e.target.value)} className={inputCls} />
      </div>
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm font-semibold text-gray-600 rounded-xl hover:bg-gray-100">Cancel</button>
        <button type="button" onClick={save} disabled={saving}
          className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 shadow-md">
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Create form'}
        </button>
      </div>
    </div>
  );
}

function ShareForm({ form }: { form: LeadForm }) {
  const url = formUrl(form.slug);
  const qrRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  const download = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${form.slug}-qr.png`;
    a.click();
  };
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1.5">Form link</p>
        <div className="flex gap-2">
          <input readOnly value={url} aria-label="Form link" className={`${inputCls} bg-gray-50`} onFocus={e => e.target.select()} />
          <button type="button" onClick={copy} className="px-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap">
            {copied ? <span className="inline-flex items-center gap-1 text-green-600"><Check className="w-4 h-4" />Copied</span> : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          To see which ad or post a lead came from, add tags to the link, e.g. <code className="bg-gray-100 px-1 rounded">?utm_source=instagram</code>
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <div ref={qrRef} className="p-3 bg-white border border-gray-100 rounded-xl">
          <QRCodeCanvas value={url} size={200} marginSize={2} />
        </div>
        <button type="button" onClick={download}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700">
          <Download className="w-4 h-4" /> Download QR code
        </button>
      </div>
    </div>
  );
}

export default function AdminForms() {
  const [forms, setForms] = useState<LeadForm[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<LeadForm | 'new' | null>(null);
  const [sharing, setSharing] = useState<LeadForm | null>(null);

  useEffect(() => {
    api.forms.list().then(setForms).catch(e => setError(e?.message || 'Could not load forms.'));
  }, []);

  const replace = (f: LeadForm) => setForms(list => (list || []).map(x => (x.id === f.id ? f : x)));

  const save = async (data: Required<LeadFormInput>) => {
    if (editing === 'new') {
      const created = await api.forms.create(data);
      setForms(list => [created, ...(list || [])]);
      setEditing(null);
      setSharing(created);
    } else if (editing) {
      replace(await api.forms.update(editing.id, data));
      setEditing(null);
    }
  };

  const toggle = async (f: LeadForm) => {
    replace({ ...f, active: !f.active });
    try { replace(await api.forms.update(f.id, { active: !f.active })); }
    catch (e: any) { replace(f); setError(e?.message || 'Could not update the form.'); }
  };

  const remove = async (f: LeadForm) => {
    if (!window.confirm(`Delete "${f.title}"? Its link and QR code will stop working. Leads it already created are kept.`)) return;
    try { await api.forms.remove(f.id); setForms(list => (list || []).filter(x => x.id !== f.id)); }
    catch (e: any) { setError(e?.message || 'Could not delete the form.'); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-900">Forms</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
            Build enquiry forms to share as a link or QR code. Each submission is added to Students as a new lead, tagged with the form and campaign.
          </p>
        </div>
        <button type="button" onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700">
          <Plus className="w-4 h-4" /> New Form
        </button>
      </div>

      {error && <p className="m-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}

      {forms === null && !error && <p className="p-6 text-sm text-gray-400">Loading forms…</p>}
      {forms?.length === 0 && (
        <div className="p-10 text-center">
          <p className="text-sm font-semibold text-gray-700">No forms yet</p>
          <p className="text-xs text-gray-400 mt-1">Create one for your next campaign, fair or social media post.</p>
        </div>
      )}
      {!!forms?.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
                <th className="px-6 py-3">Form title</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Submissions</th>
                <th className="px-3 py-3">Created by</th>
                <th className="px-6 py-3 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {forms.map(f => (
                <tr key={f.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-6 py-3">
                    <p className="font-semibold text-gray-900">{f.title}</p>
                    <a href={formUrl(f.slug)} target="_blank" rel="noreferrer" className="text-xs text-purple-600 hover:underline inline-flex items-center gap-1">
                      /f/{f.slug} <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-3 py-3">
                    <button type="button" role="switch" aria-checked={f.active} aria-label={`${f.title}: accepting responses`} onClick={() => toggle(f)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${f.active ? 'bg-green-500' : 'bg-gray-200'}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${f.active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-700">{f.submissions}</td>
                  <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                    {f.createdByName || '—'}
                    <span className="block text-xs text-gray-400">{new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => setSharing(f)} aria-label={`Share ${f.title}`} title="Link and QR code"
                        className="p-2 rounded-lg text-gray-500 hover:bg-purple-50 hover:text-purple-600"><QrCode className="w-4 h-4" /></button>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(formUrl(f.slug)).catch(() => {})} aria-label={`Copy link for ${f.title}`} title="Copy link"
                        className="p-2 rounded-lg text-gray-500 hover:bg-purple-50 hover:text-purple-600"><Link2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setEditing(f)} aria-label={`Edit ${f.title}`} title="Edit"
                        className="p-2 rounded-lg text-gray-500 hover:bg-purple-50 hover:text-purple-600"><Pencil className="w-4 h-4" /></button>
                      <button type="button" onClick={() => remove(f)} aria-label={`Delete ${f.title}`} title="Delete"
                        className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New form' : 'Edit form'} onClose={() => setEditing(null)}>
          <FormEditor initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSave={save} />
        </Modal>
      )}
      {sharing && (
        <Modal title={`Share "${sharing.title}"`} onClose={() => setSharing(null)}>
          <ShareForm form={sharing} />
        </Modal>
      )}
    </div>
  );
}
