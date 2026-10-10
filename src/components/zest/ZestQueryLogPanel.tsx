import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../api';

interface QueryLogRow {
  id: string;
  question: string;
  answer: string;
  userRole: string;
  userName: string;
  userEmail: string;
  sourceDocCount: number;
  createdAt: string;
}

// Every question Zest was asked and the answer it gave, newest first, so an admin can audit what it told staff,
// students and signed-out guests. Admin only (the server enforces it).
export default function ZestQueryLogPanel() {
  const [logs, setLogs] = useState<QueryLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.zest.queryLogs({ limit: 50 });
      setLogs(data.logs);
      setTotal(data.total);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Could not load the query log.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {total > 0 ? `Latest ${logs.length} of ${total} questions.` : 'Questions asked of Zest and its answers.'}
        </p>
        <button type="button" onClick={load} aria-label="Refresh" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {loading && logs.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">{error ? 'Could not load the query log.' : 'No questions asked yet.'}</p>
      ) : (
        <div className="space-y-2">
          {logs.map(l => (
            <div key={l.id} className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs font-medium text-gray-500">{l.userName} <span className="text-gray-400">({l.userRole})</span></p>
                <p className="text-xs text-gray-400 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</p>
              </div>
              <p className="text-sm text-gray-800 font-medium">{l.question}</p>
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{l.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
