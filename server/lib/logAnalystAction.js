const AnalystAction = require('../models/AnalystAction');

/**
 * Log an admin/analyst action taken from the SOC dashboard. Fire-and-forget —
 * never throws, never blocks the caller (the underlying action has already
 * succeeded by the time this is called).
 */
async function logAnalystAction({ analyst, action, targetType, targetId, reason = '', metadata = {}, io = null }) {
  try {
    const entry = await AnalystAction.create({
      analystId: analyst.id || analyst._id,
      analystEmail: analyst.email || '',
      action,
      targetType,
      targetId: String(targetId),
      reason,
      metadata,
    });

    if (io) io.to('admin-room').emit('analyst_action', entry.toObject());

    return entry;
  } catch (err) {
    console.error('[logAnalystAction] Failed:', err.message);
    return null;
  }
}

module.exports = { logAnalystAction };
