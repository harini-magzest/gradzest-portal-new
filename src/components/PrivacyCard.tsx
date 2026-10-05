import { useCallback, useEffect, useState } from 'react';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../api';

type Request = Awaited<ReturnType<typeof api.privacy.myRequest>>['request'];

// A student's own data rights: download everything held about them, or ask for it to be erased. Erasure is reviewed
// by an admin (a live application may need finishing first) and cannot be undone once done.
export default function PrivacyCard() {
  const [request, setRequest] = useState<Request>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Accounts added by staff from a phone call may have no password; they confirm with their email instead
  const [hasPassword, setHasPassword] = useState(true);

  const load = useCallback(async () => {
    try { const r = await api.privacy.myRequest(); setRequest(r.request); setHasPassword(r.hasPassword); } catch { /* shown as "no request" */ } finally { setLoaded(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setExporting(true);
    setError('');
    try { await api.privacy.downloadExport(); } catch (err: any) { setError(err?.message || 'Could not prepare your download.'); } finally { setExporting(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setRequest(await api.privacy.requestDeletion({ reason: reason.trim() || undefined, ...(hasPassword ? { password: secret } : { confirmEmail: secret }) }));
      setOpen(false);
      setSecret('');
      setReason('');
    } catch (err: any) {
      setError(err?.message || 'Could not send your request.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setError('');
    try { setRequest(await api.privacy.cancelRequest()); } catch (err: any) { setError(err?.message || 'Could not cancel.'); }
  };

  const pending = request?.status === 'pending';

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1"><ShieldCheck className="w-4 h-4" /> Your data</h2>
      <p className="text-sm text-gray-500 mb-4">You can download everything we hold about you, or ask us to erase it.</p>

      {error && <p role="alert" className="text-sm text-red-600 mb-3">{error}</p>}

      <button type="button" onClick={download} disabled={exporting} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        <Download className="w-4 h-4" /> {exporting ? 'Preparing…' : 'Download my data'}
      </button>

      <div className="mt-5 pt-5 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-500" /> Delete my data</h3>

        {loaded && pending && (
          <div role="status" className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            Your request was sent on {new Date(request!.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} and is waiting for review.
            <button type="button" onClick={cancel} className="ml-2 underline">Cancel request</button>
          </div>
        )}
        {loaded && request?.status === 'declined' && (
          <p role="status" className="mt-2 text-sm text-gray-600">Your last request was not carried out: {request.adminNote || 'please contact your counselor'}.</p>
        )}
        {loaded && request?.status === 'completed' && <p role="status" className="mt-2 text-sm text-gray-600">Your data has been erased.</p>}

        {!pending && !open && (
          <>
            <p className="text-sm text-gray-500 mt-2">This removes your profile, documents, messages and history, and closes your account. We keep only anonymous application counts. It cannot be undone.</p>
            <button type="button" onClick={() => setOpen(true)} className="mt-3 px-4 py-2 rounded-xl border border-red-200 text-sm font-medium text-red-700 hover:bg-red-50">Ask us to delete my data</button>
          </>
        )}

        {!pending && open && (
          <form onSubmit={submit} className="mt-3 space-y-3">
            <label className="block text-sm text-gray-600">Why are you leaving? (optional)
              <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm text-gray-600">{hasPassword ? 'Your password, to confirm it is you' : 'Type your account email to confirm'}
              <input type={hasPassword ? 'password' : 'email'} required value={secret} onChange={e => setSecret(e.target.value)} autoComplete={hasPassword ? 'current-password' : 'email'} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy || !secret} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50">{busy ? 'Sending…' : 'Send request'}</button>
              <button type="button" onClick={() => { setOpen(false); setSecret(''); setError(''); }} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Never mind</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
