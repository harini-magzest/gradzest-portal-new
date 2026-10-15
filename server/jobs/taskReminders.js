const cron = require('node-cron');
const Task = require('../models/Task');
const Notification = require('../models/Notification');

async function runOverdueTaskCheck(io, userSockets) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const overdue = await Task.find({
    status: { $ne: 'completed' },
    assignedTo: { $ne: null },
    dueDate: { $ne: '', $lt: todayStr },
  }).select('title dueDate assignedTo assignedToName');

  for (const task of overdue) {
    const title = 'Task overdue';
    const message = `"${task.title}" was due ${task.dueDate} and is still open.`;
    const link = '/activities';

    // Dedup — one overdue nudge per task per day
    const existing = await Notification.findOne({
      userId: task.assignedTo,
      type: 'task-overdue',
      title,
      message,
      createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
    });
    if (existing) continue;

    const n = await Notification.create({
      userId: task.assignedTo, type: 'task-overdue', priority: 'urgent', title, message, link,
    });

    if (io && userSockets) {
      const sids = userSockets.get(String(task.assignedTo));
      if (sids) sids.forEach(sid => io.to(sid).emit('task:overdue', {
        notificationId: String(n._id), title, message, link, taskId: String(task._id),
      }));
    }
  }
}

function startTaskReminders(io, userSockets) {
  // Once a day at 9:30 AM — right after the deadline-reminders check
  cron.schedule('30 9 * * *', () => {
    runOverdueTaskCheck(io, userSockets).catch(err =>
      console.error('[task-reminders] error:', err.message)
    );
  });
  console.log('[task-reminders] Scheduled — runs daily at 09:30');
}

module.exports = { startTaskReminders, runOverdueTaskCheck };
