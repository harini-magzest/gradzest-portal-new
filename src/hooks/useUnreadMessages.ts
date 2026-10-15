import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCallContext } from '../context/CallContext';
import { api } from '../api';
import { unreadCount } from './useMarkRoomRead';

export function useUnreadMessages(): number {
  const { user } = useAuth();
  const { lastMessageTime } = useCallContext();
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    if (!user) return;
    const me = String(user.id);
    api.chat.rooms()
      .then(rooms => setCount(rooms.reduce((sum: number, room: any) => sum + unreadCount(room, me), 0)))
      .catch(() => {});
  }, [user]);

  useEffect(() => { load(); }, [load, lastMessageTime]);
  // A chat was just opened and marked read — drop its messages from the badge right away
  useEffect(() => {
    window.addEventListener('chat:read', load);
    return () => window.removeEventListener('chat:read', load);
  }, [load]);

  return count;
}
