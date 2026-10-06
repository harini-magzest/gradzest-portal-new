const cron = require('node-cron');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { followupsFor } = require('../lib/counselorFollowups');
const { buildBrief } = require('../lib/counselorBrief');

const LINK = '/counselor';

// Sends each counselor one in-app notification with what needs chasing today. Skips counselors with nothing to chase,
// and never sends a second brief on the same day (so a restart at 09:20 doesn't repeat it).
async function runCounselorBrief(io, userSockets, now = new Date()) {
  const counselors = await User.find({ role: 'counselor' }).select('_id').lean();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let sent = 0;

  for (const c of counselors) {
    const brief = buildBrief(await followupsFor(c._id));
    if (!brief) continue;
    if (await Notification.findOne({ userId: c._id, type: 'daily_brief', createdAt: { $gte: startOfDay } })) continue;

    await Notification.create({
      userId: c._id, type: 'daily_brief', priority: brief.urgent ? 'urgent' : 'normal',
      title: brief.title, message: brief.message, link: LINK,
    });
    const sids = userSockets?.get(String(c._id));
    if (io && sids) sids.forEach((sid) => io.to(sid).emit('brief:daily', { title: brief.title, message: brief.message, link: LINK }));
    sent++;
  }
  return sent;
}

function startCounselorDailyBrief(io, userSockets) {
  // Every day at 9:15, after the 9:00 student reminders
  cron.schedule('15 9 * * *', () => {
    runCounselorBrief(io, userSockets).catch((err) => console.error('[counselor-brief] error:', err.message));
  });
  console.log('[counselor-brief] Scheduled — runs daily at 09:15');
}

module.exports = { startCounselorDailyBrief, runCounselorBrief };
