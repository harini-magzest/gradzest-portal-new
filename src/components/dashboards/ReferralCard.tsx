import { useEffect, useState } from 'react';
import { Check, Copy, Gift } from 'lucide-react';
import { api } from '../../api';

type Data = Awaited<ReturnType<typeof api.referrals.mine>>;

const STATUS: Record<string, { label: string; cls: string }> = {
  signed_up: { label: 'Signed up', cls: 'bg-gray-100 text-gray-600' },
  applied: { label: 'Applied', cls: 'bg-blue-50 text-blue-700' },
  offer: { label: 'Has an offer', cls: 'bg-amber-50 text-amber-700' },
  enrolled: { label: 'Enrolled', cls: 'bg-emerald-50 text-emerald-700' },
};

// A student's personal sign-up link and how the friends who used it are getting on.
export default function ReferralCard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => api.referrals.mine())
      .then(d => { if (live) setData(d); })
      .catch(err => { if (live) setError(err?.message || 'Could not load your referral link.'); });
    return () => { live = false; };
  }, []);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it by hand.');
    }
  };

  if (error && !data) return <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;
  if (!data) return <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-sm text-gray-400">Loading…</div>;

  return (
    <section className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1"><Gift className="w-4 h-4" /> Refer a friend</h2>
      <p className="text-sm text-gray-500 mb-4">
        Share your link. When a friend signs up with it and enrolls, you earn a reward{data.rewardText ? `: ${data.rewardText}` : ''}.
      </p>
      <div className="flex items-center gap-2">
        <input readOnly value={data.link} aria-label="Your referral link" onFocus={e => e.target.select()} className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50" />
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm">
          {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">Your code: <span className="font-mono font-semibold text-gray-600">{data.code}</span></p>
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}

      {data.referrals.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-500 mb-2">{data.stats.total} joined · {data.stats.enrolled} enrolled{data.stats.paid ? ` · ${data.stats.paid} rewarded` : ''}</p>
          <ul className="divide-y divide-gray-50">
            {data.referrals.map((r, i) => (
              <li key={i} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-800">{r.name}</span>
                <span className="flex items-center gap-2">
                  {r.rewardPaid && <span className="text-xs text-emerald-700">Reward given</span>}
                  {r.rewardEarned && !r.rewardPaid && <span className="text-xs text-amber-700">Reward on its way</span>}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS[r.status]?.cls || ''}`}>{STATUS[r.status]?.label || r.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
