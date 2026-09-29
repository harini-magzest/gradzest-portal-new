const cron = require('node-cron');
const User = require('../models/User');
const Notification = require('../models/Notification');

const REMIND_DAYS = [30, 7, 1];

function parseIntakeDate(intake) {
  if (!intake) return null;
  // Handles "September 2025", "Sep 2025", "2025-09-01", "2025-09"
  const d = new Date(intake);
  if (!isNaN(d.getTime())) return d;
  // "Month YYYY" e.g. "September 2025"
  const match = intake.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const parsed = new Date(`${match[1]} 1, ${match[2]}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

async function runDeadlineCheck(io, userSockets, mailer) {
  const now = new Date();
  const students = await User.find({ role: 'student', 'applications.0': { $exists: true } })
    .select('name email applications onboarding');

  for (const student of students) {
    for (const app of student.applications) {
      if (!app.intake) continue;
      if (['rejected', 'enrolled', 'accepted'].includes(app.status)) continue;

      const intakeDate = parseIntakeDate(app.intake);
      if (!intakeDate) continue;

      const daysUntil = Math.ceil((intakeDate - now) / (1000 * 60 * 60 * 24));

      if (!REMIND_DAYS.includes(daysUntil)) continue;

      const title = daysUntil === 1
        ? `Intake deadline tomorrow!`
        : `Intake in ${daysUntil} days`;
      const message = `Your ${app.intake} intake for ${app.courseName} at ${app.universityName} is ${daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`}.`;
      const link = `/student/applications?app=${app._id}`;

      // Dedup — skip if we already sent this exact reminder today
      const existing = await Notification.findOne({
        userId: student._id,
        link,
        title,
        createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
      });
      if (existing) continue;

      // Save to DB
      await Notification.create({
        userId: student._id,
        type: 'deadline',
        priority: daysUntil <= 7 ? 'urgent' : 'normal',
        title,
        message,
        link,
      });

      // Real-time socket
      if (io && userSockets) {
        const sids = userSockets.get(String(student._id));
        if (sids) sids.forEach(sid => io.to(sid).emit('deadline:reminder', { title, message, link, daysUntil }));
      }

      // Email
      if (mailer && student.email) {
        mailer.sendMail({
          from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: student.email,
          subject: `${title} — ${app.universityName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
              <div style="background:#0d1b4b;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
              </div>
              <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                <p style="font-size:16px;">Hi ${student.name},</p>
                <div style="margin:20px 0;padding:16px 20px;background:${daysUntil <= 7 ? '#fef2f2' : '#fff7ed'};border-left:4px solid ${daysUntil <= 7 ? '#dc2626' : '#ea580c'};border-radius:4px;">
                  <p style="margin:0;font-size:16px;font-weight:bold;color:${daysUntil <= 7 ? '#b91c1c' : '#c2410c'};">${title}</p>
                  <p style="margin:6px 0 0;font-size:14px;">${message}</p>
                </div>
                <p style="font-size:14px;color:#6b7280;">Log in to your Gradzest portal to review your application status.</p>
              </div>
            </div>`,
        }).catch(() => {});
      }
    }
  }
}

function startDeadlineReminders(io, userSockets, mailer) {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', () => {
    runDeadlineCheck(io, userSockets, mailer).catch(err =>
      console.error('[deadline-reminders] error:', err.message)
    );
  });
  console.log('[deadline-reminders] Scheduled — runs daily at 09:00');
}

module.exports = { startDeadlineReminders, runDeadlineCheck };
