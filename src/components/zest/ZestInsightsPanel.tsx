import { useCallback, useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, HelpCircle, RefreshCw, BookPlus, Check, Wrench } from 'lucide-react';
import { api } from '../../api';

interface Analytics {
  days: number;
  total: number;
  rated: number;
  up: number;
  down: number;
  // Answers given from the knowledge base alone because the AI was unavailable.
  degraded?: number;
  toolUsage?: { tool: string; count: number }[];
  unanswered: { question: string; count: number; lastAsked: string }[];
  downvoted: { id: string; question: string; answer: string; comment: string; at: string }[];
}

// Plain names for the live lookups Zest can run, for the "what people use Zest for" list.
const TOOL_LABELS: Record<string, string> = {
  lookup_student_status: 'Student lookups',
  list_my_students: 'Student lists',
  pipeline_summary: 'Pipeline summaries',
  list_my_open_tasks: 'Task lists',
  list_open_lead_alerts: 'Lead alert checks',
  search_universities: 'University searches',
  my_status: 'Student progress checks',
  my_upcoming: 'Student calendars',
  my_day_brief: 'Day briefs',
  draft_followup_message: 'Follow-up drafts',
  get_chat_for_reply: 'Chat reply help',
  conversion_report: 'Conversion reports',
  get_zest_insights: 'Zest insight questions',
  list_knowledge_documents: 'Knowledge base checks',
};

// Turns a weak answer or an unanswered question into a knowledge-base entry: the admin writes the correct answer
// and it is saved as a small document Zest can find next time.
function AddToKnowledge({ question }: { question: string }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  const save = async () => {
    setState('saving');
    setError('');
    try {
      await api.zest.addToKnowledge(question, answer);
      setState('saved');
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
      <label className="block text-xs font-medium text-gray-600 mb-1">
        Correct answer
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          rows={3}
          maxLength={4000}
          className="mt-1 w-full text-sm font-normal border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Write the answer Zest should give for this question"
        />
      </label>
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

function Stat({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">{icon}{label}</div>
      <div className="text-lg font-bold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}

// Where Zest is weak: questions it had nothing to ground an answer in, and answers people marked unhelpful.
export default function ZestInsightsPanel() {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try { setData(await api.zest.analytics(days)); } catch { setFailed(true); } finally { setLoading(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const helpful = data && data.rated ? Math.round((data.up / data.rated) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Where Zest is weak, so you know what to add.</p>
        <div className="flex items-center gap-1">
          <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Period"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button type="button" onClick={load} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : failed || !data ? (
        <p className="text-sm text-gray-400 py-8 text-center">Could not load answer quality.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Questions asked" value={data.total} />
            <Stat label="Helpful rate" value={helpful === null ? '—' : `${helpful}%`} />
            <Stat label="Helpful" value={data.up} icon={<ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />} />
            <Stat label="Not helpful" value={data.down} icon={<ThumbsDown className="w-3.5 h-3.5 text-red-500" />} />
          </div>

          {(data.degraded ?? 0) > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              The AI was unavailable {data.degraded} time{data.degraded === 1 ? '' : 's'} in this period, so those answers came from the knowledge base alone.
            </p>
          )}

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
              <Wrench className="w-4 h-4 text-gray-500" /> What people use Zest for
            </h3>
            {!data.toolUsage?.length ? (
              <p className="text-sm text-gray-400">No live lookups in this period. Everything was answered from documents or general knowledge.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.toolUsage.map(t => (
                  <li key={t.tool} className="text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-700">{TOOL_LABELS[t.tool] || t.tool}</span>
                      <span className="text-xs text-gray-500">{t.count}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-gray-100" aria-hidden="true">
                      <div className="h-1.5 rounded-full bg-[#0d1b4b]/70" style={{ width: `${Math.max(4, Math.round((t.count / data.toolUsage![0].count) * 100))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
              <HelpCircle className="w-4 h-4 text-amber-500" /> Nothing to answer from
            </h3>
            {data.unanswered.length === 0 ? (
              <p className="text-sm text-gray-400">None in this period. Every question matched a document or live data.</p>
            ) : (
              <ul className="space-y-2">
                {data.unanswered.map(u => (
                  <li key={u.question} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-700">{u.question}</span>
                      <span className="flex-shrink-0 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{u.count}×</span>
                    </div>
                    <AddToKnowledge question={u.question} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
              <ThumbsDown className="w-4 h-4 text-red-500" /> Recent unhelpful answers
            </h3>
            {data.downvoted.length === 0 ? (
              <p className="text-sm text-gray-400">No thumbs-down in this period.</p>
            ) : (
              <ul className="space-y-2">
                {data.downvoted.map(d => (
                  <li key={d.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-sm">
                    <p className="font-medium text-gray-800">{d.question}</p>
                    <p className="text-gray-500 mt-1 line-clamp-3 whitespace-pre-wrap">{d.answer}</p>
                    {d.comment && <p className="mt-1 text-red-600">“{d.comment}”</p>}
                    <AddToKnowledge question={d.question} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
