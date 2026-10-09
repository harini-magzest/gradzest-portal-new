import { describe, it, expect } from 'vitest';
import { unreadCount, unreadInRooms, unreadWithPeople } from './useMarkRoomRead';

const ME = 'me';
const msg = (senderId: string, extra: Record<string, unknown> = {}) => ({ senderId, read: false, ...extra });

const dmWithAsha = { id: 'r1', type: 'direct', participants: [ME, 'asha'], messages: [msg('asha'), msg('asha', { readBy: [ME] }), msg(ME)] };
const dmWithRavi = { id: 'r2', type: 'direct', participants: [ME, 'ravi'], messages: [msg('ravi', { read: true })] };
const group = { id: 'g1', type: 'group', participants: [ME, 'asha', 'ravi'], messages: [msg('asha'), msg('ravi', { readBy: ['asha'] })] };
const rooms = [dmWithAsha, dmWithRavi, group];

describe('chat tab unread badges', () => {
  it('counts only messages from others that I have not opened', () => {
    expect(unreadCount(dmWithAsha, ME)).toBe(1); // one unread, one I read, one I sent
    expect(unreadCount(dmWithRavi, ME)).toBe(0);
  });

  it("a people tab adds up its people's one-to-one chats, ignoring group chats", () => {
    expect(unreadWithPeople([{ _id: 'asha' }, { id: 'ravi' }], rooms, ME)).toBe(1);
    expect(unreadWithPeople([{ _id: 'nobody' }], rooms, ME)).toBe(0);
  });

  it('the groups tab counts per reader: someone else reading a group message does not clear it for me', () => {
    expect(unreadInRooms([group], ME)).toBe(2);
  });

  it('is zero (no badge) once everything has been read', () => {
    const read = { ...group, messages: group.messages.map(m => ({ ...m, readBy: [ME] })) };
    expect(unreadInRooms([read], ME)).toBe(0);
  });
});
