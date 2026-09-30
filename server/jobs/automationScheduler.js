const cron = require('node-cron');
const User = require('../models/User');
const AutomationRule = require('../models/AutomationRule');
const AutomationLog = require('../models/AutomationLog');
const { buildContext, matches, executeRule } = require('../lib/automation');

const TZ = 'Asia/Kolkata';

function currentHour() {
  return Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24;
}

// Runs "Every day" rules whose scheduleHour is now. A rule acts on a given student at most
// once per 20 hours, so a restart within the hour does not send duplicates.
async function runScheduledRules() {
  const hour = currentHour();
  const rules = await AutomationRule.find({ trigger: 'schedule.daily', active: true, scheduleHour: hour }).lean();
  if (!rules.length) return;

  const students = await User.find({ role: 'student' }).select('-password').lean();
  const since = new Date(Date.now() - 20 * 3600000);

  for (const rule of rules) {
    const recent = await AutomationLog.find({ ruleId: rule._id, createdAt: { $gte: since } }).distinct('studentId');
    const done = new Set(recent.map(String));
    for (const student of students) {
      if (done.has(String(student._id))) continue;
      try {
        const ctx = await buildContext(student);
        if (ctx && matches(rule, ctx)) await executeRule(rule, ctx);
      } catch (err) {
        console.error(`[automation] scheduled rule "${rule.name}" failed for ${student._id}:`, err.message);
      }
    }
  }
}

function startAutomationScheduler() {
  cron.schedule('0 * * * *', () => {
    runScheduledRules().catch(err => console.error('[automation] scheduler error:', err.message));
  }, { timezone: TZ });
}

module.exports = { startAutomationScheduler, runScheduledRules };
