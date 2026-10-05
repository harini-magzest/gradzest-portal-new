import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../../api';

// Asks Zest for a reply to the student's latest message and hands it back to the caller to put in the message box.
// It never sends anything: the staff member reads, edits and sends it themselves.
export default function DraftWithZest({ roomId, onDraft }: { roomId: string; onDraft: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const draft = async () => {
    setBusy(true);
    setError('');
    try {
      const { draft: text } = await api.zest.draftReply(roomId);
      onDraft(text);
    } catch (err: any) {
      setError(err.message || 'Zest could not write a draft.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={draft}
        disabled={busy}
        aria-label="Draft a reply with Zest"
        title="Draft a reply with Zest"
        className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-purple-50 hover:text-purple-600 transition-colors flex-shrink-0 disabled:opacity-50"
      >
        <Sparkles className={`w-4 h-4 ${busy ? 'animate-pulse' : ''}`} aria-hidden="true" />
      </button>
      {error && <span role="alert" className="absolute left-4 -top-6 text-xs text-red-600 bg-white px-2 py-0.5 rounded shadow">{error}</span>}
    </>
  );
}
