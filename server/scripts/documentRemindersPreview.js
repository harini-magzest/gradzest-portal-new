#!/usr/bin/env node
// Shows who the daily document reminder would nudge RIGHT NOW, without sending or saving anything.
//   node scripts/documentRemindersPreview.js
// Uses the database in server/.env (read-only for this script). Prints names and emails on your own screen only.
// Run it before the first deploy, and any time you want to know what students are about to receive.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  if (!process.env.MONGODB_URI) { console.error('MONGODB_URI is not set in server/.env'); process.exit(2); }
  await mongoose.connect(process.env.MONGODB_URI);
  const { runDocumentReminders } = require('../jobs/documentReminders');
  const stats = await runDocumentReminders(null, null, null, { dryRun: true });

  console.log(`Students checked: ${stats.considered}`);
  console.log(`Would be reminded now: ${stats.nudged} (${stats.preview.filter((p) => p.urgent).length} urgent, ${stats.preview.filter((p) => p.wouldEmail).length} by email)\n`);
  for (const p of stats.preview.slice(0, 25)) {
    console.log(`${p.urgent ? 'URGENT ' : '       '}${p.name} <${p.email || 'no email'}> — ${p.owed} item(s): ${p.message.replace('You still need to provide: ', '')}`);
  }
  if (stats.preview.length > 25) console.log(`…and ${stats.preview.length - 25} more`);
  console.log('\nNothing was sent or saved. Set DOCUMENT_REMINDERS=off in server/.env to keep the job from running at all.');
  await mongoose.disconnect();
})().catch((err) => { console.error('Preview failed:', err.message); process.exit(1); });
