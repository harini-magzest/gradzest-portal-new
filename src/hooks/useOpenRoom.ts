import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { api } from '../api';

// The open conversation, a page at a time (server/lib/chatMessages.js). The chat list carries only each room's latest
// and unread messages, so the open room loads its own: the latest page when it opens and whenever the list refreshes,
// merged into what is already on screen, and the page before when the reader scrolls to the top.

const idOf = (m: any) => String(m?._id ?? m?.id);
const at = (m: any) => new Date(m?.timestamp).getTime();
const before = (a: any, b: any) => at(a) < at(b) || (at(a) === at(b) && idOf(a) < idOf(b));

/**
 * Merges a freshly fetched latest page into the open room. Older pages already loaded stay, and so does anything newer
 * that the page added itself (a message just sent). A room that showed only its list entry takes the page as it is.
 * Returns `open` itself when nothing changed, so a quiet refresh does not re-render or scroll.
 */
export function mergeLatest(open: any, fresh: any) {
  if (!open || String(open.id) !== String(fresh.id)) return open; // another room was opened meanwhile
  const page: any[] = fresh.messages || [];
  const current: any[] = open.messages || [];
  const inPage = new Set(page.map(idOf));
  const first = page[0];
  const last = page[page.length - 1];
  const older = open.loaded && first ? current.filter(m => !inPage.has(idOf(m)) && before(m, first)) : [];
  const newer = last ? current.filter(m => !inPage.has(idOf(m)) && before(last, m)) : current.filter(m => !inPage.has(idOf(m)));
  const messages = [...older, ...page, ...newer];
  const hasOlder = older.length ? open.hasOlder : fresh.hasOlder;
  if (open.loaded && open.hasOlder === hasOlder && JSON.stringify(messages) === JSON.stringify(current)) return open;
  return { ...open, ...fresh, messages, hasOlder, loaded: true };
}

/** A refreshed list entry for the open room, keeping the messages already loaded on screen. */
export function withLoadedMessages(fromList: any, open: any) {
  if (!fromList || !open?.loaded || String(open.id) !== String(fromList.id)) return fromList;
  return { ...fromList, messages: open.messages, hasOlder: open.hasOlder, loaded: true };
}

export function useOpenRoom(
  room: any,
  setRoom: (update: (room: any) => any) => void,
  { refresh, containerRef, pollMs = 15000 }: { refresh?: unknown; containerRef: RefObject<HTMLElement>; pollMs?: number },
) {
  const roomId: string | undefined = room?.id ? String(room.id) : undefined;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [tick, setTick] = useState(0);
  // Distance from the bottom before older messages were added, so the reader stays where they were
  const keepFromBottom = useRef<number | null>(null);
  const olderJustAdded = useRef(false);

  // The latest page: when the room opens, when the caller says something changed, and every pollMs
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    api.chat.room(roomId)
      .then(fresh => { if (!cancelled) setRoom(open => mergeLatest(open, fresh)); })
      .catch(() => { /* the list entry stays on screen; the next refresh tries again */ });
    return () => { cancelled = true; };
  }, [roomId, refresh, tick, setRoom]);
  useEffect(() => {
    if (!roomId || !pollMs) return;
    const id = setInterval(() => setTick(t => t + 1), pollMs);
    return () => clearInterval(id);
  }, [roomId, pollMs]);

  const loadOlder = useCallback(async () => {
    const first = room?.messages?.[0];
    if (!roomId || !room?.hasOlder || !first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await api.chat.olderMessages(roomId, idOf(first));
      const el = containerRef.current;
      keepFromBottom.current = el ? el.scrollHeight - el.scrollTop : null;
      olderJustAdded.current = true;
      setRoom(open => (open && String(open.id) === roomId
        ? { ...open, messages: [...page.messages.filter((m: any) => !open.messages.some((x: any) => idOf(x) === idOf(m))), ...open.messages], hasOlder: page.hasOlder }
        : open));
    } catch { /* the reader can scroll up again */ } finally {
      setLoadingOlder(false);
    }
  }, [roomId, room?.hasOlder, room?.messages, loadingOlder, setRoom, containerRef]);

  // After older messages are added above, keep the same messages in view
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el && keepFromBottom.current !== null) el.scrollTop = el.scrollHeight - keepFromBottom.current;
    keepFromBottom.current = null;
  }, [room?.messages, containerRef]);

  /** For the messages container: near the top, load the page before. */
  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (el && el.scrollTop < 80) loadOlder();
  }, [containerRef, loadOlder]);

  /** True once after older messages were added: the page should not jump to the newest message for that change. */
  const consumeOlderAdded = useCallback(() => {
    const was = olderJustAdded.current;
    olderJustAdded.current = false;
    return was;
  }, []);

  return { loadOlder, loadingOlder, hasOlder: !!room?.hasOlder, onScroll, consumeOlderAdded };
}
