// The open conversation loads its own messages (GET /chat/rooms/:id, then older pages), because the chat list only
// carries each room's latest and unread messages.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { mergeLatest, withLoadedMessages, useOpenRoom } from './useOpenRoom';
import EarlierMessages from '../components/chat/EarlierMessages';

const chat = vi.hoisted(() => ({ room: vi.fn(), olderMessages: vi.fn() }));
vi.mock('../api', () => ({ api: { chat } }));

const msg = (i: number, text = `m${i}`) => ({ _id: `id${String(i).padStart(3, '0')}`, id: `id${String(i).padStart(3, '0')}`, content: text, timestamp: new Date(2026, 0, 1, 0, i).toISOString() });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => msg(from + k));

describe('mergeLatest', () => {
  it('replaces a list entry with the fetched page', () => {
    const entry = { id: 'r1', messages: [msg(99)] };
    const merged = mergeLatest(entry, { id: 'r1', messages: range(50, 99), hasOlder: true });
    expect(merged.messages.map((m: any) => m.content)).toEqual(range(50, 99).map(m => m.content));
    expect(merged).toMatchObject({ loaded: true, hasOlder: true });
  });

  it('keeps older pages already loaded and adds what is new', () => {
    const open = { id: 'r1', loaded: true, hasOlder: false, messages: range(0, 99) };
    const merged = mergeLatest(open, { id: 'r1', messages: range(51, 100), hasOlder: true });
    expect(merged.messages.map((m: any) => m.content)).toEqual(range(0, 100).map(m => m.content));
    expect(merged.hasOlder).toBe(false); // the oldest message is already on screen
  });

  it('keeps a message the page added itself that the fetch did not see yet', () => {
    const open = { id: 'r1', loaded: true, hasOlder: false, messages: [...range(0, 9), msg(10, 'just sent')] };
    const merged = mergeLatest(open, { id: 'r1', messages: range(0, 9), hasOlder: false });
    expect(merged.messages.map((m: any) => m.content).slice(-1)).toEqual(['just sent']);
  });

  it('changes nothing when nothing changed, and ignores a page for a room no longer open', () => {
    const open = { id: 'r1', loaded: true, hasOlder: false, messages: range(0, 9) };
    expect(mergeLatest(open, { id: 'r1', messages: range(0, 9), hasOlder: false })).toBe(open);
    expect(mergeLatest(open, { id: 'r2', messages: range(0, 3), hasOlder: false })).toBe(open);
  });
});

describe('withLoadedMessages', () => {
  it('keeps the open conversation when the list refreshes', () => {
    const open = { id: 'r1', loaded: true, hasOlder: true, messages: range(0, 49) };
    const fromList = { id: 'r1', name: 'renamed', messages: [msg(49)] };
    expect(withLoadedMessages(fromList, open)).toMatchObject({ name: 'renamed', messages: open.messages, hasOlder: true });
    expect(withLoadedMessages(fromList, { id: 'r1', messages: [] })).toBe(fromList); // nothing loaded yet
  });
});

function Conversation({ initial }: { initial: any }) {
  const [room, setRoom] = useState<any>(initial);
  const box = useRef<HTMLDivElement>(null);
  const open = useOpenRoom(room, setRoom, { containerRef: box, pollMs: 0 });
  return (
    <div ref={box} onScroll={open.onScroll}>
      <EarlierMessages hasOlder={open.hasOlder} loading={open.loadingOlder} onLoad={open.loadOlder} />
      {(room.messages || []).map((m: any) => <p key={m.id}>{m.content}</p>)}
    </div>
  );
}

describe('useOpenRoom', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the latest page when a room opens, and the page before on request', async () => {
    chat.room.mockResolvedValue({ id: 'r1', messages: range(50, 99), hasOlder: true });
    chat.olderMessages.mockResolvedValue({ messages: range(0, 49), hasOlder: false });
    render(<Conversation initial={{ id: 'r1', messages: [msg(99)] }} />);

    expect(await screen.findByText('m50')).toBeInTheDocument();
    expect(chat.room).toHaveBeenCalledWith('r1');
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier messages' }));
    expect(await screen.findByText('m0')).toBeInTheDocument();
    expect(chat.olderMessages).toHaveBeenCalledWith('r1', 'id050');
    await waitFor(() => expect(screen.queryByRole('button', { name: /earlier messages/ })).not.toBeInTheDocument());
    expect(screen.getAllByText(/^m\d+$/)).toHaveLength(100);
  });

  it('keeps the list entry on screen if the room cannot be fetched', async () => {
    chat.room.mockRejectedValue(new Error('offline'));
    render(<Conversation initial={{ id: 'r1', messages: [msg(7, 'last one')] }} />);
    await waitFor(() => expect(chat.room).toHaveBeenCalled());
    expect(screen.getByText('last one')).toBeInTheDocument();
  });
});
