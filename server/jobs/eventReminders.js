const cron = require('node-cron');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { wantsEmail, sendExtraChannels } = require('../lib/notificationChannels');

// Evaluated in order, so a 24h reminder is recorded before the 1h one
const WINDOWS = [
  { key: '24h', hoursBefore: 24, label: 'tomorrow', priority: 'normal' },
  { key: '1h', hoursBefore: 1, label: 'in 1 hour', priority: 'urgent' },
];

async function runEventReminderCheck(io, userSockets, mailer, now = new Date()) {
  const events = await Event.find({ status: 'scheduled', startsAt: { $gt: now }, 'registrations.0': { $exists: true } });

  for (const event of events) {
    const hoursUntil = (event.startsAt.getTime() - now.getTime()) / 3600000;
    for (const w of WINDOWS) {
      if (hoursUntil > w.hoursBefore || event.remindersSent.includes(w.key)) continue;

      const title = `Event ${w.label}: ${event.title}`;
      const message = `"${event.title}" starts ${event.startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST.`;
      const people = await User.find({ _id: { $in: event.registrations.map((r) => r.userId) } }).select('name email phone notificationPrefs').lean();

      for (const p of people) {
        const n = await Notification.create({ userId: p._id, type: 'event', priority: w.priority, title, message, link: '/student/activities?tab=events' });
        const sids = userSockets?.get(String(p._id));
        if (io && sids) sids.forEach((sid) => io.to(sid).emit('event:reminder', { notificationId: String(n._id), priority: w.priority, title, message, link: n.link, eventId: String(event._id) }));
        sendExtraChannels(p, `${title}. ${message}${event.link ? ` Join: ${event.link}` : ''}`);
        if (mailer && p.email && wantsEmail(p)) {
          mailer.sendMail({
            from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: p.email, subject: title,
            text: `Hi ${p.name || 'there'},\n\n${message}\n${event.link ? `\nJoin: ${event.link}\n` : ''}\nSee you there!\nGradzest`,
          }).catch(() => {});
        }
      }

      // Recorded after sending: a crash mid-way repeats a reminder on the next run rather than silently skipping it
      event.remindersSent = [...event.remindersSent, w.key];
      await event.save();
    }
  }
}

function startEventReminders(io, userSockets, mailer) {
  cron.schedule('*/15 * * * *', () => {
    runEventReminderCheck(io, userSockets, mailer).catch((err) => console.error('[event-reminders] error:', err.message));
  });
  console.log('[event-reminders] Scheduled — runs every 15 minutes');
}

module.exports = { startEventReminders, runEventReminderCheck };
