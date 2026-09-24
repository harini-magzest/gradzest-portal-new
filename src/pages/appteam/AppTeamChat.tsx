import { useState, useRef, useEffect } from 'react';
import {
  Send, Search, MessageSquare, Phone, PhoneMissed, PhoneOff, Video,
  Paperclip, Camera, CalendarDays, X, FileText, Download,
  Calendar, Clock, UserCog,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCallContext } from '../../context/CallContext';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const formatDuration = (s: number) => {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatChatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d >= today) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d >= yesterday) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

function getRoleBadgeClass(role: string) {
  if (role === 'Application Team') return 'text-orange-700 bg-orange-50';
  if (role === 'Counselor') return 'text-teal-700 bg-teal-50';
  if (role === 'Student') return 'text-sky-700 bg-sky-50';
  return 'text-gray-600 bg-gray-100';
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

function FileMessage({ msg, isMe, senderRole }: { msg: any; isMe: boolean; senderRole?: string }) {
  const sizeKb = msg.fileSize ? (msg.fileSize / 1024).toFixed(0) : null;
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[75%]">
        {!isMe && (
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center text-white text-xs font-bold">{msg.senderName.charAt(0)}</div>
            <span className="text-xs font-medium text-gray-700">{msg.senderName}</span>
            {senderRole && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${getRoleBadgeClass(senderRole)}`}>{senderRole}</span>}
          </div>
        )}
        <div className={`rounded-xl overflow-hidden border shadow-sm ${isMe ? 'border-orange-400' : 'border-gray-200'}`}>
          <div className={`px-4 py-3 ${isMe ? 'bg-orange-500' : 'bg-white'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isMe ? 'bg-orange-400' : 'bg-orange-50'}`}>
                <FileText className={`w-5 h-5 ${isMe ? 'text-white' : 'text-orange-500'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold truncate ${isMe ? 'text-white' : 'text-gray-800'}`}>{msg.fileName || 'Document'}</p>
                {sizeKb && <p className={`text-xs mt-0.5 ${isMe ? 'text-orange-100' : 'text-gray-400'}`}>{sizeKb} KB</p>}
              </div>
            </div>
            {msg.fileUrl && (
              <div className="mt-2.5">
                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer"
                  className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isMe ? 'bg-orange-400 hover:bg-orange-300 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              </div>
            )}
          </div>
        </div>
        <p className={`text-xs text-gray-400 mt-1 ${isMe ? 'text-right' : ''}`}>{formatTime(msg.timestamp)}</p>
      </div>
    </div>
  );
}

function MeetingMessage({ msg, isMe, senderRole }: { msg: any; isMe: boolean; senderRole?: string }) {
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[75%]">
        {!isMe && (
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center text-white text-xs font-bold">{msg.senderName.charAt(0)}</div>
            <span className="text-xs font-medium text-gray-700">{msg.senderName}</span>
            {senderRole && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${getRoleBadgeClass(senderRole)}`}>{senderRole}</span>}
          </div>
        )}
        <div className={`rounded-xl overflow-hidden border shadow-sm ${isMe ? 'bg-orange-500 border-orange-400' : 'bg-white border-orange-200'}`}>
          <div className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold ${isMe ? 'bg-orange-600 text-orange-100' : 'bg-orange-50 text-orange-700'}`}>
            <Calendar className="w-3.5 h-3.5" /> Meeting Scheduled
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className={`flex items-center gap-2 text-sm font-semibold ${isMe ? 'text-white' : 'text-gray-800'}`}>
              <Calendar className="w-4 h-4 flex-shrink-0 opacity-60" /> {msg.meetingDate}
            </div>
            <div className={`flex items-center gap-2 text-sm ${isMe ? 'text-orange-100' : 'text-gray-600'}`}>
              <Clock className="w-4 h-4 flex-shrink-0 opacity-60" /> {msg.meetingTime}
            </div>
            {msg.meetingNotes && (
              <p className={`text-xs pt-2 border-t ${isMe ? 'border-orange-400 text-orange-100' : 'border-gray-200 text-gray-500'}`}>
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

export default function AppTeamChat() {
  const { user } = useAuth();
  const { callState, startCall, startVideoCall, lastMessageTime } = useCallContext();
  const [searchParams] = useSearchParams();
  const autoCounselorId = searchParams.get('counselorId');
  const [rooms, setRooms] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ date: '', time: '', notes: '' });
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [roomList, counselorList] = await Promise.all([
          api.chat.rooms(), api.admin.counselors(),
        ]);
        setRooms(roomList);
        setCounselors(counselorList);

        if (autoCounselorId) {
          const target = counselorList.find((c: any) => String(c._id || c.id) === autoCounselorId);
          if (target) {
            const pid = String(target._id || target.id);
            const existing = roomList.find((r: any) => r.participants?.map(String).includes(pid));
            if (existing?.type === 'appteam-counselor') {
              setSelectedRoom(existing);
            } else {
              const newRoom = await api.chat.createRoom(
                [String(user?.id), pid],
                [user?.name || 'Application Team', target.name],
                'appteam-counselor'
              );
              setRooms(prev => prev.map((r: any) => r.id === newRoom.id ? newRoom : r).concat(prev.some((r: any) => r.id === newRoom.id) ? [] : [newRoom]));
              setSelectedRoom(newRoom);
            }
            return;
          }
        }

        if (roomList.length > 0) setSelectedRoom(roomList[0]);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!lastMessageTime) return;
    api.chat.rooms().then(roomList => {
      setRooms(roomList);
      if (selectedRoom) {
        const updated = roomList.find((r: any) => r.id === selectedRoom.id);
        if (updated) setSelectedRoom(updated);
      }
    }).catch(() => {});
  }, [lastMessageTime]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      api.chat.rooms().then(roomList => {
        setRooms(roomList);
        if (selectedRoom) {
          const updated = roomList.find((r: any) => r.id === selectedRoom.id);
          if (updated) setSelectedRoom(updated);
        }
      }).catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [user, selectedRoom?.id]);

  useEffect(() => {
    if (!selectedRoom?.id) return;
    api.chat.markRead(selectedRoom.id).catch(() => {});
    setRooms(prev => prev.map(r =>
      r.id === selectedRoom.id
        ? { ...r, messages: r.messages?.map((m: any) => ({ ...m, read: true })) }
        : r
    ));
  }, [selectedRoom?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedRoom?.messages]);

  const clearFileInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const openChat = async (person: any) => {
    const pid = String(person._id || person.id);
    const existing = rooms.find((r: any) => r.participants?.map(String).includes(pid));
    if (existing?.type === 'appteam-counselor') { setSelectedRoom(existing); return; }
    try {
      const newRoom = await api.chat.createRoom(
        [String(user?.id), pid],
        [user?.name || 'Application Team', person.name],
        'appteam-counselor'
      );
      setRooms(prev => prev.map(r => r.id === newRoom.id ? newRoom : r).concat(prev.some((r: any) => r.id === newRoom.id) ? [] : [newRoom]));
      setSelectedRoom(newRoom);
    } catch {}
  };

  const send = async () => {
    if (!input.trim() || !user || !selectedRoom) return;
    const content = input.trim();
    setInput('');
    try {
      const msg = await api.chat.send(selectedRoom.id, content, user.name);
      const updated = { ...selectedRoom, messages: [...selectedRoom.messages, msg] };
      setSelectedRoom(updated);
      setRooms(prev => prev.map(r => r.id === selectedRoom.id ? updated : r));
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
      setRooms(prev => prev.map(r => r.id === selectedRoom.id ? updated : r));
      setPendingFile(null);
      setInput('');
      clearFileInputs();
    } catch {} finally { setSending(false); }
  };

  const scheduleMeeting = async () => {
    if (!user || !selectedRoom || !meetingForm.date || !meetingForm.time) return;
    const dateStr = new Date(meetingForm.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = new Date(`2000-01-01T${meetingForm.time}`).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });
    setSending(true);
    try {
      const msg = await api.chat.scheduleMeeting(selectedRoom.id, {
        senderName: user.name, meetingDate: dateStr, meetingTime: timeStr, meetingNotes: meetingForm.notes,
      });
      const updated = { ...selectedRoom, messages: [...selectedRoom.messages, msg] };
      setSelectedRoom(updated);
      setRooms(prev => prev.map(r => r.id === selectedRoom.id ? updated : r));
      setShowMeetingModal(false);
      setMeetingForm({ date: '', time: '', notes: '' });
    } catch {} finally { setSending(false); }
  };

  const remoteName = selectedRoom?.participantNames?.find((n: string) => n !== user?.name) || 'Counselor';
  const remoteId = selectedRoom?.participants?.find((id: string) => id !== String(user?.id)) ?? '';

  const getSenderRole = (senderId: string) => {
    if (String(user?.id) === senderId) return 'Application Team';
    return 'Counselor';
  };

  const filteredCounselors = counselors
    .filter((p: any) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a: any, b: any) => {
      const aPid = String(a._id || a.id);
      const bPid = String(b._id || b.id);
      const aRoom = rooms.find((r: any) => r.participants?.map(String).includes(aPid));
      const bRoom = rooms.find((r: any) => r.participants?.map(String).includes(bPid));
      const aTime = aRoom?.messages?.[aRoom.messages.length - 1]?.timestamp ?? '';
      const bTime = bRoom?.messages?.[bRoom.messages.length - 1]?.timestamp ?? '';
      if (aTime && !bTime) return -1;
      if (!aTime && bTime) return 1;
      return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
    });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Chat</h1>
        <p className="text-gray-500 mt-1">Communicate with counselors</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex chat-window-wide">
        {/* Sidebar */}
        <div className="w-72 border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search counselors…" aria-label="Search counselors"
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-orange-50">
            <UserCog className="w-4 h-4 text-orange-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-orange-800">Counselors</span>
            <span className="ml-auto text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{counselors.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredCounselors.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center p-4">
                <MessageSquare className="w-6 h-6 text-gray-300 mb-1" />
                <p className="text-xs text-gray-400">No counselors found</p>
              </div>
            ) : filteredCounselors.map((person: any) => {
              const pid = String(person._id || person.id);
              const existingRoom = rooms.find((r: any) => r.participants?.map(String).includes(pid));
              const isActive = !!(existingRoom && selectedRoom?.id === existingRoom.id);
              const unread = existingRoom?.messages?.filter((m: any) => !m.read && m.senderId !== String(user?.id)).length || 0;
              const lastMsg = existingRoom?.messages?.[existingRoom.messages.length - 1];
              const preview = lastMsg?.type === 'call' ? '📞 Voice call'
                : lastMsg?.type === 'file' ? `📎 ${lastMsg.fileName || 'Document'}`
                : lastMsg?.type === 'meeting' ? `📅 ${lastMsg.meetingDate}`
                : lastMsg?.content;
              const chatTime = lastMsg?.timestamp ? formatChatTime(lastMsg.timestamp) : '';
              return (
                <button type="button" key={pid} onClick={() => openChat(person)}
                  className={`w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${isActive ? 'bg-orange-50' : ''}`}>
                  <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center font-bold text-sm text-white flex-shrink-0">
                    {person.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm font-semibold truncate ${isActive ? 'text-orange-700' : 'text-gray-900'}`}>{person.name}</span>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        {chatTime && <span className="text-[10px] text-gray-400">{chatTime}</span>}
                        {unread > 0 && <span className="bg-orange-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{unread}</span>}
                      </div>
                    </div>
                    {preview
                      ? <p className="text-xs text-gray-400 truncate mt-0.5">{preview}</p>
                      : <p className="text-xs text-gray-300 mt-0.5">No messages yet</p>
                    }
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        {selectedRoom ? (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-4 border-b border-gray-200 bg-orange-50 flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                {remoteName.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{remoteName}</p>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-xs text-gray-500">Counselor</span>
                </div>
              </div>
              <button type="button" title="Voice call" aria-label="Voice call"
                onClick={() => startCall(remoteId, remoteName)}
                disabled={callState !== 'idle' || !remoteId}
                className="w-9 h-9 bg-orange-100 hover:bg-orange-200 disabled:opacity-40 text-orange-700 rounded-full flex items-center justify-center transition-colors">
                <Phone className="w-4 h-4" />
              </button>
              <button type="button" title="Video call" aria-label="Video call"
                onClick={() => startVideoCall(remoteId, remoteName)}
                disabled={callState !== 'idle' || !remoteId}
                className="w-9 h-9 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 text-amber-700 rounded-full flex items-center justify-center transition-colors">
                <Video className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {(selectedRoom.messages || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : (selectedRoom.messages || []).map((msg: any) => {
                const key = msg._id || msg.id;
                const isMe = msg.senderId === String(user?.id);
                const senderRole = getSenderRole(msg.senderId);
                if (msg.type === 'call') return <CallMessage key={key} msg={msg} isMe={isMe} />;
                if (msg.type === 'file') return <FileMessage key={key} msg={msg} isMe={isMe} senderRole={senderRole} />;
                if (msg.type === 'meeting') return <MeetingMessage key={key} msg={msg} isMe={isMe} senderRole={senderRole} />;
                return (
                  <div key={key} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[70%]">
                      {isMe && (
                        <div className="flex items-center justify-end gap-1.5 mb-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${getRoleBadgeClass('Application Team')}`}>Application Team</span>
                        </div>
                      )}
                      {!isMe && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center text-white text-xs font-bold">{msg.senderName?.charAt(0)}</div>
                          <span className="text-xs font-medium text-gray-700">{msg.senderName}</span>
                          {senderRole && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${getRoleBadgeClass(senderRole)}`}>{senderRole}</span>}
                        </div>
                      )}
                      <div className={`px-4 py-3 rounded-xl text-sm leading-relaxed ${isMe ? 'bg-orange-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                        {msg.content}
                      </div>
                      <p className={`text-xs text-gray-400 mt-1 ${isMe ? 'text-right' : ''}`}>{formatTime(msg.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-gray-200">
              {pendingFile && (
                <div className="mb-3 flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                  <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{pendingFile.name}</p>
                    <p className="text-xs text-gray-500">{(pendingFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button type="button" aria-label="Remove attachment"
                    onClick={() => { setPendingFile(null); clearFileInputs(); }}
                    className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" aria-label="Attach document" className="hidden"
                onChange={e => { if (e.target.files?.[0]) setPendingFile(e.target.files[0]); }} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" aria-label="Capture photo" className="hidden"
                onChange={e => { if (e.target.files?.[0]) setPendingFile(e.target.files[0]); }} />

              <div className="flex items-center gap-1.5">
                <button type="button" aria-label="Attach document" onClick={() => fileInputRef.current?.click()}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-orange-50 hover:text-orange-600 transition-colors flex-shrink-0">
                  <Paperclip className="w-4 h-4" />
                </button>
                <button type="button" aria-label="Camera / Photo" onClick={() => cameraInputRef.current?.click()}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-orange-50 hover:text-orange-600 transition-colors flex-shrink-0">
                  <Camera className="w-4 h-4" />
                </button>
                <button type="button" aria-label="Schedule meeting" onClick={() => setShowMeetingModal(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-orange-50 hover:text-orange-600 transition-colors flex-shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </button>
                <div className="w-px h-6 bg-gray-200 mx-0.5 flex-shrink-0" />
                <input type="text" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { pendingFile ? sendFile() : send(); } }}
                  placeholder={pendingFile ? 'Add a caption (optional)…' : 'Type a message…'}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <button type="button" aria-label="Send message" onClick={() => pendingFile ? sendFile() : send()}
                  disabled={(!input.trim() && !pendingFile) || sending}
                  className="bg-orange-500 text-white p-2.5 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors flex-shrink-0">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Select a conversation</p>
              <p className="text-gray-400 text-sm mt-1">Choose a counselor from the list</p>
            </div>
          </div>
        )}
      </div>

      {showMeetingModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-md">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-orange-500" />
                <h3 className="font-semibold text-gray-900">Schedule Meeting</h3>
              </div>
              <button type="button" aria-label="Close" onClick={() => setShowMeetingModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="at-meeting-date" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date</label>
                <input id="at-meeting-date" type="date" value={meetingForm.date} min={new Date().toISOString().split('T')[0]}
                  onChange={e => setMeetingForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label htmlFor="at-meeting-time" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Time</label>
                <input id="at-meeting-time" type="time" value={meetingForm.time}
                  onChange={e => setMeetingForm(f => ({ ...f, time: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label htmlFor="at-meeting-notes" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Agenda / Notes (optional)</label>
                <textarea id="at-meeting-notes" value={meetingForm.notes} onChange={e => setMeetingForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="What will you discuss?" rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
              </div>
              <button type="button" onClick={scheduleMeeting} disabled={!meetingForm.date || !meetingForm.time || sending}
                className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <CalendarDays className="w-4 h-4" /> Schedule Meeting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
