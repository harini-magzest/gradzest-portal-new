import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Send, FileText, Paperclip, ThumbsUp, ThumbsDown, Mic, MicOff, Volume2, VolumeX, Copy, Check, Plus, PhoneCall } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ZestIcon from './ZestIcon';
import ZestLeadForm from './ZestLeadForm';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { useSpeech, SPEECH_LANGS } from '../../hooks/useSpeech';
import ZestKnowledgePanel from './ZestKnowledgePanel';
import ZestInsightsPanel from './ZestInsightsPanel';
import ZestAlertsPanel from './ZestAlertsPanel';
import ZestQueryLogPanel from './ZestQueryLogPanel';

interface ZestMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: { documentId: string; title: string }[];
  error?: boolean;
  logId?: string;
  rating?: 'up' | 'down';
}

type Tab = 'chat' | 'knowledge' | 'insights' | 'alerts' | 'log';
const ADMIN_TABS: { key: Tab; label: string }[] = [
  { key: 'chat', label: 'Chat' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'insights', label: 'Insights' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'log', label: 'Log' },
];

function welcomeFor(role: string): string {
  if (role === 'student') return "Hi, I'm Zest. Ask me about your applications and documents, universities and courses, visa steps, or how to use the portal.";
  if (role === 'admin') return "Hi, I'm Zest. I can check students, tasks and lead alerts, draft follow-ups and chat replies, and answer process questions. The Knowledge, Insights and Alerts tabs above are for managing me.";
  return "Hi, I'm Zest. I can check your students, tasks and lead alerts, draft follow-ups and chat replies, and answer visa and process questions.";
}

// The conversation is kept for this browser tab only (sessionStorage), so a reload does not lose it. It can hold student
// details Zest looked up for staff, so it is never written to localStorage, is keyed by user, and is wiped on sign-out
// and by "New chat". Everything is best-effort: storage can be blocked, and the panel works without it.
const CHAT_KEY = 'gz_zest_chat_';
const MAX_SAVED = 30;

function loadChat(userId: string): ZestMessage[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CHAT_KEY + userId) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(m => m && typeof m.id === 'string' && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .map((m): ZestMessage => ({
        id: m.id, role: m.role, text: m.text,
        ...(Array.isArray(m.sources) ? { sources: m.sources } : {}),
        ...(typeof m.logId === 'string' ? { logId: m.logId } : {}),
        ...(m.rating === 'up' || m.rating === 'down' ? { rating: m.rating } : {}),
      }));
  } catch { return []; }
}

function saveChat(userId: string, messages: ZestMessage[]) {
  try {
    const keep = messages.filter(m => !m.error && m.text).slice(-MAX_SAVED);
    if (keep.length) sessionStorage.setItem(CHAT_KEY + userId, JSON.stringify(keep));
    else sessionStorage.removeItem(CHAT_KEY + userId);
  } catch { /* storage unavailable: the chat just won't survive a reload */ }
}

function forgetChats() {
  try {
    Object.keys(sessionStorage).filter(k => k.startsWith(CHAT_KEY)).forEach(k => sessionStorage.removeItem(k));
  } catch { /* nothing to forget */ }
}


// Zest's answers come back with real Markdown (**bold**, `code`, lists, links) — these render it
// at a size and spacing that fits a chat bubble, instead of showing the raw ** and ` characters.
// A stable object outside the component so it isn't rebuilt on every render.
const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: ReactNode }) => <p className="whitespace-pre-wrap mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{children}</a>
  ),
  ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc pl-5 space-y-1 mb-2 last:mb-0">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal pl-5 space-y-1 mb-2 last:mb-0">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-x-auto mb-2 last:mb-0">{children}</pre>
  ),
  code: ({ className, children }: { className?: string; children?: ReactNode }) =>
    /language-/.test(className || '')
      ? <code className={className}>{children}</code>
      : <code className="bg-gray-100 text-[13px] px-1 py-0.5 rounded font-mono">{children}</code>,
  table: ({ children }: { children?: ReactNode }) => <table className="w-full text-xs border-collapse mb-2">{children}</table>,
  th: ({ children }: { children?: ReactNode }) => <th className="border border-gray-200 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }: { children?: ReactNode }) => <td className="border border-gray-200 px-2 py-1">{children}</td>,
};

