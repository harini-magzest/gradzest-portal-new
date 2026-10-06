import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Users } from 'lucide-react';
import { api } from '../../api';

type Link = Awaited<ReturnType<typeof api.parentLinks.list>>[number];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

// Lets a student share a read-only view of their progress with a parent. The link is shown once, right after it is
// created; after that it can only be revoked.
export default function ParentAccessCard() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState<{ url: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setLinks(await api.parentLinks.list()); }
    catch (err: any) { setError(err?.message || 'Could not load your parent links.'); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const made = await api.parentLinks.create({ label: label.trim() });
      setFresh({ url: made.url, label: made.label });
      setLabel('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not create the link.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (l: Link) => {
    if (!window.confirm(`Stop sharing${l.label ? ` with ${l.label}` : ''}? The link will stop working immediately.`)) return;
    try { await api.parentLinks.revoke(l.id); await load(); }
    catch (err: any) { setError(err?.message || 'Could not remove that link.'); }
  };

  const copy = async () => {
    if (!fresh) return;
    try { await navigator.clipboard.writeText(fresh.url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Could not copy. Select the link and copy it by hand.'); }
  };

  const active = (links || []).filter(l => l.active);

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1"><Users className="w-4 h-4" /> Share progress with a parent</h2>
      <p className="text-sm text-gray-500 mb-4">
        Give a parent or guardian a private link to see your application progress, missing documents and upcoming calls.
        It never shows your contact details, passport, files or messages, and you can stop it any time.
      </p>

      <form onSubmit={create} className="flex flex-wrap items-center gap-2">
        <input value={label} onChange={e => setLabel(e.target.value)} maxLength={60} placeholder="Who is it for? (e.g. Mum)" aria-label="Who the link is for" className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-medium disabled:opacity-50">{busy ? 'Creating…' : 'Create link'}</button>
      </form>

      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}

      {fresh && (
        <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <p className="text-sm font-medium text-emerald-800 mb-2">Link for {fresh.label || 'your parent'} — copy it now, it will not be shown again.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={fresh.url} aria-label="Parent link" onFocus={e => e.target.select()} className="flex-1 min-w-0 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white" />
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm">
              {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
            </button>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-50">
          {active.map(l => (
            <li key={l.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="text-gray-800 font-medium">{l.label || 'Parent link'}</p>
                <p className="text-xs text-gray-400">Expires {fmt(l.expiresAt)} · opened {l.viewCount} time{l.viewCount === 1 ? '' : 's'} · last {fmt(l.lastViewedAt)}</p>
              </div>
              <button type="button" onClick={() => revoke(l)} className="text-xs font-medium text-red-600 hover:underline flex-shrink-0">Stop sharing</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
