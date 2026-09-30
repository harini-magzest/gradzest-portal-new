const StaffActivity = require('../models/StaffActivity');
const User = require('../models/User');

/**
 * Record an action taken by a staff member (anyone but a student).
 * Fire-and-forget: never throws, so a logging failure can't break the calling route.
 *
 * @param {object} req  Express request (uses req.user)
 * @param {object} e    { kind, title, detail?, studentId?, studentName? }
 */
async function recordStaffActivity(req, e) {
  try {
    if (!req.user || req.user.role === 'student') return;
    const actor = await User.findById(req.user.id).select('name role isAppTeam');
    if (!actor) return;
    await StaffActivity.create({
      actorId: actor._id,
      actorName: actor.name || '',
      actorRole: actor.role === 'admin' && actor.isAppTeam ? 'appteam' : actor.role,
      kind: e.kind,
      title: e.title,
      detail: e.detail || '',
      studentId: e.studentId || null,
      studentName: e.studentName || '',
    });
  } catch (err) {
    console.error('[staffActivity] Failed:', err.message);
  }
}

module.exports = { recordStaffActivity };
