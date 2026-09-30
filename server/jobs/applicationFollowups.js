const cron = require('node-cron');
const User = require('../models/User');
const Notification = require('../models/Notification');

const STUCK_REVIEW_DAYS = 30;   // "under_review" for this long → nudge the counselor to chase the university
const OFFER_RESPONSE_DAYS = 7;  // "offer_received" for this long → nudge student + counselor to respond
const RENOTIFY_DAYS = 7;        // don't re-nudge the same application more often than this

function daysSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

async function notifyOnce(userId, { type, priority, title, message, link }, io, userSockets) {
  const since = new Date(Date.now() - RENOTIFY_DAYS * 86400000);
  const existing = await Notification.findOne({ userId, type, title, message, createdAt: { $gte: since } });
  if (existing) return;
  const n = await Notification.create({ userId, type, priority, title, message, link });
  if (io && userSockets) {
    const sids = userSockets.get(String(userId));
    if (sids) sids.forEach(sid => io.to(sid).emit('automation:notification', {
      notificationId: String(n._id), priority, title, message, link,
    }));
  }
}

async function runApplicationFollowupCheck(io, userSockets) {
  const students = await User.find({ role: 'student', 'applications.0': { $exists: true } })
    .select('name counselorId applications');

  for (const student of students) {
    for (const app of student.applications) {
      const changed = app.statusChangedAt || app.updatedDate || app.submittedDate;
      if (!changed) continue;
      const days = daysSince(changed);

      if (app.status === 'under_review' && days >= STUCK_REVIEW_DAYS && student.counselorId) {
        await notifyOnce(student.counselorId, {
          type: 'application-stuck', priority: 'normal',
          title: 'Application stuck in review',
          message: `${student.name}'s application to ${app.universityName} (${app.courseName}) has been "Under Review" for ${days} days — consider following up with the university.`,
          link: '/counselor/applications',
        }, io, userSockets);
      }

      if (app.status === 'offer_received' && days >= OFFER_RESPONSE_DAYS) {
        await notifyOnce(student._id, {
          type: 'offer-response-due', priority: 'urgent',
          title: 'Respond to your offer',
          message: `You received an offer from ${app.universityName} for ${app.courseName} ${days} days ago. Let your counselor know if you're accepting.`,
          link: '/student/applications',
        }, io, userSockets);
        if (student.counselorId) {
          await notifyOnce(student.counselorId, {
            type: 'offer-response-due', priority: 'normal',
            title: 'Student has not responded to offer',
            message: `${student.name} received an offer from ${app.universityName} ${days} days ago and hasn't responded yet.`,
            link: '/counselor/applications',
          }, io, userSockets);
        }
      }
    }
  }
}

function startApplicationFollowups(io, userSockets) {
  // Once a day at 9:45 AM — after deadline reminders (9:00) and task reminders (9:30)
  cron.schedule('45 9 * * *', () => {
    runApplicationFollowupCheck(io, userSockets).catch(err =>
      console.error('[application-followups] error:', err.message)
    );
  });
  console.log('[application-followups] Scheduled — runs daily at 09:45');
}

module.exports = { startApplicationFollowups, runApplicationFollowupCheck };
