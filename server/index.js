const { app, io, httpServer, userSockets, mailer } = require('./app');
const { connectDB } = require('./db');
const { jobsEnabled } = require('./lib/runJobs');

async function autoSeedIfEmpty() {
  const User = require('./models/User');
  const University = require('./models/University');
  const Country = require('./models/Country');
  const { universityData, countryData } = require('./seed');

  // Insert new universities/countries from seed data without overwriting existing (admin-enriched) records
  for (const u of universityData) {
    await University.updateOne({ id: u.id }, { $setOnInsert: u }, { upsert: true });
  }
  for (const c of countryData) {
    await Country.updateOne({ id: c.id }, { $setOnInsert: c }, { upsert: true });
  }

  const count = await User.countDocuments();
  if (count === 0) {
    // The full seed creates demo accounts (admin@eduabroad.com …) that share one password printed to the console.
    // Only an explicit development or test run may do that; a fresh production database must never start with a
    // publicly known admin login. Create the first real admin with: node scripts/createAdmin.js
    if (!['development', 'test'].includes(process.env.NODE_ENV)) {
      console.warn('[seed] No users yet. Demo accounts are not created outside development; run `node scripts/createAdmin.js` to create the first admin.');
      return;
    }
    console.log('Database is empty — running full seed (development only)...');
    await require('./seed').run();
    console.log('Auto-seed complete.');
  }
}

const { startDeadlineReminders } = require('./jobs/deadlineReminders');
const { startDocumentReminders } = require('./jobs/documentReminders');
const { startSecurityDigest } = require('./jobs/securityDigest');
const { initAutomation, seedStarterTemplates } = require('./lib/automation');
const { startAutomationScheduler } = require('./jobs/automationScheduler');
const { startMeetingReminders } = require('./jobs/meetingReminders');
const { startEventReminders } = require('./jobs/eventReminders');
const { startCounselorDailyBrief } = require('./jobs/counselorDailyBrief');
const { startTaskReminders } = require('./jobs/taskReminders');
const { startApplicationFollowups } = require('./jobs/applicationFollowups');
const { startChatEscalation } = require('./jobs/chatEscalation');
const { startWeeklyDigest } = require('./jobs/weeklyDigest');
const { startZestDailyAnalytics } = require('./jobs/zestDailyAnalytics');

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`));

connectDB().then(async () => {
  await require('./lib/migrateEmailIndex').migrateEmailIndex();
  await autoSeedIfEmpty();
  await require('./lib/access').seedProfiles();
  // Needed by the request handlers on every instance, so they stay outside the RUN_JOBS switch below.
  initAutomation({ io, userSockets, mailer });
  await seedStarterTemplates();
  if (!jobsEnabled()) {
    console.log('[jobs] RUN_JOBS is off: scheduled jobs are not started on this instance');
    return;
  }
  startDeadlineReminders(io, userSockets, mailer);
  startDocumentReminders(io, userSockets, mailer);
  startSecurityDigest(mailer);
  require('./jobs/incidentEscalation').startIncidentEscalation();
  startAutomationScheduler();
  startMeetingReminders(io, userSockets, mailer);
  startEventReminders(io, userSockets, mailer);
  startCounselorDailyBrief(io, userSockets);
  startTaskReminders(io, userSockets);
  startApplicationFollowups(io, userSockets);
  startChatEscalation(io, userSockets);
  startWeeklyDigest(mailer);
  startZestDailyAnalytics(mailer);
}).catch((err) => {
  console.error('[Startup] Fatal DB error:', err.message);
  process.exit(1);
});
