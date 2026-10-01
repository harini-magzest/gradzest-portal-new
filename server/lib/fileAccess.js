// Who may download an uploaded file?
//
// /uploads used to require only "any signed-in user". File names are hard to guess, but they appear in chat
// payloads, document lists and shared screenshots, and a URL is not a permission. Now every download is resolved
// to its owner and checked:
//   - a file in a chat (attachment or call recording): participants of that room only;
//   - a student's or counselor's document, or an offer letter: its owner; any admin; and a counselor only for a
//     student they are allowed to see (the same role-hierarchy rules as the rest of the app);
//   - a file we can't tie to anyone (legacy/orphaned): full admins only. It fails closed.

const path = require('path');
const ChatRoom = require('../models/ChatRoom');
const UploadRecord = require('../models/UploadRecord');
const User = require('../models/User');
const { loadAccess, canView } = require('./access');

async function canAccessUpload(user, storedName) {
  const name = path.basename(String(storedName || ''));
  if (!name || name.startsWith('.')) return false;
  const url = `/uploads/${name}`;
  const me = String(user.id);

  const room = await ChatRoom.findOne({ $or: [{ 'messages.fileUrl': url }, { 'messages.recordingUrl': url }] }).select('participants').lean();
  if (room) return room.participants.map(String).includes(me);

  let ownerId = null;
  const rec = await UploadRecord.findOne({ storedName: name }).select('userId').lean();
  if (rec) ownerId = String(rec.userId);
  if (!ownerId) {
    const owner = await User.findOne({ $or: [{ 'documents.url': url }, { 'applications.offerLetterUrl': url }] }).select('_id').lean();
    if (owner) ownerId = String(owner._id);
  }

  if (!ownerId) return user.role === 'admin' && !user.isAppTeam;
  if (ownerId === me) return true;
  if (user.role === 'admin') return true;
  if (user.role === 'counselor') {
    const owner = await User.findById(ownerId).select('role counselorId assignedStudents').lean();
    if (!owner || owner.role !== 'student') return false; // another staff member's document
    return canView(await loadAccess({ user: { id: user.id } }), owner);
  }
  return false;
}

module.exports = { canAccessUpload };
