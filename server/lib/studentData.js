// A student's right to see and to erase their personal data.
//
//  exportStudentData: everything the portal holds about the student, as plain JSON they can download.
//  eraseStudent:      removes or anonymises it. Staff-side business records (applications by university and status, task and
//                     activity-log entries) stay but no longer say who the student was, and security/audit logs
//                     (SecurityEvent, RequestLog, PiiAccessLog), which exist to investigate abuse, are kept as they are.
const User = require('../models/User');
const Notification = require('../models/Notification');
const ZestQueryLog = require('../models/ZestQueryLog');
const EmailLog = require('../models/EmailLog');
const ActivityLog = require('../models/ActivityLog');
const UiActivity = require('../models/UiActivity');
const LeadAlert = require('../models/LeadAlert');
const UploadRecord = require('../models/UploadRecord');
const StaffActivity = require('../models/StaffActivity');
const Task = require('../models/Task');
const Meeting = require('../models/Meeting');
const Event = require('../models/Event');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const Referral = require('../models/Referral');
const ParentLink = require('../models/ParentLink');
const crypto = require('crypto');
const { deleteStoredFile } = require('./storedFile');

const REMOVED_NAME = 'Deleted student';

// Secrets and credentials are never part of an export, wherever they sit in the record.
const SECRET_KEY = /token|hash|password|secret/i;
function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === 'object' && !(value instanceof Date) && !value._bsontype) {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_KEY.test(k)).map(([k, v]) => [k, stripSecrets(v)]));
  }
  return value;
}

async function exportStudentData(userId) {
  const id = String(userId);
  // Staff's private notes about the student and active login sessions are not part of the export
  const user = await User.findById(id).select('-password -sessions -counselorNotes').lean();
  if (!user) return null;

  const [notifications, zest, emails, rooms, meetings, events, referralsMade, referredBy, parentLinks] = await Promise.all([
    Notification.find({ userId: id }).sort({ createdAt: -1 }).limit(1000).select('type title message createdAt').lean(),
    ZestQueryLog.find({ userId: id }).sort({ createdAt: -1 }).limit(1000).select('question answer feedback createdAt').lean(),
    EmailLog.find({ studentId: id }).sort({ createdAt: -1 }).limit(1000).select('subject status createdAt').lean(),
    ChatRoom.find({ participants: id }).select('type name participantNames').lean(),
    Meeting.find({ 'participants.userId': id }).select('title scheduledDate scheduledTime duration status notes').lean(),
    Event.find({ 'registrations.userId': id }).select('title startsAt registrations').lean(),
    Referral.countDocuments({ referrerId: id }),
    Referral.findOne({ referredId: id }).select('createdAt').lean(),
    ParentLink.find({ studentId: id }).select('label createdAt expiresAt revokedAt lastViewedAt viewCount').lean(),
  ]);

  // Only the messages you wrote
  const mine = await ChatMessage.find({ roomId: { $in: rooms.map((r) => r._id) }, senderId: id }).sort({ timestamp: 1, _id: 1 }).lean();

  return stripSecrets({
    exportedAt: new Date().toISOString(),
    note: 'This is the personal data Gradzest holds about you. Internal staff notes and login security data are not included.',
    profile: user,
    notifications,
    zestConversations: zest,
    emailsSentToYou: emails,
    chatMessages: rooms.flatMap((r) => mine.filter((m) => String(m.roomId) === String(r._id)).map((m) => ({ room: r.name || r.type, at: m.timestamp, type: m.type || 'text', content: m.content || '', fileName: m.fileName }))),
    meetings,
    events: events.map((e) => ({ title: e.title, startsAt: e.startsAt, registeredAt: (e.registrations || []).find((r) => String(r.userId) === id)?.registeredAt })),
    referrals: { made: referralsMade, referredByAFriend: !!referredBy },
    parentLinks,
  });
}

