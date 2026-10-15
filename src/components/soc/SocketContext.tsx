import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiToken } from '../../api';

// `resyncKey` goes up by one each time the connection comes back after having been lost. Pushed events are not replayed,
// so anything that happened while the socket was down is missing from every list on screen until it is fetched again.
interface SocSocketValue { socket: Socket | null; isLive: boolean; resyncKey: number }
const SocketCtx = createContext<SocSocketValue>({ socket: null, isLive: false, resyncKey: 0 });

// One socket for the whole SOC dashboard instead of one per tab. Besides cutting the
// reconnect flicker on every tab switch, this is where the connection actually joins
// 'admin-room' — without emitting 'register' after connect, the server (server/app.js,
// the socket.on('register', ...) handler) never puts a socket in any room, so it would
// sit there "Connected" while structurally unable to receive a single pushed event.
export function SocSocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [resyncKey, setResyncKey] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const connectedBefore = useRef(false);

  useEffect(() => {
    // No cap on attempts: this screen is left open for days, and a server restart that outlasts a fixed number of tries
    // would otherwise leave it showing "Offline" until someone thinks to reload the page.
    const s: Socket = io(import.meta.env.VITE_API_URL || '', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
      reconnectionAttempts: Infinity, reconnectionDelay: 2000, reconnectionDelayMax: 10000,
    });
    const onConnect = () => {
      s.emit('register');
      setIsLive(true);
      if (connectedBefore.current) setResyncKey(k => k + 1);
      connectedBefore.current = true;
    };
    s.on('connect', onConnect);
    s.on('disconnect', () => setIsLive(false));
    s.on('connect_error', () => setIsLive(false));
    socketRef.current = s;
    setSocket(s);
    return () => { s.disconnect(); socketRef.current = null; };
  }, []);

  return <SocketCtx.Provider value={{ socket, isLive, resyncKey }}>{children}</SocketCtx.Provider>;
}

export function useSocSocket() {
  return useContext(SocketCtx);
}

/** Runs `fn` again when the live connection returns after a drop, so a list catches up on what it missed. */
export function useOnResync(fn: () => void) {
  const { resyncKey } = useSocSocket();
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; });
  useEffect(() => { if (resyncKey > 0) latest.current(); }, [resyncKey]);
}
