// Polls a condition instead of a fixed sleep, for asserting on fire-and-forget
// work (logAnalystAction's chain-queued writes, critical-alert emails) whose
// completion time isn't fixed — it depends on how much else the process has
// queued ahead of it, which grows as the suite grows. A fixed setTimeout that
// happens to be long enough today becomes flaky the next time someone adds
// tests; polling with a generous ceiling doesn't.
async function waitUntil(check, { timeout = 3000, interval = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await check();
    if (result) return result;
    await new Promise((r) => setTimeout(r, interval));
  }
  return check();
}

// A chat room and its messages, which live in their own collection (models/ChatMessage.js). Messages without a
// timestamp get increasing ones, so they keep the order given. Returns the room and its saved messages, oldest first.
async function createRoom({ messages = [], ...fields }) {
  const ChatRoom = require('../models/ChatRoom');
  const ChatMessage = require('../models/ChatMessage');
  const room = await ChatRoom.create(fields);
  const start = Date.now() - messages.length;
  const saved = [];
  for (const [i, m] of messages.entries()) saved.push(await ChatMessage.create({ timestamp: new Date(start + i), ...m, roomId: room._id }));
  return { room, messages: saved };
}

// A room's messages, oldest first: what room.messages held when messages lived inside the room
function roomMessages(roomId) {
  return require('../models/ChatMessage').find({ roomId }).sort({ timestamp: 1, _id: 1 }).lean();
}

module.exports = { waitUntil, createRoom, roomMessages };
