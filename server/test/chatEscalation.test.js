// jobs/chatEscalation.js tells full admins about a student's chat message left unread for 4 hours. Messages store
// the sender's display role ("Student"), which the job used to compare with "student", so it never fired.
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const Notification = require('../models/Notification');
const { runChatEscalationCheck } = require('../jobs/chatEscalation');

const HASH = bcrypt.hashSync('TestPass123!', 4);
let n = 0;
const mk = (fields) => User.create({ name: `Esc ${n}`, email: `esc-${Date.now()}-${n++}@example.com`, password: HASH, emailVerified: true, active: true, ...fields });
const hoursAgo = (h) => new Date(Date.now() - h * 3600000);

let admin;
beforeAll(async () => { admin = await mk({ role: 'admin', name: 'Escalation Admin' }); });

async function roomWith(last) {
  const counselor = await mk({ role: 'counselor', name: `Counselor ${n}` });
  const student = await mk({ role: 'student', name: `Waiting Student ${n}` });
  await ChatRoom.create({
    type: 'student-counselor', studentId: String(student._id),
    participants: [String(student._id), String(counselor._id)], participantNames: [student.name, counselor.name],
    messages: [{ senderId: String(student._id), senderName: student.name, content: 'Any news?', ...last }],
  });
  return student;
}
const alertsFor = (student) => Notification.countDocuments({ userId: admin._id, type: 'chat-escalation', message: new RegExp(`^${student.name} messaged`) });

describe('chat escalation', () => {
  it.each(['Student', 'student'])('tells admins about an unread message from a student (senderRole %s), once', async (senderRole) => {
    const student = await roomWith({ senderRole, timestamp: hoursAgo(5), read: false });
    await runChatEscalationCheck(null, null);
    expect(await alertsFor(student)).toBe(1);
    await runChatEscalationCheck(null, null); // not again within 12 hours
    expect(await alertsFor(student)).toBe(1);
  });

  it('leaves alone messages that were read, are recent, or came from staff', async () => {
    const read = await roomWith({ senderRole: 'Student', timestamp: hoursAgo(5), read: true });
    const recent = await roomWith({ senderRole: 'Student', timestamp: hoursAgo(1), read: false });
    const staff = await roomWith({ senderRole: 'Counselor', timestamp: hoursAgo(5), read: false });
    await runChatEscalationCheck(null, null);
    for (const s of [read, recent, staff]) expect(await alertsFor(s)).toBe(0);
  });
});