// Shown in the welcome bubble to signed-out visitors, in place of the per-role welcome.
const GUEST_WELCOME = "Hi, I'm Zest, Gradzest's study-abroad assistant. Ask me about universities, courses, visas or how the process works. Want to speak to a person? Tap \"Talk to a counselor\" below. Sign in to get help with your own application.";

// Global AI assistant, mounted once in App.tsx alongside the other root-level overlays
// (ToastLayer, FlashToast, AuthModal) so every role gets it without touching each
// dashboard's own *Layout.tsx. Signed-out visitors get it too (public site), as a guest: knowledge base and
// catalogue only, no file upload or rating. Self-gates on route below.
//
// Zest lives only here: every Zest feature is either something you ask it in Chat (drafts, lookups, alerts,
// insights) or, for admins, a tab in this panel (knowledge base, insights, alerts). There is no Zest page or
// button elsewhere in the portal.
export default function ZestWidget() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<ZestMessage[]>([]);
  const guest = !isAuthenticated || !user;
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Plain-words note while Zest runs a live lookup ("Checking your students…"); empty otherwise.
  const [status, setStatus] = useState('');
  // Which user's saved conversation is currently loaded, so a save never overwrites it before it has been read.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // Guest "Talk to a counselor" form: hidden, open, or already sent this conversation
  const [leadForm, setLeadForm] = useState<'closed' | 'open' | 'sent'>('closed');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const speech = useSpeech();

  // Admin management tabs (not for app-team admins, who have no Zest management).
  const canManage = user?.role === 'admin' && !user.isAppTeam;
  const userId = user?.id;

  // Bring back this user's conversation after a reload; forget everything once they are signed out, so a guest chat
  // never carries into an account or back. While the session is still being restored the user is briefly unknown,
  // which must not be mistaken for a sign-out.
  useEffect(() => {
    if (authLoading) return;
    setAttachedFile(null);
    setLeadForm('closed');
    if (!isAuthenticated || !userId) { forgetChats(); setMessages([]); setLoadedFor(null); return; }
    setMessages(loadChat(userId));
    setLoadedFor(userId);
  }, [authLoading, isAuthenticated, userId]);

  // Save only between turns: a half-streamed answer is not worth keeping.
  useEffect(() => {
    if (!userId || loadedFor !== userId || loading || streamingId) return;
    saveChat(userId, messages);
  }, [messages, userId, loadedFor, loading, streamingId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, tab, leadForm]);

  // Links into Zest (the daily-alerts notification) look like /admin?zest=alerts: open the panel on that tab,
  // then drop the parameter so a refresh doesn't reopen it.
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(location.search);
    const wanted = params.get('zest');
    if (!wanted) return;
    if (canManage && ADMIN_TABS.some(t => t.key === wanted)) { setTab(wanted as Tab); setOpen(true); }
    params.delete('zest');
    const rest = params.toString();
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : '' }, { replace: true });
  }, [location.search, location.pathname, user, canManage, navigate]);

  // A person who stops being an admin (or switches account) must not stay on a management tab.
  useEffect(() => { if (!canManage && tab !== 'chat') setTab('chat'); }, [canManage, tab]);

  // SOC is deliberately isolated from the rest of the portal (see SOCLayout.tsx) — Zest stays out too, as it
  // does from the token-only parent view.
  const hidden = location.pathname.startsWith('/soc') || location.pathname.startsWith('/parent/') || location.pathname.startsWith('/f/');
  if (hidden) return null;

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    const file = attachedFile;
    setInput('');
    setAttachedFile(null);
    // Everything said so far this conversation, minus any failed turns (an error isn't useful context
    // for Claude) — sent so Zest can ask a clarifying question and actually remember the answer on the next turn.
    const history = messages
      .filter(m => !m.error)
      .slice(-8)
      .map(m => ({ role: m.role, text: m.text }));
    const userMsg: ZestMessage = {
      id: `u-${Date.now()}`, role: 'user',
      text: file ? `${question}\n\n📎 ${file.name}` : question,
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    if (file) {
      try {
        const { answer, sources, logId } = await api.zest.askWithFile(question, file, history);
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: answer, sources, logId }]);
        if (speech.speakAnswers) speech.speak(answer);
      } catch (err: any) {
        setMessages(prev => [...prev, {
          id: `e-${Date.now()}`, role: 'assistant', error: true,
          text: err?.message || "Zest couldn't answer that right now. Please try again.",
        }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    const replyId = `a-${Date.now()}`;
    setMessages(prev => [...prev, { id: replyId, role: 'assistant', text: '' }]);
    setStreamingId(replyId);
    try {
      const { answer, sources, logId } = await api.zest.askStream(question, history, (delta) => {
        setStatus('');
        setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, text: m.text + delta } : m)));
      }, setStatus, guest);
      setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, text: answer, sources, logId } : m)));
      if (speech.speakAnswers) speech.speak(answer);
    } catch (err: any) {
      setMessages(prev => prev.map(m => (m.id === replyId ? {
        ...m, error: true, text: err?.message || "Zest couldn't answer that right now. Please try again.",
      } : m)));
    } finally {
      setStatus('');
      setStreamingId(null);
      setLoading(false);
    }
  };

  // Starts over: the conversation, the box and any attached file, and the saved copy (the save effect clears it).
  const newChat = () => {
    if (loading) return;
    setMessages([]);
    setInput('');
    setAttachedFile(null);
  };

  const rate = async (m: ZestMessage, rating: 'up' | 'down') => {
    if (!m.logId || m.rating === rating) return;
    const previous = m.rating;
    setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, rating } : x)));
    try {
      await api.zest.feedback(m.logId, rating);
    } catch {
      setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, rating: previous } : x)));
    }
  };

  // Drafts (follow-ups, chat replies) are written here for the person to paste into their own email, WhatsApp or chat.
  const copy = async (m: ZestMessage) => {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(id => (id === m.id ? null : id)), 2000);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close Zest' : 'Open Zest'}
        className="fixed bottom-6 right-6 z-[250] w-24 h-24 flex items-center justify-center transition-transform hover:scale-105 drop-shadow-lg"
      >
        {open ? <X className="w-6 h-6 text-[#0d1b4b]" /> : <ZestIcon className="w-24 h-24" />}
      </button>

      <div
        className={`fixed inset-y-0 right-0 z-[260] w-full sm:w-96 bg-white shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="bg-[#0d1b4b] text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <ZestIcon className="w-5 h-5" />
            <span className="font-semibold text-lg">Zest AI</span>
          </div>
          <div className="flex items-center gap-1">
            {tab === 'chat' && messages.length > 0 && (
              <button
                type="button"
                onClick={newChat}
                disabled={loading}
                aria-label="New chat"
                title="Start a new chat"
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            {tab === 'chat' && (speech.canListen || speech.canSpeak) && (
              <select
                value={speech.lang}
                onChange={e => speech.setLang(e.target.value)}
                aria-label="Voice language"
                title="Language for voice input and spoken answers"
                className="bg-white/10 text-white text-xs rounded-lg px-1.5 py-1 border border-white/20 focus:outline-none"
              >
                {SPEECH_LANGS.map(l => <option key={l.code} value={l.code} className="text-gray-900">{l.label}</option>)}
              </select>
            )}
            {tab === 'chat' && speech.canSpeak && (
              <button
                type="button"
                onClick={() => speech.setSpeakAnswers(!speech.speakAnswers)}
                aria-pressed={speech.speakAnswers}
                title={speech.speakAnswers ? 'Stop reading answers aloud' : 'Read answers aloud'}
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                {speech.speakAnswers ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 opacity-70" />}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {canManage && (
          <div role="tablist" aria-label="Zest" className="flex-shrink-0 flex border-b border-gray-100 bg-white px-2">
            {ADMIN_TABS.map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  tab === t.key ? 'border-[#0d1b4b] text-[#0d1b4b]' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab !== 'chat' ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
            {tab === 'knowledge' && <ZestKnowledgePanel />}
            {tab === 'insights' && <ZestInsightsPanel />}
            {tab === 'alerts' && <ZestAlertsPanel />}
            {tab === 'log' && <ZestQueryLogPanel />}
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-white text-gray-800 border border-gray-100 shadow-sm">
                  <p className="whitespace-pre-wrap">{user ? welcomeFor(user.role) : GUEST_WELCOME}</p>
                </div>
              </div>
              {messages.filter(m => !(m.id === streamingId && !m.text)).map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#0d1b4b] text-white'
                      : m.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-gray-800 border border-gray-100 shadow-sm'
                  }`}>
                    {m.role === 'assistant' && !m.error ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{m.text}</ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    )}
                    {m.role === 'assistant' && !m.error && m.id !== streamingId && (
                      <div className="mt-2 flex items-center gap-1 text-gray-400">
                        {m.logId && (
                          <>
                            <button type="button" onClick={() => rate(m, 'up')} aria-label="Helpful" aria-pressed={m.rating === 'up'}
                              className={`p-1 rounded hover:bg-gray-100 ${m.rating === 'up' ? 'text-emerald-600' : ''}`}>
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => rate(m, 'down')} aria-label="Not helpful" aria-pressed={m.rating === 'down'}
                              className={`p-1 rounded hover:bg-gray-100 ${m.rating === 'down' ? 'text-red-500' : ''}`}>
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button type="button" onClick={() => copy(m)} aria-label="Copy answer"
                          className="ml-auto inline-flex items-center gap-1 p-1 rounded hover:bg-gray-100 text-[11px]">
                          {copiedId === m.id ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                        </button>
                      </div>
                    )}
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5">
                        {m.sources.map(s => (
                          <span key={s.documentId} className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            <FileText className="w-3 h-3" /> {s.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && !(streamingId && messages.find(m => m.id === streamingId)?.text) && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-2.5 flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <span role="status" aria-live="polite" className={status ? 'ml-2 text-xs text-gray-500' : 'sr-only'}>{status}</span>
                  </div>
                </div>
              )}
              {guest && leadForm === 'open' && (
                <ZestLeadForm
                  onClose={() => setLeadForm('closed')}
                  onSent={message => {
                    setLeadForm('sent');
                    setMessages(prev => [...prev, { id: `lead-${Date.now()}`, role: 'assistant', text: message }]);
                  }}
                />
              )}
            </div>

            <div className="flex-shrink-0 border-t border-gray-100 p-3 bg-white">
              {guest && leadForm === 'closed' && (
                <button type="button" onClick={() => setLeadForm('open')}
                  className="w-full mb-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-sm font-semibold hover:bg-blue-100">
                  <PhoneCall className="w-4 h-4" /> Talk to a counselor
                </button>
              )}
              {attachedFile && (
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 truncate">{attachedFile.name}</span>
                  <button type="button" onClick={() => setAttachedFile(null)} aria-label="Remove attachment" className="text-blue-400 hover:text-blue-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {speech.error && <p role="alert" className="text-xs text-red-600 mb-2">{speech.error}</p>}
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setAttachedFile(f); if (fileRef.current) fileRef.current.value = ''; }}
                />
                {!guest && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    title="Attach a PDF to ask about"
                    disabled={loading}
                    className="w-10 h-10 flex-shrink-0 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-40 flex items-center justify-center"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                )}
                {speech.canListen && (
                  <button
                    type="button"
                    onClick={() => (speech.listening ? speech.stop() : speech.listen(text => setInput(text)))}
                    aria-pressed={speech.listening}
                    title={speech.listening ? 'Stop listening' : 'Speak your question'}
                    disabled={loading}
                    className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center disabled:opacity-40 ${speech.listening ? 'bg-red-50 text-red-600 animate-pulse' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                  >
                    {speech.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') send(); }}
                  placeholder={attachedFile ? 'Ask about this document...' : 'Ask Zest a question...'}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button aria-label="Send"
                  type="button"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="w-10 h-10 flex-shrink-0 rounded-xl bg-[#0d1b4b] hover:bg-[#152258] disabled:opacity-40 flex items-center justify-center text-white"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
