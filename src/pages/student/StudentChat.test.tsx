// The student's chat: the list carries only each room's latest and unread messages, so the open conversation loads
// its latest page itself, keeps it across list refreshes, and loads older messages on request.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentChat from './StudentChat';

const chat = vi.hoisted(() => ({
  rooms: vi.fn(), room: vi.fn(), olderMessages: vi.fn(), send: vi.fn(), sendFile: vi.fn(), markRead: vi.fn(),
}));
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  api: { chat, onboarding: { markStep: vi.fn().mockResolvedValue({}) }, students: { uploadDocument: vi.fn() } },
}));
// One stable user object, as the real AuthContext gives (the page reloads its rooms when the user changes)
const auth = vi.hoisted(() => ({ user: { id: 's1', role: 'student', name: 'Asha Rao', onboarding: { counselorViewed: true } }, refreshUser: () => Promise.resolve() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
const call = vi.hoisted(() => ({
  callState: 'idle', startCall: vi.fn(), startVideoCall: vi.fn(), lastMessageTime: 0, isOnline: () => false, lastSeenOf: () => null,
}));
vi.mock('../../context/CallContext', () => ({ useCallContext: () => call }));
const toastContext = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toastContext }));

const msg = (i: number, from = 'c1') => ({
  _id: `m${String(i).padStart(3, '0')}`, id: `m${String(i).padStart(3, '0')}`, senderId: from, senderName: from === 's1' ? 'Asha Rao' : 'Meera',
  content: `message ${i}`, type: 'text', read: true, timestamp: new Date(2026, 0, 1, 9, i).toISOString(),
});
const room = { id: 'r1', _id: 'r1', type: 'student-counselor', participants: ['s1', 'c1'], participantNames: ['Asha Rao', 'Meera'] };
const latest = Array.from({ length: 50 }, (_, k) => msg(50 + k));

beforeEach(() => {
  vi.clearAllMocks();
  // The list entry: the latest message only
  chat.rooms.mockResolvedValue([{ ...room, messages: [msg(99)] }]);
  chat.room.mockResolvedValue({ ...room, messages: latest, hasOlder: true });
  chat.olderMessages.mockResolvedValue({ messages: Array.from({ length: 50 }, (_, k) => msg(k)), hasOlder: false });
  chat.markRead.mockResolvedValue({ ok: true });
});

const renderPage = () => render(<MemoryRouter><StudentChat /></MemoryRouter>);

describe('StudentChat', () => {
  it('opens the conversation on its latest messages, not just the list\'s last one', async () => {
    renderPage();
    expect(await screen.findByText('message 50')).toBeInTheDocument();
    expect(screen.getByText('message 99')).toBeInTheDocument();
    expect(chat.room).toHaveBeenCalledWith('r1');
  });

  it('loads older messages on request, and a new message does not drop them', async () => {
    const view = renderPage();
    await screen.findByText('message 50');
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier messages' }));
    expect(await screen.findByText('message 0')).toBeInTheDocument();
    expect(chat.olderMessages).toHaveBeenCalledWith('r1', 'm050');

    // A message arrives: the list refreshes with only the newest message; the conversation keeps everything
    chat.rooms.mockResolvedValue([{ ...room, messages: [msg(100)] }]);
    chat.room.mockResolvedValue({ ...room, messages: [...latest.slice(1), msg(100)], hasOlder: true });
    call.lastMessageTime = Date.now();
    view.rerender(<MemoryRouter><StudentChat /></MemoryRouter>);
    expect(await screen.findByText('message 100')).toBeInTheDocument();
    expect(screen.getByText('message 0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show earlier messages' })).not.toBeInTheDocument();
    call.lastMessageTime = 0;
  });

  it('adds a sent message to the conversation', async () => {
    chat.send.mockResolvedValue(msg(100, 's1'));
    renderPage();
    await screen.findByText('message 50');
    fireEvent.change(screen.getByPlaceholderText('Type a message…'), { target: { value: 'message 100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(chat.send).toHaveBeenCalledWith('r1', 'message 100', 'Asha Rao', undefined));
    expect(await screen.findByText('message 100')).toBeInTheDocument();
    expect(screen.getByText('message 50')).toBeInTheDocument();
  });
});
