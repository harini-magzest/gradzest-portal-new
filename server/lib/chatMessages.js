// Reading and writing chat messages, which live in their own collection (models/ChatMessage.js) instead of inside
// each room. A room is answered with only the messages its page needs:
// - the chat lists: each room's latest message plus every message the viewer has not read, which is all the
//   previews, ordering and unread badges use;
// - an open conversation: its latest PAGE_SIZE messages, then older pages as the reader scrolls up.
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');

const PAGE_SIZE = 50;
const NEWEST_FIRST = { timestamp: -1, _id: -1 };

const chronological = (a, b) => (new Date(a.timestamp) - new Date(b.timestamp)) || String(a._id).localeCompare(String(b._id));

/** Adds a message to a room and moves the room up the chat lists (they sort rooms by updatedAt). */
async function addMessage(roomId, message) {
  const doc = await ChatMessage.create({ ...message, roomId });
  await ChatRoom.updateOne({ _id: roomId }, { $set: { updatedAt: new Date() } });
  return doc;
}

/** A page of a room's messages, oldest first: the newest ones, or those before message `before`. */
async function messagePage(roomId, { before, limit = PAGE_SIZE } = {}) {
  const filter = { roomId };
  if (before) {
    const anchor = await ChatMessage.findOne({ _id: before, roomId }).select('timestamp').lean();
    if (!anchor) return { messages: [], hasOlder: false };
    filter.$or = [{ timestamp: { $lt: anchor.timestamp } }, { timestamp: anchor.timestamp, _id: { $lt: anchor._id } }];
  }
  const docs = await ChatMessage.find(filter).sort(NEWEST_FIRST).limit(limit + 1);
  return { messages: docs.slice(0, limit).reverse().map((m) => m.toJSON()), hasOlder: docs.length > limit };
}

/** A room as a conversation opens it: the room, its newest messages, and whether there are older ones. */
async function roomWithMessages(room) {
  const { messages, hasOlder } = await messagePage(room._id);
  return { ...room.toJSON(), messages, hasOlder };
}

/** Room id → the room's latest message, as a plain object. One index walk, however long the rooms are. */
async function latestByRoom(roomIds) {
  if (!roomIds.length) return new Map();
  const rows = await ChatMessage.aggregate([
    { $match: { roomId: { $in: roomIds } } },
    { $sort: { roomId: 1, timestamp: -1, _id: -1 } },
    { $group: { _id: '$roomId', last: { $first: '$$ROOT' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.last]));
}

/** For the chat lists: room id → its latest message and every message `me` has not read, oldest first. */
async function listMessages(roomIds, me) {
  if (!roomIds.length) return new Map();
  const [unread, latest] = await Promise.all([
    // Unread for me: sent by someone else, not marked read (1:1) and not opened by me (groups)
    ChatMessage.find({ roomId: { $in: roomIds }, senderId: { $ne: me }, read: { $ne: true }, readBy: { $ne: me } }),
    latestByRoom(roomIds),
  ]);
  const byRoom = new Map(roomIds.map((id) => [String(id), new Map()]));
  for (const m of unread) byRoom.get(String(m.roomId))?.set(String(m._id), m.toJSON());
  for (const last of latest.values()) byRoom.get(String(last.roomId))?.set(String(last._id), ChatMessage.hydrate(last).toJSON());
  return new Map([...byRoom].map(([id, msgs]) => [id, [...msgs.values()].sort(chronological)]));
}

/** The newest `n` messages of a room, oldest first, as plain objects. */
async function lastMessages(roomId, n) {
  const docs = await ChatMessage.find({ roomId }).sort(NEWEST_FIRST).limit(n).lean();
  return docs.reverse();
}

module.exports = { PAGE_SIZE, addMessage, messagePage, roomWithMessages, latestByRoom, listMessages, lastMessages, chronological };