// Application fields kept after erasure: which university and course, and how far it got, for statistics.
const KEEP_APPLICATION = ['_id', 'studentId', 'universityId', 'universityName', 'courseId', 'courseName', 'status', 'submittedDate', 'updatedDate', 'statusChangedAt', 'intake'];

async function eraseStudent(userId) {
  const id = String(userId);
  const user = await User.findById(id).lean();
  if (!user || user.role !== 'student') return { erased: false, reason: 'not_a_student' };

  // Files first: once the record is gone we no longer know where they are
  for (const d of user.documents || []) deleteStoredFile(d.url);
  for (const a of user.applications || []) deleteStoredFile(a.offerLetterUrl);

  await Promise.all([
    Notification.deleteMany({ userId: id }),
    ZestQueryLog.deleteMany({ userId: id }),
    EmailLog.deleteMany({ studentId: id }),
    ActivityLog.deleteMany({ studentId: id }),
    UiActivity.deleteMany({ userId: id }),
    LeadAlert.deleteMany({ userId: id }),
    ParentLink.deleteMany({ studentId: id }),
    Referral.deleteMany({ $or: [{ referrerId: id }, { referredId: id }] }),
    UploadRecord.updateMany({ userId: id }, { $set: { email: '', name: '' } }),
    StaffActivity.updateMany({ studentId: id }, { $set: { studentName: REMOVED_NAME } }),
    Task.updateMany({ studentId: id }, { $set: { studentName: REMOVED_NAME } }),
    Event.updateMany({ 'registrations.userId': id }, { $pull: { registrations: { userId: id } } }),
    Meeting.updateMany({ 'participants.userId': id }, { $set: { 'participants.$[p].name': REMOVED_NAME, 'participants.$[p].email': '' } }, { arrayFilters: [{ 'p.userId': id }] }),
  ]);

  // Chats: the student's own messages are blanked, and their name removed everywhere in the room
  const rooms = await ChatRoom.find({ participants: id });
  for (const room of rooms) {
    room.participantNames = room.participants.map((p, i) => (p === id ? REMOVED_NAME : room.participantNames[i]));
    await room.save();
  }
  await ChatMessage.updateMany(
    { roomId: { $in: rooms.map((r) => r._id) }, senderId: id },
    { $set: { senderName: REMOVED_NAME, content: '[deleted]' }, $unset: { fileUrl: '', fileName: '', recordingUrl: '' } },
  );

  // The account itself: keep only what is needed for counts and for staff records to still make sense
  const applications = (user.applications || []).map((a) => Object.fromEntries(KEEP_APPLICATION.filter((k) => a[k] !== undefined).map((k) => [k, a[k]])));
  // Everything else on the account is removed. The fields set below are replaced rather than removed (MongoDB will not
  // unset and set the same path in one update).
  const keep = new Set(['_id', 'role', 'createdAt', 'updatedAt', '__v', 'source', 'leadStage', 'leadStageChangedAt', 'counselorId', 'joinedDate',
    'name', 'email', 'password', 'active', 'status', 'applications', 'deletedAt']);
  const unset = Object.fromEntries(Object.keys(User.schema.paths).map((p) => p.split('.')[0]).filter((p) => !keep.has(p)).map((p) => [p, '']));

  await User.collection.updateOne(
    { _id: user._id },
    {
      $unset: unset,
      $set: {
        name: REMOVED_NAME,
        email: `deleted-${id}@deleted.invalid`,
        // Random and never disclosed: nobody can sign in to this account again
        password: crypto.randomBytes(32).toString('hex'),
        active: false,
        status: 'inactive',
        applications,
        deletedAt: new Date(),
      },
    },
  );

  if (user.counselorId) await User.findByIdAndUpdate(user.counselorId, { $pull: { assignedStudents: id } });
  require('./accountState').invalidate?.(id);
  return { erased: true };
}

module.exports = { exportStudentData, eraseStudent, REMOVED_NAME };
