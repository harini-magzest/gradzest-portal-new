import { useState } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import { api } from '../api';

// Staff-entered tags and key/value details on a course, which feed the course-finder filters.

const SUGGESTED_TAGS = ['STEM', 'No IELTS', 'IELTS Waiver', 'Scholarship', 'Internship', 'Placement', 'Co-op', 'Part-time', 'Online', 'Fast-track', 'Loan Partner', 'High Visa Success', 'Spouse Allowed'];
const SUGGESTED_KEYS = ['Post-study work visa (years)', 'Scholarship %', 'Min IELTS waiver', 'GRE/GMAT required', 'Placement rate %', 'Internship', 'Credit transfer', 'Backlogs accepted', 'Gap accepted (years)', 'Offer turnaround (days)'];

export function CourseCustomChips({ course }: { course: any }) {
  const tags: string[] = course.tags || [];
  const fields: { key: string; value: string }[] = course.customFields || [];
  if (!tags.length && !fields.length) return null;
  return (
    <div className="space-y-1.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map(t => <span key={t} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">#{t}</span>)}
        </div>
      )}
      {fields.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {fields.map(f => <span key={f.key} className="text-[11px] text-gray-500"><span className="text-gray-400">{f.key}:</span> <span className="font-medium text-gray-700">{f.value}</span></span>)}
        </div>
      )}
    </div>
  );
}

export default function CourseCustomDataModal({ course, uniId, knownTags = [], knownKeys = [], onClose, onSaved }: {
  course: any;
  uniId: string;
  knownTags?: string[];
  knownKeys?: string[];
  onClose: () => void;
  onSaved: (updated: { tags: string[]; customFields: { key: string; value: string }[] }) => void;
}) {
  const [tags, setTags] = useState<string[]>(course.tags || []);
  const [tagText, setTagText] = useState('');
  const [fields, setFields] = useState<{ key: string; value: string }[]>(course.customFields?.length ? course.customFields : [{ key: '', value: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const tagSuggestions = Array.from(new Set([...knownTags, ...SUGGESTED_TAGS])).filter(t => !tags.some(x => x.toLowerCase() === t.toLowerCase()));
  const keySuggestions = Array.from(new Set([...knownKeys, ...SUGGESTED_KEYS]));

  const addTag = (t: string) => {
    const v = t.trim();
    if (v && !tags.some(x => x.toLowerCase() === v.toLowerCase())) setTags([...tags, v]);
    setTagText('');
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const pending = tagText.trim() && !tags.some(x => x.toLowerCase() === tagText.trim().toLowerCase()) ? [...tags, tagText.trim()] : tags;
      const data = { tags: pending, customFields: fields.filter(f => f.key.trim() && f.value.trim()) };
      const updated = await api.universities.updateCourseCustom(uniId, String(course._id || course.id), data);
      onSaved({ tags: updated.tags || [], customFields: updated.customFields || [] });
    } catch (err: any) {
      setError(err.message || 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Tag className="w-4 h-4" /> Tags &amp; details</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{course.name} · {course.uniName || course._uniName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto min-h-0">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  #{t}
                  <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} aria-label={`Remove ${t}`} className="opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={tagText} onChange={e => setTagText(e.target.value)} maxLength={40}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagText); } }}
                placeholder="Type a tag and press Enter" className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button type="button" onClick={() => addTag(tagText)} disabled={!tagText.trim()} className="px-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {tagSuggestions.slice(0, 14).map(s => (
                <button key={s} type="button" onClick={() => addTag(s)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600">+ {s}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Custom details</label>
            <p className="text-xs text-gray-400 mb-2">Use numbers where you can (e.g. "2" years) so the finder can filter with ≥ and ≤.</p>
            <datalist id="course-custom-keys">{keySuggestions.map(k => <option key={k} value={k} />)}</datalist>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input value={f.key} onChange={e => setFields(fields.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} list="course-custom-keys"
                    placeholder="Detail, e.g. Post-study work visa (years)" aria-label="Detail name" maxLength={60}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <input value={f.value} onChange={e => setFields(fields.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                    placeholder="Value, e.g. 2" aria-label="Detail value" maxLength={200}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button type="button" onClick={() => setFields(fields.filter((_, j) => j !== i))} aria-label="Remove detail" className="px-2 text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setFields([...fields, { key: '', value: '' }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
              <Plus className="w-3.5 h-3.5" /> Add detail
            </button>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
