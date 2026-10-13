const cron = require('node-cron');
const ChatRoom = require('../models/ChatRoom');
const User = require('../models/User');
const Notification = require('../models/Notification');

const ESCALATION_HOURS = 4;  // student message left unread this long → escalate to admins
const RENOTIFY_HOURS = 12;   // don't re-escalate the same room more often than this

async function runChatEscalationCheck(io, userSockets) {
  const now = Date.now();
  const rooms = await ChatRoom.find({ type: 'student-counselor', 'messages.0': { $exists: true } })
    .select('participants participantNames studentId messages');

  const admins = await User.find({ role: 'admin', isAppTeam: { $ne: true } }).select('_id').lean();
  if (!admins.length) return;

  for (const room of rooms) {
    const last = room.messages[room.messages.length - 1];
    // Messages store the display role ("Student"); older ones and the demo data use "student"
    if (!last || String(last.senderRole || '').toLowerCase() !== 'student' || last.read) continue;

    const hoursUnread = (now - new Date(last.timestamp).getTime()) / 3600000;
    if (hoursUnread < ESCALATION_HOURS) continue;

    const counselorId = room.participants.find(p => p !== room.studentId);
    const counselor = counselorId ? await User.findById(counselorId).select('name').lean() : null;
    const studentName = last.senderName || 'A student';

    const title = 'Unanswered student message';
    const message = `${studentName} messaged ${counselor?.name || 'their counselor'} ${Math.floor(hoursUnread)}h ago and hasn't received a reply yet.`;
    const link = '/admin/chat';

    for (const admin of admins) {
      const since = new Date(now - RENOTIFY_HOURS * 3600000);
      const existing = await Notification.findOne({
        userId: admin._id, type: 'chat-escalation', title, message, createdAt: { $gte: since },
      });
      if (existing) continue;

      const n = await Notification.create({
        userId: admin._id, type: 'chat-escalation', priority: 'urgent', title, message, link,
      });
      if (io && userSockets) {
        const sids = userSockets.get(String(admin._id));
        if (sids) sids.forEach(sid => io.to(sid).emit('automation:notification', {
          notificationId: String(n._id), priority: 'urgent', title, message, link,
        }));
      }
    }
  }
}

function startChatEscalation(io, userSockets) {
  // Every 30 minutes — fine enough to catch the 4h window without hammering the chat collection
  cron.schedule('*/30 * * * *', () => {
    runChatEscalationCheck(io, userSockets).catch(err =>
      console.error('[chat-escalation] error:', err.message)
    );
  });
  console.log('[chat-escalation] Scheduled — runs every 30 minutes');
}

module.exports = { startChatEscalation, runChatEscalationCheck };
