// Shared date math for "is this lead going stale" checks — used by the automation engine
// (lib/automation.js), the weekly digest (jobs/weeklyDigest.js) and the Zest daily analytics
// job (jobs/zestDailyAnalytics.js) so the three don't drift into slightly different formulas.

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

// A lead's "days since stage change" — falls back to signup date if the stage has never moved.
function daysSinceStageChange(student) {
  const changed = student.leadStageChangedAt || student.createdAt || student.joinedDate;
  return daysSince(changed);
}

module.exports = { daysSince, daysSinceStageChange };
