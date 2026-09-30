const cron = require('node-cron');
const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Ordered so the 24h window is always evaluated (and recorded) before the 1h window
const REMINDER_WINDOWS = [
  { key: '24h', hoursBefore: 24, label: 'tomorrow', priority: 'normal' },
  { key: '1h', hoursBefore: 1, label: 'in 1 hour', priority: 'urgent' },
];

function meetingDateTime(meeting) {
  const d = new Date(`${meeting.scheduledDate}T${meeting.scheduledTime}:00`);
  return isNaN(d.getTime()) ? null : d;
}

async function runMeetingReminderCheck(io, userSockets, mailer) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const meetings = await Meeting.find({ status: 'scheduled', scheduledDate: { $gte: todayStr } });

  for (const meeting of meetings) {
    const when = meetingDateTime(meeting);
    if (!when || when <= now) continue;
    const hoursUntil = (when.getTime() - now.getTime()) / 3600000;

    for (const w of REMINDER_WINDOWS) {
      if (hoursUntil > w.hoursBefore) continue;
      if ((meeting.remindersSent || []).includes(w.key)) continue;

      const title = `Meeting ${w.label}: ${meeting.title}`;
      const message = `"${meeting.title}" is scheduled for ${meeting.scheduledDate} at ${meeting.scheduledTime}.`;
      const link = meeting.meetingLink || '';

      for (const p of meeting.participants) {
        if (!p.userId) continue;
        const n = await Notification.create({
          userId: p.userId, type: 'meeting', priority: w.priority, title, message, link,
        });
        if (io && userSockets) {
          const sids = userSockets.get(String(p.userId));
          if (sids) sids.forEach(sid => io.to(sid).emit('meeting:reminder', {
            notificationId: String(n._id), title, message, link, meetingId: String(meeting._id),
          }));
        }
      }

      if (mailer) {
        const emailParticipants = meeting.participants.filter(p => p.email || p.userId);
        const users = await User.find({
          _id: { $in: emailParticipants.filter(p => !p.email).map(p => p.userId) },
        }).select('email').lean();
        const emailById = new Map(users.map(u => [String(u._id), u.email]));
        for (const p of emailParticipants) {
          const to = p.email || emailById.get(String(p.userId));
          if (!to) continue;
          mailer.sendMail({
            from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to, subject: title,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
                <div style="background:#3b0764;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
                  <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
                </div>
                <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                  <p style="font-size:16px;">Hi ${p.name || 'there'},</p>
                  <div style="margin:20px 0;padding:16px 20px;background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:4px;">
                    <p style="margin:0 0 6px;font-size:16px;font-weight:bold;">${title}</p>
                    <p style="margin:0;font-size:14px;color:#4b5563;">${message}</p>
                  </div>
                  ${link ? `<p style="text-align:center;margin:24px 0;"><a href="${link}" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">Join Meeting</a></p>` : ''}
                </div>
              </div>`,
          }).catch(() => {});
        }
      }

      meeting.remindersSent = [...(meeting.remindersSent || []), w.key];
      await meeting.save();
    }
  }
}

function startMeetingReminders(io, userSockets, mailer) {
  // Every 10 minutes — fine enough to catch both the 24h and 1h windows without spamming
  cron.schedule('*/10 * * * *', () => {
    runMeetingReminderCheck(io, userSockets, mailer).catch(err =>
      console.error('[meeting-reminders] error:', err.message)
    );
  });
  console.log('[meeting-reminders] Scheduled — runs every 10 minutes');
}

module.exports = { startMeetingReminders, runMeetingReminderCheck };
