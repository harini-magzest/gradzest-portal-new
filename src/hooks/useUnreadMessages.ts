import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCallContext } from '../context/CallContext';
import { api } from '../api';

export function useUnreadMessages(): number {
  const { user } = useAuth();
  const { lastMessageTime } = useCallContext();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    api.chat.rooms()
      .then(rooms => {
        const total = rooms.reduce((sum: number, room: any) => {
          return sum + (room.messages || []).filter(
            (m: any) => !m.read && m.senderId !== String(user.id)
          ).length;
        }, 0);
        setCount(total);
      })
      .catch(() => {});
  }, [user, lastMessageTime]);

  return count;
}
