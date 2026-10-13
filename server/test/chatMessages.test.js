// Chat messages live in their own collection (models/ChatMessage.js, lib/chatMessages.js). The chat lists carry each
// room's latest message plus the viewer's unread ones; an open conversation loads its latest 50 and older pages on
// request; a message's JSON is what it was inside the room. scripts/migrateChatMessages.js moves existing messages.
const path = require('path');
const { execFile } = require('child_process');
const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const { migrateChatMessages } = require('../scripts/migrateChatMessages');
const { createRoom, roomMessages } = require('./helpers');

let n = 0;
async function login(role, name = `Chat ${role}`) {
  const email = `chatmsg-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: String(res.body.user.id), name };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
// Mirrors isUnreadFor in src/hooks/useMarkRoomRead.ts
const unreadFor = (messages, me) => messages.filter((m) => m.senderId !== me && !m.read && !(m.readBy || []).includes(me)).length;

// A 1:1 room with `count` messages alternating between the two, oldest first
async function longRoom(a, b, count) {
  const at = Date.now() - count * 1000;
  return createRoom({
    participants: [a.id, b.id], participantNames: [a.name, b.name], type: 'student-counselor',
    messages: Array.from({ length: count }, (_, i) => {
      const from = i % 2 ? b : a;
      return { senderId: from.id, senderName: from.name, content: `message ${i}`, timestamp: new Date(at + i * 1000) };
    }),
  });
}

describe('sending', () => {
  it('stores the message in its own collection, keeps the room small, and moves the room up the lists', async () => {
    const student = await login('student');
    const counselor = await login('counselor');
    const { room } = await createRoom({ participants: [student.id, counselor.id], participantNames: ['S', 'C'] });
    const before = (await ChatRoom.findById(room._id)).updatedAt;
    await new Promise((r) => setTimeout(r, 5));

    const res = await request(app).post(`/api/chat/rooms/${room._id}/messages`).set(as(student)).send({ content: 'Hello', senderName: 'S' });
    expect(res.status).toBe(200);
    expect(await ChatMessage.countDocuments({ roomId: room._id })).toBe(1);
    const raw = await mongoose.connection.db.collection('chatrooms').findOne({ _id: room._id });
    expect(raw.messages).toBeUndefined();
    expect(raw.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it('answers a message with the same JSON a message had inside its room', async () => {
    const student = await login('student');
    const counselor = await login('counselor');
    const { room } = await createRoom({ participants: [student.id, counselor.id], participantNames: ['S', 'C'] });
    const res = await request(app).post(`/api/chat/rooms/${room._id}/messages`).set(as(student)).send({ content: 'Hello', senderName: 'S' });
    expect(Object.keys(res.body).sort()).toEqual(
      ['_id', 'id', 'senderId', 'senderName', 'senderRole', 'content', 'timestamp', 'read', 'type', 'callDuration', 'reactions', 'fileSize', 'isOfferLetter'].sort(),
    );
    expect(res.body).toMatchObject({ id: res.body._id, content: 'Hello', type: 'text', read: false, reactions: [] });
  });

  it('quotes a reply from the same room, and reactions are saved on the message', async () => {
    const student = await login('student');
    const counselor = await login('counselor');
    const { room, messages } = await createRoom({
      participants: [student.id, counselor.id], participantNames: ['S', 'C'],
      messages: [{ senderId: counselor.id, senderName: 'C', content: 'Your offer is in' }],
    });
    const reply = await request(app).post(`/api/chat/rooms/${room._id}/messages`).set(as(student))
      .send({ content: 'Thank you!', senderName: 'S', replyToId: String(messages[0]._id) });
    expect(reply.body.replyTo).toEqual({ messageId: String(messages[0]._id), senderName: 'C', content: 'Your offer is in' });

    const r = await request(app).post(`/api/chat/rooms/${room._id}/messages/${messages[0]._id}/reactions`).set(as(student)).send({ emoji: '👍' });
    expect(r.status).toBe(200);
    expect((await ChatMessage.findById(messages[0]._id)).reactions.map((x) => x.emoji)).toEqual(['👍']);
  });
});

describe('the chat list', () => {
  it('carries each room\'s latest message and the viewer\'s unread ones, not the whole history', async () => {
    const student = await login('student');
    const counselor = await login('counselor');
    const { room } = await longRoom(student, counselor, 120);
    // The counselor read everything, then the student wrote three more
    await request(app).put(`/api/chat/rooms/${room._id}/read`).set(as(counselor));
    for (const content of ['one', 'two', 'three']) {
      await request(app).post(`/api/chat/rooms/${room._id}/messages`).set(as(student)).send({ content, senderName: student.name });
    }

    const list = (await request(app).get('/api/chat/rooms').set(as(counselor))).body;
    const entry = list.find((r) => r.id === String(room._id));
    expect(entry.messages.map((m) => m.content)).toEqual(['one', 'two', 'three']);
    expect(unreadFor(entry.messages, counselor.id)).toBe(unreadFor(await roomMessages(room._id), counselor.id));

    // The student has read the counselor's messages too: only the latest is left
    await request(app).put(`/api/chat/rooms/${room._id}/read`).set(as(student));
    const theirs = (await request(app).get('/api/chat/rooms').set(as(student))).body.find((r) => r.id === String(room._id));
    expect(theirs.messages.map((m) => m.content)).toEqual(['three']);
  });

  it('an empty room has no messages, and rooms of other people never show', async () => {
    const student = await login('student');
    const counselor = await login('counselor');
    const outsider = await login('counselor');
    const { room } = await createRoom({ participants: [student.id, counselor.id], participantNames: ['S', 'C'] });
    const entry = (await request(app).get('/api/chat/rooms').set(as(student))).body.find((r) => r.id === String(room._id));
    expect(entry.messages).toEqual([]);
    expect((await request(app).get('/api/chat/rooms').set(as(outsider))).body.some((r) => r.id === String(room._id))).toBe(false);
  });
});

describe('an open conversation', () => {
  it('opens on the latest 50 and pages back to the first message without gaps or repeats', async () => {
    const student = await login('student');
    const counselor = await login('counselor');
    const { room } = await longRoom(student, counselor, 123);

    const opened = await request(app).get(`/api/chat/rooms/${room._id}`).set(as(student));
    expect(opened.body.messages).toHaveLength(50);
    expect(opened.body.hasOlder).toBe(true);
    expect(opened.body.messages[49].content).toBe('message 122');

    let seen = opened.body.messages;
    let hasOlder = true;
    while (hasOlder) {
      const page = await request(app).get(`/api/chat/rooms/${room._id}/messages?before=${seen[0]._id}`).set(as(student));
      expect(page.status).toBe(200);
      seen = [...page.body.messages, ...seen];
      hasOlder = page.body.hasOlder;
    }
    expect(seen.map((m) => m.content)).toEqual(Array.from({ length: 123 }, (_, i) => `message ${i}`));
  });

  it('is for members only, and refuses a malformed page request', async () => {
    const student = await login('student');
    const counselor = await login('counselor');
    const outsider = await login('student');
    const { room, messages } = await longRoom(student, counselor, 3);
    expect((await request(app).get(`/api/chat/rooms/${room._id}/messages?before=${messages[2]._id}`).set(as(outsider))).status).toBe(404);
    expect((await request(app).get(`/api/chat/rooms/${room._id}/messages`).set(as(student))).status).toBe(400);
    expect((await request(app).get(`/api/chat/rooms/${room._id}/messages?before=nope`).set(as(student))).status).toBe(400);
    // a message of another room is no anchor
    const other = await longRoom(student, counselor, 2);
    const res = await request(app).get(`/api/chat/rooms/${room._id}/messages?before=${other.messages[1]._id}`).set(as(student));
    expect(res.body).toEqual({ messages: [], hasOlder: false });
  });

  it('creating or reopening a room answers it with its latest messages', async () => {
    const student = await login('student');
    const counselor = await login('counselor');
    const { room } = await longRoom(student, counselor, 60);
    const res = await request(app).post('/api/chat/rooms').set(as(counselor))
      .send({ participantIds: [student.id, counselor.id], participantNames: [student.name, counselor.name] });
    expect(res.body.id).toBe(String(room._id));
    expect(res.body.messages).toHaveLength(50);
    expect(res.body.hasOlder).toBe(true);
  });
});

/* ── Migration ─────────────────────────────────────────────────────────────────────────────────────────────────── */

describe('scripts/migrateChatMessages.js', () => {
  // Rooms as the old server wrote them: messages inside the room document
  async function legacyRoom(people, messages) {
    const db = mongoose.connection.db;
    const embedded = messages.map((m, i) => ({
      _id: new mongoose.Types.ObjectId(), content: '', read: false, type: 'text', callDuration: 0, fileSize: 0, isOfferLetter: false,
      reactions: [], timestamp: new Date(Date.now() - (messages.length - i) * 1000), ...m,
    }));
    const { insertedId } = await db.collection('chatrooms').insertOne({
      participants: people.map((p) => p.id), participantNames: people.map((p) => p.name), type: 'student-counselor',
      messages: embedded, createdAt: new Date(), updatedAt: new Date(),
    });
    return { roomId: insertedId, embedded };
  }

  it('copies every message with its _id, only with --apply, safely twice, then removes the arrays', async () => {
    const db = mongoose.connection.db;
    const student = await login('student');
    const counselor = await login('counselor');
    const { roomId, embedded } = await legacyRoom([student, counselor], [
      { senderId: student.id, senderName: 'S', content: 'Hi' },
      { senderId: counselor.id, senderName: 'C', type: 'call', callStatus: 'answered', callDuration: 42 },
      { senderId: counselor.id, senderName: 'C', type: 'file', content: 'offer.pdf', fileUrl: '/uploads/offer.pdf', fileName: 'offer.pdf', readBy: [student.id] },
    ]);

    // The old embedded array is never served, before or after migrating
    const before = (await request(app).get(`/api/chat/rooms/${roomId}`).set(as(student))).body;
    expect(before.messages).toEqual([]);

    const dry = await migrateChatMessages(db);
    expect(dry.messages).toBeGreaterThanOrEqual(3);
    expect(await ChatMessage.countDocuments({ roomId })).toBe(0);

    const applied = await migrateChatMessages(db, { apply: true });
    expect(applied.copied).toBeGreaterThanOrEqual(3);
    const copied = await roomMessages(roomId);
    expect(copied.map((m) => String(m._id))).toEqual(embedded.map((m) => String(m._id)));
    expect(copied[1]).toMatchObject({ type: 'call', callStatus: 'answered', callDuration: 42 });
    expect(copied[2]).toMatchObject({ fileUrl: '/uploads/offer.pdf', readBy: [student.id] });
    expect((await db.collection('chatrooms').findOne({ _id: roomId })).messages).toHaveLength(3); // still there for the old server

    const after = (await request(app).get(`/api/chat/rooms/${roomId}`).set(as(student))).body;
    expect(after.messages.map((m) => m.id)).toEqual(embedded.map((m) => String(m._id)));
    // the chat file is still only for the room's members
    expect(await require('../lib/fileAccess').canAccessUpload({ id: student.id, role: 'student' }, 'offer.pdf')).toBe(true);

    expect((await migrateChatMessages(db, { apply: true })).copied).toBe(0);
    const finished = await migrateChatMessages(db, { apply: true, removeEmbedded: true });
    expect(finished.roomsEmptied).toBeGreaterThanOrEqual(1);
    expect((await db.collection('chatrooms').findOne({ _id: roomId })).messages).toBeUndefined();
    expect(await ChatMessage.countDocuments({ roomId })).toBe(3);
    expect((await migrateChatMessages(db)).rooms).toBe(0);
  });

  it('runs as a command: a dry run by default; unknown options, or removing without copying, are refused', async () => {
    const run = (...args) => new Promise((resolve) => {
      execFile(process.execPath, [path.join(__dirname, '..', 'scripts', 'migrateChatMessages.js'), ...args], { env: process.env },
        (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
    });
    const dry = await run();
    expect(dry.code).toBe(0);
    expect(dry.stdout).toMatch(/DRY RUN/);
    expect((await run('--force')).code).toBe(1);
    expect((await run('--remove-embedded')).code).toBe(1);
  }, 60000);
});
