// A counselor's follow-up queue: leads that have stalled, applications stuck in one status, and tasks past their due
// date. Shared by the dashboard card (routes/dashboards.js) and the morning brief (jobs/counselorDailyBrief.js), so
// both always agree on what counts as "needs attention".
const User = require('../models/User');
const Task = require('../models/Task');
const { daysSinceStageChange } = require('./leadRisk');

const STALE_DAYS = Number(process.env.ZEST_STALE_DAYS) || 5;
const NON_STALE_STATUSES = ['enrolled', 'dropped_plans'];
const STUCK_APP_STATUSES = ['draft', 'submitted', 'under_review'];
const STUCK_APP_DAYS = 10;

function daysBetween(dateLike) {
  return dateLike ? Math.floor((Date.now() - new Date(dateLike).getTime()) / 86400000) : null;
}

async function followupsFor(counselorId) {
  const me = String(counselorId);
  const students = await User.find({ role: 'student', counselorId: me })
    .select('name email leadStageChangedAt createdAt joinedDate status applications').lean();
  const studentById = new Map(students.map((s) => [String(s._id), s]));

  const stale = students
    .filter((s) => !NON_STALE_STATUSES.includes(s.status))
    .map((s) => ({ student: s, days: daysSinceStageChange(s) }))
    .filter((x) => x.days !== null && x.days >= STALE_DAYS)
    .map((x) => ({ studentId: String(x.student._id), name: x.student.name, days: x.days }))
    .sort((a, b) => b.days - a.days);

  const stuck = [];
  for (const s of students) {
    const app = (s.applications || []).find((a) => STUCK_APP_STATUSES.includes(a.status) && daysBetween(a.statusChangedAt || a.submittedDate) >= STUCK_APP_DAYS);
    if (app) stuck.push({ studentId: String(s._id), name: s.name, universityName: app.universityName || '', status: app.status, days: daysBetween(app.statusChangedAt || app.submittedDate) });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const tasks = await Task.find({
    assignedTo: me, status: { $in: ['pending', 'in_progress'] }, dueDate: { $ne: '', $lt: todayStr },
  }).select('title dueDate studentId studentName').lean();
  const overdueTasks = tasks.map((t) => ({
    id: String(t._id), title: t.title, dueDate: t.dueDate,
    studentId: t.studentId ? String(t.studentId) : '',
    studentName: studentById.get(String(t.studentId))?.name || t.studentName || '',
  }));

  return { stale, stuck, overdueTasks, staleDays: STALE_DAYS };
}

module.exports = { followupsFor, STALE_DAYS };
