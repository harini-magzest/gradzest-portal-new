import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useAuth } from './AuthContext';
import { api, getApiToken } from '../api';
import { createCallRingtone } from '../utils/pirateTone';
import './call.css';

export type CallState = 'idle' | 'calling' | 'incoming' | 'active';
export type CallType = 'audio' | 'video';

interface CallContextType {
  callState: CallState;
  callType: CallType;
  remoteName: string;
  remoteRole: string;
  muted: boolean;
  cameraOff: boolean;
  timer: string;
  lastMessageTime: number;
  startCall: (targetId: string, targetName: string) => void;
  startVideoCall: (targetId: string, targetName: string) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  // Presence: who has the app open right now, and when others were last seen
  isOnline: (userId?: string) => boolean;
  lastSeenOf: (userId?: string) => string | undefined;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  counselor: 'Counselor',
  student: 'Student',
  appteam: 'App Team',
  board: 'Board',
};

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [callState, setCallState] = useState<CallState>('idle');
  const callStateRef = useRef<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('audio');
  const callTypeRef = useRef<CallType>('audio');

  const setCS = (s: CallState) => { callStateRef.current = s; setCallState(s); };
  const setCT = (t: CallType) => { callTypeRef.current = t; setCallType(t); };

  const [remoteName, setRemoteName] = useState('');
  const [remoteRole, setRemoteRole] = useState('');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState('');
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const isOnline = useCallback((id?: string) => !!id && onlineIds.has(String(id)), [onlineIds]);
  const lastSeenOf = useCallback((id?: string) => (id ? lastSeen[String(id)] : undefined), [lastSeen]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteIdRef = useRef('');
  const isCallerRef = useRef(false);
  const callStartedAtRef = useRef(0);
  const stopRef = useRef<() => void>(() => {});
  const logCallRef = useRef<(status: string, duration: number, remoteId: string) => void>(() => {});
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  // Caller-side recording of both audio tracks; uploaded after the call is logged
  const recorderRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; ctx: AudioContext } | null>(null);

  const ringtoneRef = useRef<ReturnType<typeof createCallRingtone> | null>(null);

  useEffect(() => {
    if (callState === 'incoming' || callState === 'calling') {
      const tone = createCallRingtone();
      ringtoneRef.current = tone;
      tone.start();
    } else {
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
    }
  }, [callState]);

  // Start recording once an outgoing call connects — the caller's browser mixes both sides' audio
  useEffect(() => {
    if (callState !== 'active' || !isCallerRef.current || recorderRef.current) return;
    if (!localStream || !remoteStream || typeof MediaRecorder === 'undefined') return;
    try {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      [localStream, remoteStream].forEach(s => {
        const tracks = s.getAudioTracks();
        if (tracks.length) ctx.createMediaStreamSource(new MediaStream(tracks)).connect(dest);
      });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.start(1000);
      recorderRef.current = { rec, chunks, ctx };
    } catch { /* recording unsupported — the call itself carries on */ }
  }, [callState, localStream, remoteStream]);

  // Stop the recorder (synchronously kicks off the final flush) and resolve with the audio
  const finishRecording = (): Promise<Blob | null> => {
    const r = recorderRef.current;
    recorderRef.current = null;
    if (!r) return Promise.resolve(null);
    return new Promise(resolve => {
      const done = () => {
        r.ctx.close().catch(() => {});
        resolve(r.chunks.length ? new Blob(r.chunks, { type: r.rec.mimeType || 'audio/webm' }) : null);
      };
      if (r.rec.state === 'inactive') { done(); return; }
      r.rec.onstop = done;
      r.rec.stop();
    });
  };

  const logCall = async (status: string, duration: number, remoteId: string) => {
    // Must run before any await: callers tear the call down right after invoking logCall
    const recording = finishRecording();
    if (!user?.id || !remoteId) return;
    try {
      const msg = await api.chat.logCall([user.id, remoteId], status, duration, user.name || '');
      setLastMessageTime(Date.now());
      socketRef.current?.emit('chat:call-logged', { to: remoteId });
      const blob = await recording;
      const msgId = msg?.id || msg?._id;
      if (status === 'answered' && blob && msgId) {
        await api.chat.uploadRecording(String(msgId), blob);
        setLastMessageTime(Date.now());
      }
    } catch {}
  };
  logCallRef.current = logCall;

  useEffect(() => {
    if (!remoteStream) return;
    if (callType === 'video' && remoteVideoRef.current) {
      (remoteVideoRef.current as any).srcObject = remoteStream;
    } else if (callType === 'audio' && audioRef.current) {
      (audioRef.current as any).srcObject = remoteStream;
    }
  }, [remoteStream, callState, callType]);

  useEffect(() => {
    if (localStream && callType === 'video' && callState === 'active' && localVideoRef.current) {
      (localVideoRef.current as any).srcObject = localStream;
    }
  }, [localStream, callState, callType]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const stop = useCallback(() => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    // Discard a recording nobody claimed (e.g. the call dropped without being logged)
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec) { try { rec.rec.stop(); } catch {} rec.ctx.close().catch(() => {}); }
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setRemoteStream(null);
    setLocalStream(null);
    setMuted(false);
    setCameraOff(false);
    callStateRef.current = 'idle';
    setCallState('idle');
    callTypeRef.current = 'audio';
    setCallType('audio');
    setRemoteName('');
    setRemoteRole('');
    setElapsed(0);
    remoteIdRef.current = '';
    isCallerRef.current = false;
    callStartedAtRef.current = 0;
    pendingIceRef.current = [];
  }, []);

  stopRef.current = stop;

  // Ref so socket handlers always get the latest closure without re-registering
  const getMediaRef = useRef<(wantVideo: boolean) => Promise<{ stream: MediaStream; actualType: CallType }>>(
    () => Promise.reject(new Error('not ready'))
  );
  getMediaRef.current = async (wantVideo: boolean) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera/mic access not supported on this page. Use HTTPS or a modern browser.');
    }
    if (wantVideo) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        return { stream, actualType: 'video' as CallType };
      } catch (err: any) {
        const msg =
          err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
            ? 'No camera found — switching to audio call'
            : err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
            ? 'Camera permission denied — switching to audio call'
            : err.name === 'NotReadableError' || err.name === 'TrackStartError'
            ? 'Camera in use by another app — switching to audio call'
            : 'Camera unavailable — switching to audio call';
        showToast(msg);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          return { stream, actualType: 'audio' as CallType };
        } catch (audioErr: any) {
          throw new Error(
            audioErr.name === 'NotAllowedError' || audioErr.name === 'PermissionDeniedError'
              ? 'Microphone access denied. Allow it in browser settings and try again.'
              : 'No microphone found. Cannot make calls.'
          );
        }
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { stream, actualType: 'audio' as CallType };
      } catch (err: any) {
        throw new Error(
          err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
            ? 'Microphone access denied. Allow it in browser settings and try again.'
            : 'No microphone found. Cannot make calls.'
        );
      }
    }
  };

  useEffect(() => {
    if (callState !== 'active') { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  useEffect(() => {
    if (!user?.id) return;

    const socket = io(import.meta.env.VITE_API_URL || '', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
    });
    socketRef.current = socket;
    // Presence snapshot on every (re)connect, then live updates
    const loadPresence = () => api.chat.presence().then(p => {
      setOnlineIds(new Set(p.online.map(String)));
      setLastSeen(p.lastSeen || {});
    }).catch(() => {});
    const registerSocket = () => { socket.emit('register', user.id); setTimeout(loadPresence, 300); };
    socket.on('connect', registerSocket);
    if (socket.connected) registerSocket();
    socket.on('presence:update', ({ userId, online, lastSeen: at }: { userId: string; online: boolean; lastSeen?: string }) => {
      setOnlineIds(prev => {
        const next = new Set(prev);
        if (online) next.add(String(userId)); else next.delete(String(userId));
        return next;
      });
      if (!online && at) setLastSeen(prev => ({ ...prev, [String(userId)]: at }));
    });

    const buildPC = (targetId: string) => {
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('call:ice', { to: targetId, candidate });
      };
      pc.ontrack = e => setRemoteStream(e.streams[0]);
      return pc;
    };

    socket.on('call:incoming', ({ from, fromName, fromRole, callType: ct }: {
      from: string; fromName: string; fromRole?: string; callType?: string;
    }) => {
      remoteIdRef.current = from;
      setRemoteName(fromName);
      setRemoteRole(fromRole || '');
      const t: CallType = ct === 'video' ? 'video' : 'audio';
      callTypeRef.current = t;
      setCallType(t);
      setCS('incoming');
    });

    socket.on('call:accepted', async ({ from }: { from: string }) => {
      try {
        const { stream, actualType } = await getMediaRef.current(callTypeRef.current === 'video');
        if (actualType !== callTypeRef.current) setCT(actualType);
        localStreamRef.current = stream;
        if (actualType === 'video') setLocalStream(stream);
        const pc = buildPC(from);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', { to: from, offer });
        // Flush any ICE candidates that arrived before the offer was sent
        for (const c of pendingIceRef.current) {
          try { await pc.addIceCandidate(c); } catch {}
        }
        pendingIceRef.current = [];
        callStartedAtRef.current = Date.now();
        setCS('active');
      } catch (err: any) {
        showToast(err.message || 'Could not access microphone');
        stopRef.current();
      }
    });

    socket.on('call:rejected', () => {
      const remoteId = remoteIdRef.current;
      if (isCallerRef.current) logCallRef.current('declined', 0, remoteId);
      showToast('Call declined');
      stopRef.current();
    });

    socket.on('call:ended', () => {
      const state = callStateRef.current;
      const remoteId = remoteIdRef.current;
      if (isCallerRef.current && state === 'active') {
        const duration = Math.floor((Date.now() - callStartedAtRef.current) / 1000);
        logCallRef.current('answered', duration, remoteId);
      }
      showToast(state === 'incoming' ? 'Missed call' : 'Call ended');
      stopRef.current();
    });

    socket.on('call:offer', async ({ offer, from }: { offer: RTCSessionDescriptionInit; from: string }) => {
      try {
        const { stream, actualType } = await getMediaRef.current(callTypeRef.current === 'video');
        if (actualType !== callTypeRef.current) setCT(actualType);
        localStreamRef.current = stream;
        if (actualType === 'video') setLocalStream(stream);
        const pc = buildPC(from);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        await pc.setRemoteDescription(offer);
        // Flush ICE candidates that arrived before remote description was set
        for (const c of pendingIceRef.current) {
          try { await pc.addIceCandidate(c); } catch {}
        }
        pendingIceRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { to: from, answer });
        callStartedAtRef.current = Date.now();
      } catch (err: any) {
        showToast(err.message || 'Could not access microphone');
        stopRef.current();
      }
    });

    socket.on('call:answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      try {
        await pcRef.current?.setRemoteDescription(answer);
        // Flush any ICE candidates queued before the answer arrived
        for (const c of pendingIceRef.current) {
          try { await pcRef.current?.addIceCandidate(c); } catch {}
        }
        pendingIceRef.current = [];
      } catch {}
    });

    socket.on('call:ice', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        try { await pc.addIceCandidate(candidate); } catch {}
      } else {
        // Queue until remote description is ready
        pendingIceRef.current.push(candidate);
      }
    });

    socket.on('chat:call-logged', () => { setLastMessageTime(Date.now()); });
    socket.on('chat:new-message', () => { setLastMessageTime(Date.now()); });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [user?.id]);

  const startCall = useCallback((targetId: string, targetName: string, targetRole = '') => {
    setCT('audio');
    isCallerRef.current = true;
    remoteIdRef.current = targetId;
    setRemoteName(targetName);
    setRemoteRole(targetRole);
    setCS('calling');
    socketRef.current?.emit('call:invite', {
      to: targetId, from: user?.id, fromName: user?.name,
      fromRole: user?.role, callType: 'audio',
    });
  }, [user?.id, user?.name, user?.role]);

  const startVideoCall = useCallback((targetId: string, targetName: string, targetRole = '') => {
    setCT('video');
    isCallerRef.current = true;
    remoteIdRef.current = targetId;
    setRemoteName(targetName);
    setRemoteRole(targetRole);
    setCS('calling');
    socketRef.current?.emit('call:invite', {
      to: targetId, from: user?.id, fromName: user?.name,
      fromRole: user?.role, callType: 'video',
    });
  }, [user?.id, user?.name, user?.role]);

  const acceptCall = useCallback(() => {
    setCS('active');
    callStartedAtRef.current = Date.now();
    socketRef.current?.emit('call:accept', { to: remoteIdRef.current, from: user?.id });
  }, [user?.id]);

  const rejectCall = useCallback(() => {
    socketRef.current?.emit('call:reject', { to: remoteIdRef.current });
    stopRef.current();
  }, []);

  const endCall = useCallback(() => {
    const state = callStateRef.current;
    const remoteId = remoteIdRef.current;
    const duration = state === 'active' ? Math.floor((Date.now() - callStartedAtRef.current) / 1000) : 0;
    socketRef.current?.emit('call:end', { to: remoteId });
    if (isCallerRef.current) {
      if (state === 'calling') logCallRef.current('no_answer', 0, remoteId);
      else if (state === 'active') logCallRef.current('answered', duration, remoteId);
    }
    stopRef.current();
  }, []);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMuted(m => !m);
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCameraOff(c => !c);
  }, []);

  const timer = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const callerRoleLabel = ROLE_LABEL[remoteRole] || remoteRole;
  const avatarInitial = remoteName.charAt(0).toUpperCase() || '?';
  const isVideo = callType === 'video';

  return (
    <CallContext.Provider value={{
      callState, callType, remoteName, remoteRole, muted, cameraOff, timer, lastMessageTime,
      startCall, startVideoCall, acceptCall, rejectCall, endCall, toggleMute, toggleCamera,
      isOnline, lastSeenOf,
    }}>
      {children}
      <audio ref={audioRef} autoPlay playsInline />

      {/* ── Toast notification ── */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-gray-900/95 backdrop-blur text-white text-sm px-5 py-3 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full" />
          {toast}
        </div>
      )}

      {/* ── INCOMING CALL — Instagram / WhatsApp style full-screen ── */}
      {callState === 'incoming' && (
        <div className="call-overlay-bg fixed inset-0 z-[150] flex flex-col items-center justify-between select-none">
          {/* Top: call type label */}
          <div className="mt-16 flex flex-col items-center gap-1 text-center">
            <span className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full ${
              isVideo ? 'bg-blue-500/25 text-blue-300' : 'bg-green-500/25 text-green-300'
            }`}>
              {isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
              Incoming {isVideo ? 'Video' : 'Audio'} Call
            </span>
            {callerRoleLabel && (
              <span className="text-white/40 text-xs mt-1">{callerRoleLabel}</span>
            )}
          </div>

          {/* Middle: pulsing avatar */}
          <div className="relative flex items-center justify-center">
            {/* Concentric pulsing rings */}
            <span className="call-ring-1 absolute w-64 h-64 rounded-full bg-white/[0.04]" />
            <span className="call-ring-2 absolute w-52 h-52 rounded-full bg-white/[0.06]" />
            <span className="call-ring-3 absolute w-40 h-40 rounded-full bg-white/[0.09]" />

            {/* Avatar */}
            <div className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-2xl ring-4 ring-white/10 ${
              isVideo
                ? 'bg-gradient-to-br from-blue-500 to-indigo-700'
                : 'bg-gradient-to-br from-green-500 to-emerald-700'
            }`}>
              {avatarInitial}
            </div>

            {/* Name below avatar */}
            <div className="absolute -bottom-20 text-center w-80">
              <h2 className="text-white text-3xl font-bold">{remoteName}</h2>
              {callerRoleLabel && (
                <p className="text-white/50 text-sm mt-1">{callerRoleLabel}</p>
              )}
            </div>
          </div>

          {/* Bottom: action buttons */}
          <div className="mb-20 flex items-end justify-between w-full max-w-xs px-4">
            {/* Decline */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={rejectCall}
                aria-label="Decline call"
                className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-2xl hover:bg-red-600 active:scale-90 transition-all"
              >
                <PhoneOff className="w-7 h-7 text-white" />
              </button>
              <span className="text-white/60 text-sm font-medium">Decline</span>
            </div>

            {/* Accept */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={acceptCall}
                aria-label="Accept call"
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all ${
                  isVideo ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {isVideo ? <Video className="w-7 h-7 text-white" /> : <Phone className="w-7 h-7 text-white" />}
              </button>
              <span className="text-white/60 text-sm font-medium">Accept</span>
            </div>
          </div>
        </div>
      )}

      {/* ── CALLING (outgoing) — full-screen overlay ── */}
      {callState === 'calling' && (
        <div className="call-overlay-bg fixed inset-0 z-[150] flex flex-col items-center justify-between select-none">
          {/* Top */}
          <div className="mt-16 flex flex-col items-center gap-1 text-center">
            <span className={`text-xs font-semibold uppercase tracking-widest ${
              isVideo ? 'text-blue-300' : 'text-green-300'
            }`}>
              {isVideo ? 'Video Call' : 'Audio Call'}
            </span>
          </div>

          {/* Middle: avatar + name + animated dots */}
          <div className="flex flex-col items-center gap-6">
            <div className="relative flex items-center justify-center">
              <span className="call-ring-4 absolute w-52 h-52 rounded-full border border-white/10" />
              <span className="call-ring-5 absolute w-40 h-40 rounded-full border border-white/15" />
              <div className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-2xl ring-4 ring-white/10 ${
                isVideo
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-700'
                  : 'bg-gradient-to-br from-green-500 to-emerald-700'
              }`}>
                {avatarInitial}
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-white text-3xl font-bold">{remoteName}</h2>
              {callerRoleLabel && <p className="text-white/50 text-sm mt-1">{callerRoleLabel}</p>}
              <div className="flex items-center justify-center gap-1.5 mt-4">
                <span className="text-white/50 text-sm mr-1">Calling</span>
                <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>

          {/* Cancel button */}
          <div className="mb-20 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={endCall}
              aria-label="Cancel call"
              className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-2xl hover:bg-red-600 active:scale-90 transition-all"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
            <span className="text-white/60 text-sm font-medium">Cancel</span>
          </div>
        </div>
      )}

      {/* ── ACTIVE AUDIO CALL — compact floating bar ── */}
      {callState === 'active' && callType === 'audio' && (
        <div className="call-audio-bar-bg fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-4 px-5 py-3.5 rounded-2xl shadow-2xl border border-white/10 min-w-[320px] max-w-[420px]">

          {/* Pulsing green dot */}
          <span className="relative flex-shrink-0">
            <span className="w-2.5 h-2.5 bg-green-400 rounded-full block animate-pulse" />
          </span>

          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {avatarInitial}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate leading-tight">{remoteName}</p>
            <p className="text-green-300 font-mono text-xs leading-tight">{timer}</p>
            <p className="text-red-300 text-[10px] leading-tight flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />This call is recorded
            </p>
          </div>

          {/* Mute */}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              muted ? 'bg-red-500/30 text-red-300 hover:bg-red-500/50' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* End */}
          <button
            type="button"
            onClick={endCall}
            aria-label="End call"
            className="w-9 h-9 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 active:scale-90 transition-all flex-shrink-0"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── ACTIVE VIDEO CALL — full-screen meeting room ── */}
      {callState === 'active' && callType === 'video' && (
        <div className="fixed inset-0 z-[150] flex flex-col bg-gray-950">

          {/* Remote video area */}
          <div className="relative flex-1 bg-gray-900 overflow-hidden">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />

            {/* Fallback avatar (behind video) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-32 h-32 bg-gray-700/60 rounded-full flex items-center justify-center text-white text-6xl font-bold select-none">
                {avatarInitial}
              </div>
            </div>

            {/* Name + timer badge — top center */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/50 backdrop-blur-sm px-5 py-2.5 rounded-full">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-white font-semibold text-sm">{remoteName}</span>
              {callerRoleLabel && (
                <span className="text-white/50 text-xs">· {callerRoleLabel}</span>
              )}
              <span className="text-green-400 font-mono text-sm ml-1">{timer}</span>
              <span className="text-red-300 text-xs ml-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />Recorded
              </span>
            </div>

            {/* Local video PIP — bottom right */}
            <div className="absolute bottom-5 right-5 w-36 h-28 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-gray-800">
              {cameraOff ? (
                <div className="w-full h-full flex items-center justify-center bg-gray-700">
                  <VideoOff className="w-7 h-7 text-gray-400" />
                </div>
              ) : (
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              )}
              <div className="absolute bottom-1.5 left-0 right-0 text-center pointer-events-none">
                <span className="text-[10px] text-white/70 bg-black/40 px-2 py-0.5 rounded-full">You</span>
              </div>
            </div>
          </div>

          {/* Controls bar */}
          <div className="flex items-center justify-center gap-8 py-6 bg-gray-950">
            {/* Mute */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                aria-label={muted ? 'Unmute' : 'Mute'}
                onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  muted ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <span className="text-gray-400 text-[11px]">{muted ? 'Unmute' : 'Mute'}</span>
            </div>

            {/* Camera */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                aria-label={cameraOff ? 'Start camera' : 'Stop camera'}
                onClick={toggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  cameraOff ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {cameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
              <span className="text-gray-400 text-[11px]">{cameraOff ? 'Start Video' : 'Stop Video'}</span>
            </div>

            {/* End call */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                aria-label="End call"
                onClick={endCall}
                className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 active:scale-95 transition-all shadow-lg"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <span className="text-gray-400 text-[11px]">End</span>
            </div>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}

export function useCallContext() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCallContext must be used within CallProvider');
  return ctx;
}
