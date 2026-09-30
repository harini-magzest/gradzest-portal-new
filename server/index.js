const { app, io, httpServer, userSockets, mailer } = require('./app');
const { connectDB } = require('./db');

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
    console.log('Database is empty — running full seed...');
    await require('./seed').run();
    console.log('Auto-seed complete.');
  }
}

const { startDeadlineReminders } = require('./jobs/deadlineReminders');
const { startSecurityDigest } = require('./jobs/securityDigest');
const { initAutomation, seedStarterTemplates } = require('./lib/automation');
const { startAutomationScheduler } = require('./jobs/automationScheduler');
const { startMeetingReminders } = require('./jobs/meetingReminders');
const { startTaskReminders } = require('./jobs/taskReminders');
const { startApplicationFollowups } = require('./jobs/applicationFollowups');

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`));

connectDB().then(async () => {
  await autoSeedIfEmpty();
  await require('./lib/access').seedProfiles();
  startDeadlineReminders(io, userSockets, mailer);
  startSecurityDigest(mailer);
  initAutomation({ io, userSockets, mailer });
  await seedStarterTemplates();
  startAutomationScheduler();
  startMeetingReminders(io, userSockets, mailer);
  startTaskReminders(io, userSockets);
  startApplicationFollowups(io, userSockets);
}).catch((err) => {
  console.error('[Startup] Fatal DB error:', err.message);
  process.exit(1);
});
