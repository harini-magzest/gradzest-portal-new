import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, Search, MessageSquare, Phone, PhoneMissed, PhoneOff, Video,
  Paperclip, Camera, X, FileText, Download,
  Calendar, Clock, CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCallContext } from '../../context/CallContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api';
import { useMarkRoomRead, unreadCount } from '../../hooks/useMarkRoomRead';
import { MessageActions, ReplyQuote, ReplyingBar } from '../../components/GroupMessageExtras';
import { PresenceDot, PresenceLabel, GroupPresence } from '../../components/Presence';
import SignedFileLink from '../../components/SignedFileLink';

const formatDuration = (s: number) => {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatChatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d >= today) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d >= yesterday) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// Group-created / group-changed notices — centered small text, not a chat bubble (WhatsApp-style)
function SystemMessage({ msg }: { msg: any }) {
  return (
    <div className="flex justify-center">
      <span className="text-[11px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full text-center max-w-[85%]">
        {msg.content}
      </span>
    </div>
  );
}

function CallMessage({ msg, isMe }: { msg: any; isMe: boolean }) {
  const { callStatus, callDuration, senderName, timestamp } = msg;
  let icon = <Phone className="w-3.5 h-3.5" />;
  let label = '';
  let colorClass = '';
  if (callStatus === 'answered') {
    label = `Voice call · ${formatDuration(callDuration)}`;
    colorClass = 'text-green-700 bg-green-50 border-green-200';
  } else if (callStatus === 'no_answer') {
    icon = <PhoneMissed className="w-3.5 h-3.5" />;
    label = isMe ? 'No answer' : 'Missed call';
    colorClass = isMe ? 'text-gray-500 bg-gray-50 border-gray-200' : 'text-red-600 bg-red-50 border-red-200';
  } else if (callStatus === 'declined') {
    icon = <PhoneOff className="w-3.5 h-3.5" />;
    label = isMe ? 'Call declined' : 'You declined';
    colorClass = 'text-gray-500 bg-gray-50 border-gray-200';
  }
  return (
    <div className="flex justify-center">
      <div className="flex flex-col items-center gap-0.5">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-medium ${colorClass}`}>
          {icon}<span>{label}</span>
        </div>
        <span className="text-[10px] text-gray-400">{isMe ? 'You' : senderName} · {formatTime(timestamp)}</span>
      </div>
    </div>
  );
}

function FileMessage({ msg, isMe, onAction }: { msg: any; isMe: boolean; onAction?: () => void }) {
  const isOffer = msg.isOfferLetter;
  const sizeKb = msg.fileSize ? (msg.fileSize / 1024).toFixed(0) : null;
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[75%]">
        {!isMe && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 bg-[#0d1b4b] rounded-full flex items-center justify-center text-white text-xs font-bold">{msg.senderName.charAt(0)}</div>
            <span className="text-xs text-gray-500">{msg.senderName}</span>
          </div>
        )}
        <div className={`rounded-2xl overflow-hidden border shadow-sm ${isMe ? 'border-blue-400' : isOffer ? 'border-emerald-300 ring-2 ring-emerald-200' : 'border-gray-200'}`}>
          {isOffer && !isMe && (
            <div className="bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> Offer Letter — Saved to your Applications!
            </div>
          )}
          <div className={`px-4 py-3 ${isMe ? 'bg-[#0d1b4b]' : 'bg-white'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isMe ? 'bg-white/20' : isOffer ? 'bg-emerald-100' : 'bg-[#f0f4ff]'}`}>
                <FileText className={`w-5 h-5 ${isMe ? 'text-white' : isOffer ? 'text-emerald-600' : 'text-blue-500'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold truncate ${isMe ? 'text-white' : 'text-gray-800'}`}>{msg.fileName || 'Document'}</p>
                {sizeKb && <p className={`text-xs mt-0.5 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{sizeKb} KB</p>}
              </div>
            </div>
            {msg.fileUrl && (
              <div className="mt-2.5 flex gap-2">
                <SignedFileLink href={msg.fileUrl} target="_blank" rel="noopener noreferrer"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                  <Download className="w-3.5 h-3.5" /> Download
                </SignedFileLink>
                {!isMe && onAction && (
                  <button type="button" onClick={onAction}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isOffer ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-[#0d1b4b] hover:bg-[#152258] text-white'}`}>
                    {isOffer ? '📋 View Applications' : '💾 Save to Docs'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <p className={`text-xs text-gray-400 mt-1 ${isMe ? 'text-right' : ''}`}>{formatTime(msg.timestamp)}</p>
      </div>
    </div>
  );
}

function MeetingMessage({ msg, isMe }: { msg: any; isMe: boolean }) {
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[75%]">
        {!isMe && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 bg-[#0d1b4b] rounded-full flex items-center justify-center text-white text-xs font-bold">{msg.senderName.charAt(0)}</div>
            <span className="text-xs text-gray-500">{msg.senderName}</span>
          </div>
        )}
        <div className={`rounded-2xl overflow-hidden border shadow-sm ${isMe ? 'bg-blue-600 border-blue-400' : 'bg-white border-blue-200'}`}>
          <div className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold ${isMe ? 'bg-blue-700 text-sky-100' : 'bg-sky-50 text-blue-700'}`}>
            <Calendar className="w-3.5 h-3.5" /> Meeting Scheduled
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className={`flex items-center gap-2 text-sm font-semibold ${isMe ? 'text-white' : 'text-gray-800'}`}>
              <Calendar className="w-4 h-4 flex-shrink-0 opacity-60" /> {msg.meetingDate}
            </div>
            <div className={`flex items-center gap-2 text-sm ${isMe ? 'text-sky-100' : 'text-gray-600'}`}>
              <Clock className="w-4 h-4 flex-shrink-0 opacity-60" /> {msg.meetingTime}
            </div>
            {msg.meetingNotes && (
              <p className={`text-xs pt-2 border-t ${isMe ? 'border-blue-500 text-blue-200' : 'border-gray-100 text-gray-500'}`}>
                {msg.meetingNotes}
              </p>
            )}
          </div>
        </div>
        <p className={`text-xs text-gray-400 mt-1 ${isMe ? 'text-right' : ''}`}>{formatTime(msg.timestamp)}</p>
      </div>
    </div>
  );
}

export default function StudentChat() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  useEffect(() => {
    if (user?.role === 'student' && !(user as any)?.onboarding?.counselorViewed) {
      api.onboarding.markStep('counselorViewed').then(refreshUser).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { callState, startCall, startVideoCall, lastMessageTime } = useCallContext();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  // Group chats: message being replied to, and applying reaction updates locally
  const [replyTo, setReplyTo] = useState<any>(null);
  useEffect(() => { setReplyTo(null); }, [selectedRoom?.id]);
  const applyMsgUpdate = (m: any) => {
    const mid = String(m._id || m.id);
    const patch = (r: any) => r && r.messages?.some((x: any) => String(x._id || x.id) === mid)
      ? { ...r, messages: r.messages.map((x: any) => String(x._id || x.id) === mid ? m : x) } : r;
    setSelectedRoom((r: any) => patch(r));
    setRooms((prev: any[]) => prev.map(patch));
  };
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevRoomIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadRooms = async (opts?: { silent?: boolean }) => {
    try {
      const list = await api.chat.rooms();
      setRooms(list);
      setSelectedRoom((prev: any) => {
        if (!prev && list.length > 0) return list[0];
        if (prev) return list.find((r: any) => r.id === prev.id) ?? prev;
        return prev;
      });
    } catch {
      if (!opts?.silent) toast.error('Failed to load conversations.');
    }
  };

  useEffect(() => {
    if (!user) return;
    loadRooms();
  }, [user]);

  useEffect(() => {
    if (!lastMessageTime) return;
    loadRooms({ silent: true });
  }, [lastMessageTime]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => loadRooms({ silent: true }), 15000);
    return () => clearInterval(id);
  }, [user]);

  useMarkRoomRead(selectedRoom, String(user?.id ?? ''), setRooms, setSelectedRoom);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const roomChanged = selectedRoom?.id !== prevRoomIdRef.current;
    prevRoomIdRef.current = selectedRoom?.id ?? null;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (roomChanged || nearBottom) el.scrollTop = el.scrollHeight;
  }, [selectedRoom?.messages, selectedRoom?.id]);

  const clearFileInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const send = async () => {
    if (!input.trim() || !user || !selectedRoom) return;
    const content = input.trim();
    setInput('');
    try {
      const msg = await api.chat.send(selectedRoom.id, content, user.name, replyTo ? String(replyTo._id || replyTo.id) : undefined);
      setReplyTo(null);
      const updated = { ...selectedRoom, messages: [...selectedRoom.messages, msg] };
      setSelectedRoom(updated);
      setRooms(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch {}
  };

  const sendFile = async () => {
    if (!pendingFile || !user || !selectedRoom) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('senderName', user.name);
      const msg = await api.chat.sendFile(selectedRoom.id, formData);
      const updated = { ...selectedRoom, messages: [...selectedRoom.messages, msg] };
      setSelectedRoom(updated);
      setRooms(prev => prev.map(r => r.id === updated.id ? updated : r));
      setPendingFile(null);
      setInput('');
      clearFileInputs();
    } catch {} finally {
      setSending(false);
    }
  };

  const handleDocAction = async (msg: any) => {
    if (msg.isOfferLetter) {
      navigate('/student/applications');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('name', msg.fileName || 'Document');
      formData.append('type', 'Other');
      if (msg.fileUrl) formData.append('url', msg.fileUrl);
      await api.students.uploadDocument(formData);
    } catch {}
  };

  // Group chats show their name; 1:1 chats show the other person
  const roomTitle = (r: any) => r?.type === 'group' ? (r.name || 'Group') : r?.participantNames?.find((n: string) => n !== user?.name) || 'Counselor';
  const isGroup = selectedRoom?.type === 'group';
  const remoteName = roomTitle(selectedRoom);
  const remoteId = isGroup ? '' : selectedRoom?.participants?.find((id: string) => id !== user?.id) ?? '';
  const messages = selectedRoom?.messages || [];
  const hasMultipleRooms = rooms.length > 1;
  const filteredRooms = rooms
    .filter((r: any) => {
      const other = roomTitle(r);
      return other.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a: any, b: any) => {
      const aTime = a.messages?.[a.messages.length - 1]?.timestamp ?? '';
      const bTime = b.messages?.[b.messages.length - 1]?.timestamp ?? '';
      if (aTime && !bTime) return -1;
      if (!aTime && bTime) return 1;
      return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
    });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chat</h1>
        <p className="text-gray-500 mt-1">Direct communication with your counselor and advisors</p>
      </div>

      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex ${hasMultipleRooms ? 'chat-window-wide' : 'flex-col chat-window'}`}>
        {/* Sidebar — only shown when multiple rooms exist */}
        {hasMultipleRooms && (
          <div className="w-64 border-r border-gray-100 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search…" aria-label="Search conversations"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredRooms.map((r: any) => {
                const other = roomTitle(r);
                const isActive = selectedRoom?.id === r.id;
                const unread = unreadCount(r, String(user?.id));
                const lastMsg = r.messages?.[r.messages.length - 1];
                const preview = lastMsg?.type === 'call' ? '📞 Voice call'
                  : lastMsg?.type === 'file' ? `📎 ${lastMsg.fileName || 'Document'}`
                  : lastMsg?.type === 'meeting' ? `📅 ${lastMsg.meetingDate}`
                  : lastMsg?.content;
                const chatTime = lastMsg?.timestamp ? formatChatTime(lastMsg.timestamp) : '';
                return (
                  <button type="button" key={r.id} onClick={() => setSelectedRoom(r)}
                    className={`w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${isActive ? 'bg-sky-50' : ''}`}>
                    <div className="relative w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-700 text-sm flex-shrink-0">
                      {other.charAt(0)}
                      {r.type !== 'group' && <PresenceDot userId={r.participants?.find((id: string) => id !== String(user?.id))} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-sm font-semibold truncate ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>{other}</span>
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          {chatTime && <span className="text-[10px] text-gray-400">{chatTime}</span>}
                          {unread > 0 && <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{unread}</span>}
                        </div>
                      </div>
                      {preview
                        ? <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>{preview}</p>
                        : <p className="text-xs text-gray-300 mt-0.5">No messages yet</p>
                      }
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main chat area */}
        <div className={hasMultipleRooms ? 'flex-1 flex flex-col min-w-0 min-h-0' : 'flex flex-col flex-1 min-h-0'}>
          {/* Header */}
          <div className="p-4 border-b border-gray-100 bg-sky-50 flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0d1b4b] rounded-full flex items-center justify-center text-white font-bold">
              {remoteName.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{remoteName}</p>
              <div className="flex items-center gap-1 min-w-0">
                {isGroup ? (
                  <span className="text-xs text-gray-500 truncate">
                    <GroupPresence memberIds={selectedRoom.participants} meId={String(user?.id)} /> · {selectedRoom.participants.length} members · {selectedRoom.participantNames?.join(', ')}
                  </span>
                ) : (
                  <PresenceLabel userId={remoteId} />
                )}
              </div>
            </div>
            {selectedRoom && !isGroup && (
              <>
                <button type="button" title="Voice call" aria-label="Voice call"
                  onClick={() => startCall(remoteId, remoteName)}
                  disabled={callState !== 'idle' || !remoteId}
                  className="w-9 h-9 bg-blue-100 hover:bg-blue-200 disabled:opacity-40 text-blue-700 rounded-full flex items-center justify-center transition-colors">
                  <Phone className="w-4 h-4" />
                </button>
                <button type="button" title="Video call" aria-label="Video call"
                  onClick={() => startVideoCall(remoteId, remoteName)}
                  disabled={callState !== 'idle' || !remoteId}
                  className="w-9 h-9 bg-indigo-100 hover:bg-indigo-200 disabled:opacity-40 text-indigo-700 rounded-full flex items-center justify-center transition-colors">
                  <Video className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-gray-500">No messages yet. Say hello!</p>
              </div>
            ) : (
              messages.map((msg: any) => {
                const key = msg._id || msg.id;
                if (msg.type === 'system') return <SystemMessage key={key} msg={msg} />;
                if (msg.type === 'call') return <CallMessage key={key} msg={msg} isMe={msg.senderId === user?.id} />;
                if (msg.type === 'file') return <FileMessage key={key} msg={msg} isMe={msg.senderId === user?.id} onAction={() => handleDocAction(msg)} />;
                if (msg.type === 'meeting') return <MeetingMessage key={key} msg={msg} isMe={msg.senderId === user?.id} />;
                const isMe = msg.senderId === user?.id;
                return (
                  <div key={key} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] ${isMe ? 'order-2' : ''}`}>
                      {!isMe && (
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-6 h-6 bg-[#0d1b4b] rounded-full flex items-center justify-center text-white text-xs font-bold">{msg.senderName.charAt(0)}</div>
                          <span className="text-xs text-gray-500">{msg.senderName}</span>
                        </div>
                      )}
                      {msg.replyTo && <ReplyQuote replyTo={msg.replyTo} mine={isMe} />}
                      <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${isMe ? 'bg-[#0d1b4b] text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                        {msg.content}
                      </div>
                      <p className={`text-xs text-gray-400 mt-1 ${isMe ? 'text-right' : ''}`}>{formatTime(msg.timestamp)}</p>
                      {selectedRoom?.type === 'group' && <MessageActions roomId={selectedRoom.id} msg={msg} meId={String(user?.id)} onUpdated={applyMsgUpdate} onReply={setReplyTo} alignRight={isMe} />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-gray-100">
            {replyTo && <ReplyingBar msg={replyTo} onCancel={() => setReplyTo(null)} />}
            {pendingFile && (
              <div className="mb-3 flex items-center gap-3 p-3 bg-sky-50 border border-blue-200 rounded-xl">
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{pendingFile.name}</p>
                  <p className="text-xs text-gray-500">{(pendingFile.size / 1024).toFixed(0)} KB</p>
                </div>
                <button type="button" aria-label="Remove attachment" onClick={() => { setPendingFile(null); clearFileInputs(); }} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" aria-label="Attach document" className="hidden"
              onChange={e => { if (e.target.files?.[0]) setPendingFile(e.target.files[0]); }} />
            <input ref={cameraInputRef} type="file" accept="image/*" aria-label="Capture photo" className="hidden"
              onChange={e => { if (e.target.files?.[0]) setPendingFile(e.target.files[0]); }} />

            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach document"
                className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-sky-50 hover:text-blue-600 transition-colors flex-shrink-0">
                <Paperclip className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => cameraInputRef.current?.click()} title="Camera / Photo"
                className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-sky-50 hover:text-blue-600 transition-colors flex-shrink-0">
                <Camera className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-gray-200 mx-0.5 flex-shrink-0" />
              <input type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { pendingFile ? sendFile() : send(); } }}
                placeholder={pendingFile ? 'Add a caption (optional)…' : 'Type a message…'}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" aria-label="Send" onClick={() => pendingFile ? sendFile() : send()}
                disabled={(!input.trim() && !pendingFile) || sending}
                className="bg-[#0d1b4b] text-white p-2.5 rounded-xl hover:bg-[#152258] disabled:opacity-50 transition-colors flex-shrink-0">
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
