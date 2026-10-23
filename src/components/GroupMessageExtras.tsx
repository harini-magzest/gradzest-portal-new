import { useEffect, useRef, useState } from 'react';
import { CornerUpLeft, SmilePlus, X } from 'lucide-react';
import { api } from '../api';

// Reactions + quote-replies for group chat messages. Shared by every chat page.
export const REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅'];

/** The quoted message shown above a reply. */
export function ReplyQuote({ replyTo, mine }: { replyTo?: { senderName?: string; content?: string }; mine?: boolean }) {
  if (!replyTo?.content && !replyTo?.senderName) return null;
  return (
    <div className={`mb-1 px-3 py-1.5 rounded-lg border-l-4 text-xs max-w-full ${mine ? 'bg-black/5 border-gray-400' : 'bg-white border-gray-300'}`}>
      <p className="font-semibold text-gray-700 truncate">{replyTo.senderName}</p>
      <p className="text-gray-500 truncate">{replyTo.content}</p>
    </div>
  );
}

/** Reaction chips under a message, plus React and Reply buttons. */
export function MessageActions({ roomId, msg, meId, onUpdated, onReply, alignRight }: {
  roomId: string;
  msg: any;
  meId: string;
  onUpdated: (updatedMsg: any) => void;
  onReply: (msg: any) => void;
  alignRight?: boolean;
}) {
  const [picker, setPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const msgId = String(msg._id || msg.id);

  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setPicker(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [picker]);

  const react = async (emoji: string) => {
    setPicker(false);
    try { onUpdated(await api.chat.react(roomId, msgId, emoji)); } catch {}
  };

  // Group identical emojis: { '👍': [names...] }
  const groups = (msg.reactions || []).reduce((acc: Record<string, { names: string[]; mine: boolean }>, r: any) => {
    const g = acc[r.emoji] || (acc[r.emoji] = { names: [], mine: false });
    g.names.push(r.userName || 'Someone');
    if (r.userId === meId) g.mine = true;
    return acc;
  }, {});

  return (
    <div ref={ref} className={`relative flex items-center flex-wrap gap-1 mt-1 ${alignRight ? 'justify-end' : ''}`}>
      {Object.entries(groups).map(([emoji, g]: [string, any]) => (
        <button key={emoji} type="button" onClick={() => react(emoji)} title={g.names.join(', ')}
          aria-label={`${emoji} ${g.names.length}${g.mine ? ', including you' : ''}`}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border ${g.mine ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          <span>{emoji}</span><span className="font-semibold">{g.names.length}</span>
        </button>
      ))}
      <button type="button" onClick={() => setPicker(p => !p)} aria-label="React" title="React"
        className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100">
        <SmilePlus className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => onReply(msg)} aria-label="Reply" title="Reply"
        className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100">
        <CornerUpLeft className="w-3.5 h-3.5" />
      </button>
      {picker && (
        <div role="menu" className={`absolute bottom-full mb-1 ${alignRight ? 'right-0' : 'left-0'} z-20 flex gap-0.5 bg-white border border-gray-200 rounded-full shadow-lg px-1.5 py-1`}>
          {REACTIONS.map(e => (
            <button key={e} type="button" role="menuitem" onClick={() => react(e)} aria-label={`React ${e}`}
              className="w-8 h-8 rounded-full text-lg hover:bg-gray-100 flex items-center justify-center">{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bar above the message box while replying. */
export function ReplyingBar({ msg, onCancel }: { msg: any; onCancel: () => void }) {
  return (
    <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-xl bg-gray-50 border-l-4 border-blue-400">
      <CornerUpLeft className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 text-xs">
        <p className="font-semibold text-gray-700">Replying to {msg.senderName}</p>
        <p className="text-gray-500 truncate">{msg.content || msg.fileName}</p>
      </div>
      <button type="button" onClick={onCancel} aria-label="Cancel reply" className="p-0.5 text-gray-400 hover:text-gray-700">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
