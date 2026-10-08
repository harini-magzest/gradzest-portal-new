const User = require('../models/User');
const Notification = require('../models/Notification');
const { assignNextCounselor } = require('./assignCounselor');
const notifyAdminsOfNewLead = require('./notifyAdminsOfNewLead');
const { fireEvent } = require('./automation');

// Shared by the public lead capture points that have no account behind them: marketing forms (routes/forms.js,
// source 'web_form') and the Zest chat "Talk to a counselor" form (routes/zest.js, source 'zest_chat').

/** An existing account with this email, or a student with the same mobile (last 10 digits, formatting ignored). */
async function findExisting(email, phone) {
  if (email) {
    const byEmail = await User.findOne({ email }).select('name role counselorId').lean();
    if (byEmail) return byEmail;
  }
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  if (digits.length < 7) return null;
  const pattern = new RegExp(`${digits.split('').join('\\D*')}\\D*$`);
  return User.findOne({ role: 'student', phone: pattern }).select('name role counselorId').lean();
}

// Someone already on file asked for a person: tell their counselor (or the Admin Team if they have none) instead
// of creating a second record. Never throws.
async function notifyCallbackRequest(app, existing, phone) {
  try {
    const recipients = existing.counselorId
      ? [existing.counselorId]
      : (await User.find({ role: 'admin', isAppTeam: { $ne: true } }).select('_id').lean()).map(a => a._id);
    if (!recipients.length) return;
    const title = `📞 Callback request: ${existing.name}`;
    const message = `${existing.name}${phone ? ` (${phone})` : ''} asked Zest to talk to a counselor. They are already in Students — please call them.`;
    const link = existing.counselorId ? '/counselor/students' : '/admin/students';
    const saved = await Notification.insertMany(recipients.map(userId => ({ userId, type: 'lead', priority: 'urgent', title, message, link })));
    const io = app.get('io');
    const userSockets = app.get('userSockets');
    if (io && userSockets) {
      for (const n of saved) {
        (userSockets.get(String(n.userId)) || []).forEach(sid => io.to(sid).emit('admin:new_lead', {
          notificationId: String(n._id), priority: 'urgent', title, message, link,
        }));
      }
    }
  } catch (err) {
    console.error('[createWebLead] callback notification failed:', err.message);
  }
}

/**
 * Creates one student lead (no login) the same way a self sign-up is handled: round-robin counselor, admin
 * "New Lead" alert, student.created automation. Someone already on file (same email, or same mobile) is never
 * saved twice; `wantsHuman` on a repeat still reaches a person through notifyCallbackRequest.
 * Staff accounts are never touched or attached to.
 *
 * @returns {Promise<{ created: boolean, studentId?: string }>}
 */
async function createWebLead(app, lead) {
  const { firstName, lastName = '', phone, email = '', source, wantsHuman = false, ...profile } = lead;
  const existing = await findExisting(email, phone);
  if (existing) {
    if (existing.role === 'student' && wantsHuman) {
      await User.updateOne({ _id: existing._id }, { $set: { callbackRequestedAt: new Date() } });
      notifyCallbackRequest(app, existing, phone);
    }
    return { created: false };
  }

  const student = new User({
    role: 'student', name: [firstName, lastName].filter(Boolean).join(' '), firstName, lastName: lastName || undefined,
    phone, email: email || undefined, emailVerified: false,
    source, leadStatus: 'new', leadStage: 'new_enquiry',
    joinedDate: new Date().toISOString().split('T')[0],
    ...(wantsHuman ? { callbackRequestedAt: new Date() } : {}),
    ...profile,
  });
  await student.save();
  const counselor = await assignNextCounselor(student);
  if (counselor) await student.save();
  notifyAdminsOfNewLead(app, student, counselor, { urgent: wantsHuman }); // fire-and-forget, like sign-up
  fireEvent('student.created', { studentId: student._id });
  if (counselor) fireEvent('counselor.assigned', { studentId: student._id });
  return { created: true, studentId: String(student._id) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v, max = 200) => (v == null ? '' : String(v).trim().slice(0, max));
const list = v => (Array.isArray(v) ? v : String(v || '').split(','))
  .map(s => text(s, 100)).filter(Boolean).slice(0, 10);

/** First/last name, mobile and (optional) email from a public request body, or the message to show if invalid. */
function readContact(body, { withEmail = true } = {}) {
  const firstName = text(body.firstName, 100);
  const lastName = text(body.lastName, 100);
  const phone = text(body.phone, 30);
  const email = withEmail ? text(body.email, 200).toLowerCase() : '';
  if (!firstName) return { error: 'Please enter your first name' };
  if (phone.replace(/\D/g, '').length < 7) return { error: 'Please enter a valid mobile number' };
  if (email && !EMAIL_RE.test(email)) return { error: 'Please enter a valid email address' };
  return { firstName, lastName, phone, email };
}

module.exports = { createWebLead, findExisting, readContact, text, list };
