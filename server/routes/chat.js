const express = require('express');
const ChatRoom = require('../models/ChatRoom');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const { recordStaffActivity } = require('../lib/staffActivity');

const router = express.Router();

async function resolveDisplayRole(userId, userRole) {
  if (userRole === 'admin') {
    const u = await User.findById(userId).select('isAppTeam');
    return u?.isAppTeam ? 'Application Team' : 'Admin Team';
  }
  if (userRole === 'counselor') return 'Counselor';
  if (userRole === 'student') return 'Student';
  return userRole;
}

// Admin-side staff directory for chat (admins + application team) — minimal fields only,
// so Application Team accounts can list admins without access to /api/admin/appteam-users
router.get('/staff', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    const staff = await User.find({ role: 'admin' }).select('name email isAppTeam');
    res.json(staff.map(u => ({ _id: String(u._id), id: String(u._id), name: u.name, email: u.email, isAppTeam: !!u.isAppTeam })));
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Counselling groups (student + chosen team members), created by full admins ──
const isFullAdmin = async (req) => {
  if (req.user.role !== 'admin') return false;
  const u = await User.findById(req.user.id).select('isAppTeam');
  return !!u && !u.isAppTeam;
};
const notifyRoom = (req, room, exceptId) => {
  const io = req.app.get('io');
  const userSockets = req.app.get('userSockets');
  room.participants.filter(p => p !== exceptId).forEach(pid => {
    const sids = userSockets?.get(String(pid));
    if (io && sids) io.to([...sids]).emit('chat:new-message', { roomId: String(room._id) });
  });
};

// POST /api/chat/groups { studentId, memberIds[], name? }
router.post('/groups', authMiddleware, async (req, res) => {
  try {
    if (!(await isFullAdmin(req))) return res.status(403).json({ message: 'Only admins can create groups' });
    const { studentId, memberIds = [], name } = req.body;
    const student = await User.findOne({ _id: studentId, role: 'student' }).select('name');
    if (!student) return res.status(400).json({ message: 'Pick a student for the group' });
    const me = req.user.id.toString();
    const staff = await User.find({ _id: { $in: memberIds }, role: { $in: ['counselor', 'admin'] } }).select('name');
    if (!staff.length) return res.status(400).json({ message: 'Add at least one team member' });
    const creator = await User.findById(me).select('name');

    const people = [{ id: me, name: creator?.name || 'Admin' }, { id: String(student._id), name: student.name },
      ...staff.map(s => ({ id: String(s._id), name: s.name }))]
      .filter((p, i, arr) => arr.findIndex(q => q.id === p.id) === i);

    const room = await ChatRoom.create({
      type: 'group',
      name: (name || '').trim() || `${student.name} – Counselling`,
      studentId: String(student._id),
      createdBy: me,
      participants: people.map(p => p.id),
      participantNames: people.map(p => p.name),
      messages: [{
        senderId: me, senderName: creator?.name || 'Admin', senderRole: 'Admin Team',
        content: `${creator?.name || 'Admin'} created the group with ${people.filter(p => p.id !== me).map(p => p.name).join(', ')}.`,
        type: 'system',
        timestamp: new Date(), read: false,
      }],
    });
    notifyRoom(req, room, me);
    res.status(201).json(room.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// PUT /api/chat/groups/:id/members { add: [ids], remove: [ids], name? } — full admins.
// Every add/remove/rename gets its own small system-message line in the room, WhatsApp-style,
// so anyone opening the chat later can see what changed and when.
router.put('/groups/:id/members', authMiddleware, async (req, res) => {
  try {
    if (!(await isFullAdmin(req))) return res.status(403).json({ message: 'Only admins can change groups' });
    const room = await ChatRoom.findOne({ _id: req.params.id, type: 'group' });
    if (!room) return res.status(404).json({ message: 'Group not found' });
    const me = req.user.id.toString();
    const actor = await User.findById(me).select('name');
    const actorName = actor?.name || 'Admin';
    const changeNotes = [];

    const add = await User.find({ _id: { $in: req.body.add || [] }, role: { $in: ['counselor', 'admin'] } }).select('name');
    add.forEach(u => {
      if (!room.participants.includes(String(u._id))) {
        room.participants.push(String(u._id)); room.participantNames.push(u.name);
        changeNotes.push(`${actorName} added ${u.name} to the group.`);
      }
    });
    // The student and the creator stay in the group
    const removable = (req.body.remove || []).map(String).filter(id => id !== room.studentId && id !== room.createdBy);
    removable.forEach(id => {
      const i = room.participants.indexOf(id);
      if (i >= 0) {
        const removedName = room.participantNames[i];
        room.participants.splice(i, 1); room.participantNames.splice(i, 1);
        changeNotes.push(`${actorName} removed ${removedName} from the group.`);
      }
    });
    const newName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (newName && newName !== room.name) {
      changeNotes.push(`${actorName} changed the group name to "${newName}".`);
      room.name = newName;
    }

    changeNotes.forEach(content => {
      room.messages.push({
        senderId: me, senderName: actorName, senderRole: 'Admin Team',
        content, type: 'system', timestamp: new Date(), read: false,
      });
    });

    room.markModified('participants'); room.markModified('participantNames');
    await room.save();
    notifyRoom(req, room, me);
    res.json(room.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Who is online right now (has an open connection), plus last-seen times for the rest
router.get('/presence', authMiddleware, (req, res) => {
  const userSockets = req.app.get('userSockets') || new Map();
  const lastSeen = req.app.get('lastSeen') || new Map();
  res.json({ online: [...userSockets.keys()].map(String), lastSeen: Object.fromEntries(lastSeen) });
});

// Get all rooms for current user
router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ participants: req.user.id.toString() });

    // Auto-correct room types for admin/appteam rooms based on isAppTeam flag
    const otherIds = [...new Set(rooms.flatMap(r => r.participants.filter(p => p !== req.user.id.toString())))];
    const adminUsers = await User.find({ _id: { $in: otherIds }, role: 'admin' }).select('_id isAppTeam');
    const adminMap = Object.fromEntries(adminUsers.map(u => [String(u._id), u.isAppTeam || false]));

    const saves = [];
    for (const room of rooms) {
      const otherId = room.participants.find(p => p !== req.user.id.toString());
      if (!otherId || room.type === 'admin-appteam' || room.type === 'group') continue;
      // Only upgrade to appteam-counselor when there is positive evidence — never downgrade a manually-set room
      const nameIndicatesAppTeam = room.participantNames?.includes('Application Team');
      const isAppTeamUser = adminMap[String(otherId)];
      if ((isAppTeamUser || nameIndicatesAppTeam) && room.type !== 'appteam-counselor') {
        room.type = 'appteam-counselor';
        saves.push(room.save());
      }
    }
    if (saves.length > 0) await Promise.all(saves);

    res.json(rooms.map(r => r.toJSON()));
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single room
router.get('/rooms/:roomId', authMiddleware, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    // Auto-correct room type if participant is admin
    const otherId = room.participants.find(p => p !== req.user.id.toString());
    if (otherId && room.type !== 'admin-appteam' && room.type !== 'group') {
      const other = await User.findById(otherId).select('role isAppTeam');
      if (other?.role === 'admin') {
        const expected = other.isAppTeam ? 'appteam-counselor' : 'admin-counselor';
        if (room.type !== expected) { room.type = expected; await room.save(); }
      }
    }

    res.json(room.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Send message
router.post('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
  const { content, senderName, replyToId } = req.body;
  try {
    const target = await ChatRoom.findById(req.params.roomId).select('type participants messages._id messages.senderName messages.content messages.fileName');
    if (!target) return res.status(404).json({ message: 'Room not found' });
    // Only members can post in a group
    if (target.type === 'group' && !target.participants.includes(req.user.id.toString())) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }
    const displayRole = await resolveDisplayRole(req.user.id, req.user.role);
    const message = {
      senderId: req.user.id.toString(),
      senderName,
      senderRole: displayRole,
      content,
      timestamp: new Date(),
      read: false,
    };
    if (replyToId) {
      const quoted = target.messages.id(replyToId);
      if (quoted) message.replyTo = {
        messageId: String(quoted._id), senderName: quoted.senderName || '',
        content: String(quoted.content || quoted.fileName || '').slice(0, 200),
      };
    }
    const room = await ChatRoom.findByIdAndUpdate(
      req.params.roomId,
      { $push: { messages: message } },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });
    const newMsg = room.messages[room.messages.length - 1];

    // Notify other participants in real time
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    room.participants
      .filter(p => p !== req.user.id.toString())
      .forEach(pid => {
        const sid = userSockets.get(String(pid));
        if (sid) io.to(sid).emit('chat:new-message', { roomId: room.id });
      });

    res.json(newMsg.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Attach the caller's in-app recording to a logged call message
const recordingUpload = (req, res, next) => upload.recording.single('recording')(req, res, err =>
  err ? res.status(400).json({ message: err.message }) : next());

router.post('/calls/:messageId/recording', authMiddleware, recordingUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No recording uploaded' });
    const me = req.user.id.toString();
    const room = await ChatRoom.findOne({ participants: me, 'messages._id': req.params.messageId });
    const msg = room?.messages.id(req.params.messageId);
    if (!msg || msg.type !== 'call' || msg.senderId !== me) {
      require('fs').unlink(req.file.path, () => {});
      return res.status(404).json({ message: 'Call not found' });
    }
    msg.recordingUrl = `/uploads/${req.file.filename}`;
    await room.save();
    res.json({ recordingUrl: msg.recordingUrl });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Call history (in-app calls + Tata Smartflo phone calls) with recordings.
// Everyone sees calls they took part in; full admins (not App Team) see all, optionally ?userId=.
// GET /api/chat/calls/history?days=7|30|90&userId=
router.get('/calls/history', authMiddleware, async (req, res) => {
  const smartflo = require('../lib/smartflo');
  try {
    const me = req.user.id.toString();
    const viewer = await User.findById(me).select('role isAppTeam smartfloAgent');
    const fullAdmin = viewer?.role === 'admin' && !viewer.isAppTeam;
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const since = new Date(Date.now() - days * 86400000);
    const filterUser = fullAdmin && req.query.userId ? String(req.query.userId) : '';

    // ── In-app calls ──
    const roomQuery = fullAdmin ? (filterUser ? { participants: filterUser } : { 'messages.type': 'call' }) : { participants: me };
    const rooms = await ChatRoom.find(roomQuery).select('participants participantNames messages').lean();
    const calls = [];
    for (const r of rooms) {
      const nameOf = id => r.participantNames?.[r.participants.indexOf(id)] || 'User';
      for (const m of r.messages || []) {
        if (m.type !== 'call' || new Date(m.timestamp) < since) continue;
        const callee = r.participants.find(p => p !== m.senderId) || '';
        calls.push({
          id: String(m._id), source: 'in_app',
          callerId: m.senderId, callerName: m.senderName || nameOf(m.senderId),
          calleeId: callee, calleeName: nameOf(callee),
          status: m.callStatus === 'answered' ? 'answered' : m.callStatus === 'declined' ? 'declined' : 'missed',
          durationSec: m.callDuration || 0, startedAt: m.timestamp, recordingUrl: m.recordingUrl || '',
        });
      }
    }

    // ── Smartflo phone calls: counselors see their own; full admins see all (or the filtered counselor's) ──
    const sf = { configured: smartflo.isConfigured(), error: '' };
    let agent = viewer?.role === 'counselor' ? viewer.smartfloAgent : '';
    if (fullAdmin && filterUser) agent = (await User.findById(filterUser).select('smartfloAgent'))?.smartfloAgent || '';
    const wantSmartflo = sf.configured && (agent || (fullAdmin && !filterUser));
    if (wantSmartflo) {
      try {
        const records = await smartflo.fetchCallRecords(since, new Date());
        records.filter(r => !agent || smartflo.matchesAgent(r, agent)).forEach(r => {
          const agentLabel = r.agentName || r.agentNumber || 'Agent';
          const client = r.clientNumber || 'Unknown number';
          calls.push({
            id: `sf-${r.id}`, source: 'smartflo', channel: r.channel,
            callerId: '', callerName: r.direction === 'inbound' ? client : agentLabel,
            calleeId: '', calleeName: r.direction === 'inbound' ? agentLabel : client,
            status: r.status, durationSec: r.durationSec, startedAt: r.startedAt, recordingUrl: r.recordingUrl || '',
          });
        });
      } catch (err) {
        sf.error = err.response?.status ? `Smartflo API returned ${err.response.status}` : `Could not reach Smartflo: ${err.message}`;
      }
    }

    calls.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    res.json({ calls: calls.slice(0, 500), smartflo: sf, canSeeAll: fullAdmin });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Toggle an emoji reaction on a message (members only). POST { emoji }
const REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅'];
router.post('/rooms/:roomId/messages/:messageId/reactions', authMiddleware, async (req, res) => {
  const { emoji } = req.body;
  if (!REACTIONS.includes(emoji)) return res.status(400).json({ message: 'Unsupported reaction' });
  try {
    const me = req.user.id.toString();
    const room = await ChatRoom.findOne({ _id: req.params.roomId, participants: me });
    const msg = room?.messages.id(req.params.messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    const i = (msg.reactions || []).findIndex(r => r.userId === me && r.emoji === emoji);
    if (i >= 0) msg.reactions.splice(i, 1);
    else {
      const who = await User.findById(me).select('name');
      msg.reactions.push({ emoji, userId: me, userName: who?.name || '' });
    }
    await room.save();
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    room.participants.filter(p => p !== me).forEach(pid => {
      const sids = userSockets?.get(String(pid));
      if (io && sids) io.to([...sids]).emit('chat:new-message', { roomId: String(room._id) });
    });
    res.json(msg.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Log a call event into the shared room
router.post('/rooms/call-log', authMiddleware, async (req, res) => {
  const { participantIds, callStatus, callDuration, callerName } = req.body;
  try {
    const room = await ChatRoom.findOne({
      participants: { $all: participantIds.map(String), $size: participantIds.length },
    });
    if (!room) return res.status(404).json({ message: 'Room not found' });
    const displayRole = await resolveDisplayRole(req.user.id, req.user.role);
    const message = {
      senderId: req.user.id.toString(),
      senderName: callerName,
      senderRole: displayRole,
      content: '',
      type: 'call',
      callStatus,
      callDuration: callDuration || 0,
      timestamp: new Date(),
      read: false,
    };
    const updated = await ChatRoom.findByIdAndUpdate(
      room._id,
      { $push: { messages: message } },
      { new: true }
    );
    const newMsg = updated.messages[updated.messages.length - 1];

    // Notify other participants in real time
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    updated.participants
      .filter(p => p !== req.user.id.toString())
      .forEach(pid => {
        const sid = userSockets.get(String(pid));
        if (sid) io.to(sid).emit('chat:new-message', { roomId: updated.id });
      });

    res.json(newMsg.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Send file in chat (+ auto-handle offer letters)
router.post('/rooms/:roomId/files', authMiddleware, upload.single('file'), async (req, res) => {
  const { senderName, isOfferLetter } = req.body;
  try {
    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const fileName = req.file?.originalname || 'File';
    const fileSize = req.file?.size || 0;
    const offerFlag = isOfferLetter === 'true';
    const displayRole = await resolveDisplayRole(req.user.id, req.user.role);

    const message = {
      senderId: req.user.id.toString(),
      senderName,
      senderRole: displayRole,
      content: fileName,
      type: 'file',
      fileUrl,
      fileName,
      fileSize,
      isOfferLetter: offerFlag,
      timestamp: new Date(),
      read: false,
    };

    const room = await ChatRoom.findByIdAndUpdate(
      req.params.roomId,
      { $push: { messages: message } },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });
    const newMsg = room.messages[room.messages.length - 1];

    // If offer letter: auto-save to student's documents + update application status
    if (offerFlag && req.user.role === 'counselor') {
      const studentId = room.participants.find(p => p !== req.user.id.toString());
      if (studentId) {
        const doc = {
          name: 'Offer Letter',
          type: 'Offer Letter',
          url: fileUrl,
          uploadedDate: new Date().toISOString().split('T')[0],
          status: 'verified',
        };
        await User.findByIdAndUpdate(studentId, { $push: { documents: doc } });

        const student = await User.findById(studentId);
        const activeApp = student?.applications?.find(a =>
          !['offer_received', 'accepted', 'rejected', 'enrolled'].includes(a.status)
        );
        if (activeApp) {
          await User.updateOne(
            { _id: studentId, 'applications._id': activeApp._id },
            { $set: { 'applications.$.status': 'offer_received', 'applications.$.offerLetterUrl': fileUrl, 'applications.$.updatedDate': new Date().toISOString() } }
          );
        }
      }
    }

    // If student sends a doc, save to their own documents too
    if (!offerFlag && req.user.role === 'student' && fileUrl) {
      const doc = {
        name: fileName,
        type: 'Other',
        url: fileUrl,
        uploadedDate: new Date().toISOString().split('T')[0],
        status: 'pending',
      };
      await User.findByIdAndUpdate(req.user.id, { $push: { documents: doc } });
    }

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    room.participants
      .filter(p => p !== req.user.id.toString())
      .forEach(pid => {
        const sid = userSockets.get(String(pid));
        if (sid) io.to(sid).emit('chat:new-message', { roomId: room.id });
      });

    res.json(newMsg.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Schedule a meeting
router.post('/rooms/:roomId/meetings', authMiddleware, async (req, res) => {
  const { senderName, meetingDate, meetingTime, meetingNotes } = req.body;
  try {
    const displayRole = await resolveDisplayRole(req.user.id, req.user.role);
    const message = {
      senderId: req.user.id.toString(),
      senderName,
      senderRole: displayRole,
      content: `Meeting on ${meetingDate} at ${meetingTime}`,
      type: 'meeting',
      meetingDate,
      meetingTime,
      meetingNotes: meetingNotes || '',
      timestamp: new Date(),
      read: false,
    };

    const room = await ChatRoom.findByIdAndUpdate(
      req.params.roomId,
      { $push: { messages: message } },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });
    const newMsg = room.messages[room.messages.length - 1];
    const otherIdx = room.participants.findIndex(p => p !== req.user.id.toString());
    recordStaffActivity(req, {
      kind: 'meeting', title: 'Meeting scheduled in chat',
      detail: `${meetingDate} at ${meetingTime}${meetingNotes ? ` · ${meetingNotes.slice(0, 100)}` : ''}`,
      studentName: room.participantNames?.[otherIdx] || '',
    });

    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    room.participants
      .filter(p => p !== req.user.id.toString())
      .forEach(pid => {
        const sid = userSockets.get(String(pid));
        if (sid) io.to(sid).emit('chat:new-message', { roomId: room.id });
      });

    res.json(newMsg.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update room type (counselor relabels admin vs appteam rooms)
router.patch('/rooms/:roomId', authMiddleware, async (req, res) => {
  const { type } = req.body;
  try {
    const room = await ChatRoom.findByIdAndUpdate(
      req.params.roomId, { type }, { new: true }
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark all messages from others as read
router.put('/rooms/:roomId/read', authMiddleware, async (req, res) => {
  try {
    await ChatRoom.updateOne(
      { _id: req.params.roomId },
      { $set: { 'messages.$[elem].read': true } },
      { arrayFilters: [{ 'elem.senderId': { $ne: req.user.id.toString() } }] }
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create or get existing room
router.post('/rooms', authMiddleware, async (req, res) => {
  const { participantIds, participantNames, type } = req.body;
  try {
    const existing = await ChatRoom.findOne({ participants: { $all: participantIds, $size: participantIds.length } });
    if (existing) {
      let changed = false;
      if (type && existing.type !== type) { existing.type = type; changed = true; }
      if (participantNames?.length && existing.participantNames?.join() !== participantNames.join()) {
        existing.participantNames = participantNames; changed = true;
      }
      if (changed) await existing.save();
      return res.json(existing.toJSON());
    }
    const room = await ChatRoom.create({ participants: participantIds, participantNames, type: type || 'student-counselor', messages: [] });
    res.json(room.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
