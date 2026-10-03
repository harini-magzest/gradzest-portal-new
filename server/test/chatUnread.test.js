const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');

let n = 0;
async function login(role) {
  const email = `unread-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Unread ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: String(res.body.user.id) };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
// Mirrors isUnreadFor in src/hooks/useMarkRoomRead.ts
const unreadFor = (room, me) => room.messages.filter(m => m.senderId !== me && !m.read && !(m.readBy || []).includes(me)).length;
const roomFor = async (who, id) => (await request(app).get('/api/chat/rooms').set(auth(who.token))).body.find(r => r.id === id);

describe('chat read status', () => {
  it('in a group, opening the chat clears it only for the person who opened it', async () => {
    const admin = await login('admin');
    const a = await login('counselor');
    const b = await login('counselor');
    const room = await ChatRoom.create({
      type: 'group', name: 'Team', participants: [admin.id, a.id, b.id], participantNames: ['Admin', 'A', 'B'],
      messages: [{ senderId: admin.id, senderName: 'Admin', content: 'Standup at 10' }],
    });
    const id = String(room._id);
    expect(unreadFor(await roomFor(a, id), a.id)).toBe(1);

    expect((await request(app).put(`/api/chat/rooms/${id}/read`).set(auth(a.token))).status).toBe(200);
    expect(unreadFor(await roomFor(a, id), a.id)).toBe(0);
    expect(unreadFor(await roomFor(b, id), b.id)).toBe(1); // B hasn't opened it yet
  });

  it('in a 1:1 chat it also sets the read flag, and only members can mark a room read', async () => {
    const counselor = await login('counselor');
    const student = await login('student');
    const outsider = await login('counselor');
    const room = await ChatRoom.create({
      participants: [counselor.id, student.id], participantNames: ['C', 'S'],
      messages: [{ senderId: student.id, senderName: 'S', content: 'hi' }, { senderId: counselor.id, senderName: 'C', content: 'hello' }],
    });
    const id = String(room._id);
    expect((await request(app).put(`/api/chat/rooms/${id}/read`).set(auth(outsider.token))).status).toBe(404);
    await request(app).put(`/api/chat/rooms/${id}/read`).set(auth(counselor.token));
    const saved = await ChatRoom.findById(id).lean();
    expect(saved.messages[0]).toMatchObject({ read: true, readBy: [counselor.id] });
    expect(saved.messages[1].read).toBe(false); // the counselor's own message is untouched
  });
});
