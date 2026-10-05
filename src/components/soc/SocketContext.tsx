import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiToken } from '../../api';

interface SocSocketValue { socket: Socket | null; isLive: boolean }
const SocketCtx = createContext<SocSocketValue>({ socket: null, isLive: false });

// One socket for the whole SOC dashboard instead of one per tab. Besides cutting the
// reconnect flicker on every tab switch, this is where the connection actually joins
// 'admin-room' — without emitting 'register' after connect, the server (server/app.js,
// the socket.on('register', ...) handler) never puts a socket in any room, so it would
// sit there "Connected" while structurally unable to receive a single pushed event.
export function SocSocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLive, setIsLive] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const s: Socket = io(import.meta.env.VITE_API_URL || '', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
      reconnectionAttempts: 10, reconnectionDelay: 2000, reconnectionDelayMax: 10000,
    });
    const onConnect = () => { s.emit('register'); setIsLive(true); };
    s.on('connect', onConnect);
    s.on('disconnect', () => setIsLive(false));
    s.on('connect_error', () => setIsLive(false));
    socketRef.current = s;
    setSocket(s);
    return () => { s.disconnect(); socketRef.current = null; };
  }, []);

  return <SocketCtx.Provider value={{ socket, isLive }}>{children}</SocketCtx.Provider>;
}

export function useSocSocket() {
  return useContext(SocketCtx);
}
