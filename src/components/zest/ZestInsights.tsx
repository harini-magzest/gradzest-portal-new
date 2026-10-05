import { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, HelpCircle, RefreshCw, BookPlus, Check } from 'lucide-react';
import { api } from '../../api';

interface Analytics {
  days: number;
  total: number;
  rated: number;
  up: number;
  down: number;
  unanswered: { question: string; count: number; lastAsked: string }[];
  downvoted: { id: string; question: string; answer: string; comment: string; at: string }[];
}

// Turns a weak answer or an unanswered question into a knowledge-base entry: the admin writes the correct answer
// and it is saved as a small document Zest can find next time.
function AddToKnowledge({ question, suggested = '', onSaved }: { question: string; suggested?: string; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState(suggested);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  const save = async () => {
    setState('saving');
    setError('');
    try {
      await api.zest.addToKnowledge(question, answer);
      setState('saved');
      onSaved?.();
    } catch (err: any) {
      setError(err.message || 'Could not save this.');
      setState('idle');
    }
  };

  if (state === 'saved') return <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check className="w-3.5 h-3.5" aria-hidden="true" /> Added to the knowledge base</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800">
        <BookPlus className="w-3.5 h-3.5" aria-hidden="true" /> Add the correct answer
      </button>
    );
  }
  return (
    <div className="mt-2">
      <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`kb-${question.slice(0, 20)}`}>Correct answer</label>
      <textarea
        id={`kb-${question.slice(0, 20)}`}
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        rows={3}
        maxLength={4000}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Write the answer Zest should give for this question"
      />
      {error && <p role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
      <div className="flex gap-2 mt-1.5">
        <button type="button" onClick={save} disabled={!answer.trim() || state === 'saving'} className="text-xs font-medium bg-[#0d1b4b] text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
          {state === 'saving' ? 'Saving…' : 'Save to knowledge base'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 px-2">Cancel</button>
      </div>
    </div>
  );
}

// Where Zest is weak: questions it had nothing to ground an answer in (add a knowledge-base document for these)
// and answers people marked unhelpful.
export default function ZestInsights() {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try { setData(await api.zest.analytics(days)); } catch { setFailed(true); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [days]);

  const helpful = data && data.rated ? Math.round((data.up / data.rated) * 100) : null;

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Answer quality</h2>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600"
            aria-label="Period"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button type="button" onClick={load} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
      ) : failed || !data ? (
        <p className="text-sm text-gray-400 py-6 text-center">Could not load answer quality.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Questions asked" value={data.total} />
            <Stat label="Helpful" value={data.up} icon={<ThumbsUp className="w-4 h-4 text-emerald-600" />} />
            <Stat label="Not helpful" value={data.down} icon={<ThumbsDown className="w-4 h-4 text-red-500" />} />
            <Stat label="Helpful rate" value={helpful === null ? '—' : `${helpful}%`} />
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
              <HelpCircle className="w-4 h-4 text-amber-500" /> Questions with nothing to answer from
            </h3>
            {data.unanswered.length === 0 ? (
              <p className="text-sm text-gray-400">None in this period — every question matched a document or live data.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {data.unanswered.map(u => (
                  <li key={u.question} className="py-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-700">{u.question}</span>
                      <span className="flex-shrink-0 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{u.count}×</span>
                    </div>
                    <AddToKnowledge question={u.question} />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-400 mt-2">Upload a document covering these topics in the knowledge base above.</p>
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
              <ThumbsDown className="w-4 h-4 text-red-500" /> Recent unhelpful answers
            </h3>
            {data.downvoted.length === 0 ? (
              <p className="text-sm text-gray-400">No thumbs-down in this period.</p>
            ) : (
              <ul className="space-y-3">
                {data.downvoted.map(d => (
                  <li key={d.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                    <p className="font-medium text-gray-800">{d.question}</p>
                    <p className="text-gray-500 mt-1 line-clamp-3 whitespace-pre-wrap">{d.answer}</p>
                    {d.comment && <p className="mt-1 text-red-600">“{d.comment}”</p>}
                    <AddToKnowledge question={d.question} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">{icon}{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}
