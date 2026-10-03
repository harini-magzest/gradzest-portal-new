import { useEffect } from 'react';
import { api } from '../api';

/** Unread for this user: sent by someone else and not yet opened by them. */
export const isUnreadFor = (m: any, me: string) =>
  m.senderId !== me && !m.read && !(m.readBy || []).includes(me);

export const unreadCount = (room: any, me: string): number =>
  (room?.messages || []).filter((m: any) => isUnreadFor(m, me)).length;

/** The same room with every message from others marked as read by `me`. */
export const markedReadBy = (room: any, me: string) => ({
  ...room,
  messages: (room.messages || []).map((m: any) => (isUnreadFor(m, me) ? { ...m, readBy: [...(m.readBy || []), me] } : m)),
});

/**
 * Marks the open conversation as read for this user — when it's opened, and again when new messages
 * arrive while it's on screen — then updates the local lists and tells the sidebar badge to refresh.
 * Only runs while the tab is visible, so messages that arrive in a background tab stay unread.
 */
export function useMarkRoomRead(
  selectedRoom: any,
  me: string,
  setRooms: (update: (rooms: any[]) => any[]) => void,
  setSelectedRoom?: (update: (room: any) => any) => void,
) {
  const roomId = selectedRoom?.id;
  const unread = unreadCount(selectedRoom, me);

  useEffect(() => {
    if (!roomId || !me || unread === 0) return;
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      api.chat.markRead(roomId).then(() => window.dispatchEvent(new Event('chat:read'))).catch(() => {});
      setRooms(rooms => rooms.map(r => (r.id === roomId ? markedReadBy(r, me) : r)));
      setSelectedRoom?.(r => (r?.id === roomId ? markedReadBy(r, me) : r));
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
    // Re-runs when the room changes or another unread message lands in it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, me, unread]);
}
