import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiToken } from '../api';

export type CallState = 'idle' | 'calling' | 'incoming' | 'active';

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export function useCall(userId: string | undefined, userName: string | undefined) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [remoteName, setRemoteName] = useState('');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteIdRef = useRef('');
  const stopRef = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setRemoteStream(null);
    setMuted(false);
    setCallState('idle');
    setRemoteName('');
    setElapsed(0);
    remoteIdRef.current = '';
  }, []);

  stopRef.current = stop;

  useEffect(() => {
    if (callState !== 'active') { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  useEffect(() => {
    if (!userId) return;

    const socket = io(import.meta.env.VITE_API_URL || '', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
    });
    socketRef.current = socket;
    const registerSocket = () => socket.emit('register', userId);
    socket.on('connect', registerSocket);
    if (socket.connected) registerSocket();

    const buildPC = (targetId: string) => {
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('call:ice', { to: targetId, candidate });
      };
      pc.ontrack = e => setRemoteStream(e.streams[0]);
      return pc;
    };

    socket.on('call:incoming', ({ from, fromName }: { from: string; fromName: string }) => {
      remoteIdRef.current = from;
      setRemoteName(fromName);
      setCallState('incoming');
    });

    socket.on('call:accepted', async ({ from }: { from: string }) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        const pc = buildPC(from);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', { to: from, offer });
        setCallState('active');
      } catch { stopRef.current(); }
    });

    socket.on('call:rejected', () => stopRef.current());
    socket.on('call:ended',    () => stopRef.current());

    socket.on('call:offer', async ({ offer, from }: { offer: RTCSessionDescriptionInit; from: string }) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        const pc = buildPC(from);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { to: from, answer });
      } catch { stopRef.current(); }
    });

    socket.on('call:answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      try { await pcRef.current?.setRemoteDescription(answer); } catch {}
    });

    socket.on('call:ice', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      try { await pcRef.current?.addIceCandidate(candidate); } catch {}
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [userId]);

  const startCall = useCallback((targetId: string, targetName: string) => {
    remoteIdRef.current = targetId;
    setRemoteName(targetName);
    setCallState('calling');
    socketRef.current?.emit('call:invite', { to: targetId, from: userId, fromName: userName });
  }, [userId, userName]);

  const acceptCall = useCallback(() => {
    setCallState('active');
    socketRef.current?.emit('call:accept', { to: remoteIdRef.current, from: userId });
  }, [userId]);

  const rejectCall = useCallback(() => {
    socketRef.current?.emit('call:reject', { to: remoteIdRef.current });
    stopRef.current();
  }, []);

  const endCall = useCallback(() => {
    socketRef.current?.emit('call:end', { to: remoteIdRef.current });
    stopRef.current();
  }, []);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMuted(m => !m);
  }, []);

  const timer = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return { callState, remoteName, remoteStream, muted, timer, startCall, acceptCall, rejectCall, endCall, toggleMute };
}
