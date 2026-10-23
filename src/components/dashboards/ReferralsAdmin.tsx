import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

type Data = Awaited<ReturnType<typeof api.referrals.all>>;

const STATUS: Record<string, string> = { signed_up: 'Signed up', applied: 'Applied', offer: 'Has an offer', enrolled: 'Enrolled' };

// Every referral, and who is owed a reward. A reward is earned when the referred student enrolls; mark it given once
// paid out.
export default function ReferralsAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.referrals.all()); setError(''); }
    catch (err: any) { setError(err?.message || 'Could not load referrals.'); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const setPaid = async (id: string, paid: boolean) => {
    let note: string | undefined;
    if (paid) {
      const entered = window.prompt('Note for the record (optional), e.g. "Voucher sent":', '');
      if (entered === null) return;
      note = entered;
    }
    setBusy(id);
    try { await api.referrals.setPaid(id, paid, note); await load(); }
    catch (err: any) { setError(err?.message || 'Could not update that referral.'); }
    finally { setBusy(null); }
  };

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-semibold text-gray-900">Referrals</h2>
        {data && <span className="text-xs text-gray-500">{data.stats.total} total · {data.stats.earned} earned · <span className={data.stats.owed ? 'text-amber-700 font-medium' : ''}>{data.stats.owed} to pay</span></span>}
      </div>
      {error && <p role="alert" className="text-sm text-red-600 mb-2">{error}</p>}
      {!data && !error ? <p className="text-sm text-gray-400 py-4 text-center">Loading…</p> : data && data.referrals.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No referrals yet.</p>
      ) : data ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 font-medium">Referred by</th>
                <th className="py-2 font-medium">Friend</th>
                <th className="py-2 font-medium">Progress</th>
                <th className="py-2 font-medium">Reward</th>
              </tr>
            </thead>
            <tbody>
              {data.referrals.map(r => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 text-gray-800">{r.referrerName}<span className="block text-xs text-gray-400">{r.referrerEmail}</span></td>
                  <td className="py-2.5 text-gray-700">{r.referredName}</td>
                  <td className="py-2.5 text-gray-600">{STATUS[r.status] || r.status}</td>
                  <td className="py-2.5">
                    {r.paid ? (
                      <span className="inline-flex items-center gap-2 text-emerald-700 text-xs">Given{r.paidNote ? ` · ${r.paidNote}` : ''}
                        <button type="button" disabled={busy === r.id} onClick={() => setPaid(r.id, false)} className="underline text-gray-500">undo</button>
                      </span>
                    ) : r.rewardEarned ? (
                      <button type="button" disabled={busy === r.id} onClick={() => setPaid(r.id, true)} className="px-3 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100 disabled:opacity-50">Mark as given</button>
                    ) : <span className="text-xs text-gray-400">Not earned yet</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
