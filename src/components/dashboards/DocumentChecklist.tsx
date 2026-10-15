import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock, Upload, XCircle, FileQuestion } from 'lucide-react';
import { api } from '../../api';

interface ChecklistItem {
  key: string;
  label: string;
  scope: string;
  uploadType: string;
  status: 'verified' | 'uploaded' | 'rejected' | 'requested' | 'missing';
  docName: string | null;
  warning?: { level: 'expired' | 'soon'; message: string };
}
interface Checklist {
  items: ChecklistItem[];
  countries: string[];
  summary: { total: number; verified: number; uploaded: number; missing: number; percent: number };
}

const STATUS: Record<ChecklistItem['status'], { label: string; cls: string; icon: React.ReactNode }> = {
  verified: { label: 'Verified', cls: 'text-emerald-700', icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" /> },
  uploaded: { label: 'Awaiting review', cls: 'text-blue-700', icon: <Clock className="w-4 h-4 text-blue-500" /> },
  rejected: { label: 'Rejected, upload again', cls: 'text-red-700', icon: <XCircle className="w-4 h-4 text-red-500" /> },
  requested: { label: 'Requested by your counselor', cls: 'text-amber-700', icon: <FileQuestion className="w-4 h-4 text-amber-500" /> },
  missing: { label: 'Not uploaded', cls: 'text-gray-500', icon: <Circle className="w-4 h-4 text-gray-300" /> },
};

// What a student still needs to provide: the standard documents plus those each destination country's visa asks
// for. With `studentId` it is the read-only staff view; without it, the student's own list with upload buttons.
export default function DocumentChecklist({ studentId }: { studentId?: string }) {
  const [data, setData] = useState<Checklist | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<ChecklistItem | null>(null);

  const load = useCallback(async () => {
    try { setData(await (studentId ? api.students.checklist(studentId) : api.students.myChecklist())); setError(''); }
    catch (err: any) { setError(err.message || 'Could not load the document checklist.'); }
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  const pick = (item: ChecklistItem) => { pending.current = item; fileRef.current?.click(); };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const item = pending.current;
    e.target.value = '';
    if (!file || !item) return;
    setBusy(item.key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', item.uploadType === 'Other' ? item.label : file.name.replace(/\.[^.]+$/, ''));
      fd.append('type', item.uploadType);
      await api.students.uploadDocument(fd);
      await load();
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setBusy(null);
    }
  };

  if (error && !data) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!data) return <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-sm text-gray-400">Loading checklist…</div>;

  const { summary } = data;
  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-900">Document checklist</h2>
        <span className="text-xs text-gray-500">
          {summary.verified} verified · {summary.uploaded} awaiting review · {summary.missing} still needed
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-1" role="progressbar" aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${summary.percent}%` }} />
      </div>
      <p className="text-xs text-gray-400 mb-4">
        {data.countries.length
          ? `Includes visa documents for ${data.countries.join(', ')}.`
          : studentId ? 'No destination country chosen yet, so only the standard documents are listed.' : 'Choose a preferred country in your profile to see its visa documents here.'}
      </p>
      {error && <p role="alert" className="text-sm text-red-600 mb-2">{error}</p>}
      <input ref={fileRef} type="file" className="hidden" aria-label="Choose document file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={onFile} />
      <ul className="divide-y divide-gray-50">
        {data.items.map(item => {
          const s = STATUS[item.status];
          const needsUpload = item.status === 'missing' || item.status === 'rejected' || item.status === 'requested';
          return (
            <li key={item.key} className="py-2.5 flex items-center gap-3 text-sm">
              {s.icon}
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 font-medium">
                  {item.label}
                  {item.scope !== 'all' && <span className="ml-2 text-[11px] font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{item.scope}</span>}
                </p>
                <p className={`text-xs ${s.cls}`}>{s.label}{item.docName && item.status !== 'missing' ? ` · ${item.docName}` : ''}</p>
                {item.warning && (
                  <p className={`mt-1 flex items-start gap-1.5 text-xs ${item.warning.level === 'expired' ? 'text-red-700' : 'text-amber-700'}`}>
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
                    <span>{item.warning.message}</span>
                  </p>
                )}
              </div>
              {!studentId && needsUpload && (
                <button
                  type="button"
                  onClick={() => pick(item)}
                  disabled={busy !== null}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                >
                  <Upload className="w-3.5 h-3.5" /> {busy === item.key ? 'Uploading…' : 'Upload'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
