import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../api';

type Row = Awaited<ReturnType<typeof api.privacy.adminList>>[number];

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800', completed: 'bg-gray-100 text-gray-600', declined: 'bg-red-50 text-red-700', cancelled: 'bg-gray-100 text-gray-500',
};

// Students' requests to have their personal data erased. Completing one is permanent, so it asks twice.
export default function AdminPrivacy() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await api.privacy.adminList()); setError(''); }
    catch (err: any) { setError(err?.message || 'Could not load requests.'); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const complete = async (r: Row) => {
    if (!window.confirm(`Permanently erase ${r.name || 'this student'}'s personal data?\n\nTheir profile, documents, messages and history will be removed and the account closed. This cannot be undone.`)) return;
    const note = window.prompt('Note for the record (optional):', '') ?? '';
    setBusy(r.id);
    try { await api.privacy.complete(r.id, note); await load(); }
    catch (err: any) { setError(err?.message || 'Could not complete that request.'); }
    finally { setBusy(null); }
  };

  const decline = async (r: Row) => {
    const note = window.prompt('Why is this being declined? The student will see this:', '');
    if (!note?.trim()) return;
    setBusy(r.id);
    try { await api.privacy.decline(r.id, note); await load(); }
    catch (err: any) { setError(err?.message || 'Could not decline that request.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Data deletion requests</h1>
        <p className="text-sm text-gray-500 mt-1">Check for a live application or a legal reason to keep the data before you complete a request. Security logs are kept; everything else about the student is erased or made anonymous.</p>
      </div>
      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {!rows && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 p-6">No requests.</p>}
      <ul className="space-y-3">
        {(rows || []).map(r => (
          <li key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{r.name || 'Student'} <span className="font-normal text-sm text-gray-400">{r.email}</span></p>
                <p className="text-xs text-gray-500">Asked {new Date(r.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                {r.reason && <p className="text-sm text-gray-600 mt-2">“{r.reason}”</p>}
                {r.status !== 'pending' && r.handledAt && <p className="text-xs text-gray-400 mt-2">{r.status} by {r.handledByName || 'an admin'}{r.adminNote ? `: ${r.adminNote}` : ''}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_CLS[r.status] || ''}`}>{r.status}</span>
                {r.status === 'pending' && (
                  <>
                    <button type="button" disabled={busy === r.id} onClick={() => decline(r)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Decline</button>
                    <button type="button" disabled={busy === r.id} onClick={() => complete(r)} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-50">Erase data</button>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
