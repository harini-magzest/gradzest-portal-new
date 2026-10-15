import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export const LEAD_STAGES = [
  { value: 'new_enquiry',   label: 'New Enquiry',   className: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'interested',    label: 'Interested',    className: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'counselling',   label: 'Counselling',   className: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'shortlisting',  label: 'Shortlisting',  className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'applications',  label: 'Applications',  className: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'visa_process',  label: 'Visa Process',  className: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'visa_approved', label: 'Visa Approved', className: 'bg-teal-100 text-teal-700 border-teal-200' },
  { value: 'enrolment',     label: 'Enrolment',     className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'future_lead',   label: 'Future Lead',   className: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { value: 'other_agent',   label: 'Other Agent',   className: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
  { value: 'dropped_plans', label: 'Dropped Plans', className: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'test_prep',     label: 'Test Prep',     className: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'dnd',           label: 'DND',           className: 'bg-rose-100 text-rose-700 border-rose-200' },
  { value: 'not_responding',label: 'Not Responding',className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'other',         label: 'Other',         className: 'bg-gray-100 text-gray-700 border-gray-200' },
] as const;

/** The forward-moving stages shown as the pipeline stepper; the rest (DND, Dropped Plans, …) are side outcomes. */
export const PIPELINE_STAGES = LEAD_STAGES.slice(0, 8);

export const leadStageOf = (student: any) =>
  LEAD_STAGES.find(s => s.value === student?.leadStage) ?? LEAD_STAGES[0];

/**
 * Lead stage pill. When editable, clicking it opens a searchable list; the pick is only
 * saved after ✓ (✗ or Escape cancels), like the Zoho lead-stage editor.
 */
export default function LeadStageSelect({ value, onSave, editable = true, size = 'sm' }: {
  value?: string;
  onSave: (stage: string) => Promise<unknown>;
  editable?: boolean;
  size?: 'sm' | 'md';
}) {
  const current = LEAD_STAGES.find(s => s.value === value) ?? LEAD_STAGES[0];
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(current.value);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 200 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const pad = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';

  const openList = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 200) });
    setQuery('');
    setOpen(true);
  };

  const start = () => { setDraft(current.value); setError(''); setEditing(true); setTimeout(openList, 0); };
  const cancel = () => { setOpen(false); setEditing(false); setError(''); };
  const save = async () => {
    if (draft === current.value) { cancel(); return; }
    setSaving(true); setError('');
    try { await onSave(draft); setOpen(false); setEditing(false); }
    catch (err: any) { setError(err.message || 'Could not update stage'); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);

  // Close the list on outside click, scroll or resize (it is fixed-positioned)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!listRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    const close = () => setOpen(false);
    // Scrolling the option list itself must not close it
    const onScroll = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!editing) {
    return (
      <button type="button" disabled={!editable}
        onClick={e => { e.preventDefault(); e.stopPropagation(); start(); }}
        title={editable ? 'Change lead stage' : 'Lead stage'}
        className={`inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap ${pad} ${current.className} ${editable ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}`}>
        {current.label}
        {editable && <ChevronDown className="w-3 h-3 opacity-60" />}
      </button>
    );
  }

  const draftLabel = LEAD_STAGES.find(s => s.value === draft)?.label;
  const options = LEAD_STAGES.filter(s => s.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="inline-flex flex-col gap-1" onClick={e => { e.preventDefault(); e.stopPropagation(); }}
      onKeyDown={e => { if (e.key === 'Escape') cancel(); }}>
      <div className="inline-flex items-center gap-1.5">
        <button ref={triggerRef} type="button" onClick={() => (open ? setOpen(false) : openList())}
          aria-haspopup="listbox" aria-expanded={open}
          className={`inline-flex items-center justify-between gap-2 min-w-[9.5rem] rounded-lg border border-green-500 bg-white text-gray-800 ${pad}`}>
          {draftLabel}<ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        </button>
        <button type="button" onClick={save} disabled={saving} aria-label="Save stage"
          className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center hover:bg-green-700 disabled:opacity-50">
          {saving ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={cancel} aria-label="Cancel"
          className="w-7 h-7 rounded-full border border-gray-300 text-gray-500 flex items-center justify-center hover:bg-gray-50">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {error && <span className="text-[11px] text-red-600">{error}</span>}

      {open && (
        <div ref={listRef} role="listbox" style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="fixed z-[60] bg-white border border-gray-200 rounded-xl shadow-xl p-1.5">
          <div className="relative mb-1">
            <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search"
              aria-label="Search stages"
              onKeyDown={e => { if (e.key === 'Enter' && options[0]) { setDraft(options[0].value); setOpen(false); } }}
              className="w-full pl-2.5 pr-7 py-1.5 border border-green-500 rounded-lg text-sm focus:outline-none" />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2" />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-gray-400">No match</p>
            ) : options.map(s => (
              <button key={s.value} type="button" role="option" aria-selected={s.value === draft}
                onClick={() => { setDraft(s.value); setOpen(false); }}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-sm ${s.value === draft ? 'bg-blue-50 text-blue-800 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
