// One-off migration: moves chat messages out of their rooms (chatrooms.messages) into their own collection
// (chatmessages, models/ChatMessage.js), keeping each message's _id, so links to a message (replies, call summaries)
// still work. Dry run by default (counts only). Safe to re-run: a message already copied is left alone.
//
//   node scripts/migrateChatMessages.js                            # report
//   node scripts/migrateChatMessages.js --apply                    # copy; rooms keep their arrays
//   node scripts/migrateChatMessages.js --apply --remove-embedded  # copy anything new, then remove the arrays
//
// Order on a live system: --apply before deploying (the old server still reads the arrays), deploy, then
// --apply --remove-embedded, which copies what the old server wrote in between and frees the space.
// Needs MONGODB_URI in server/.env. Back up the database first.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const BATCH = 1000;
const OPTIONS = ['--apply', '--remove-embedded'];

async function migrateChatMessages(db, { apply = false, removeEmbedded = false } = {}) {
  const rooms = db.collection('chatrooms');
  const messages = db.collection('chatmessages');
  const report = { rooms: 0, messages: 0, copied: 0, withoutId: 0, roomsEmptied: 0, roomsChangedMeanwhile: 0 };

  for await (const room of rooms.find({ 'messages.0': { $exists: true } }, { projection: { messages: 1 } })) {
    report.rooms += 1;
    report.messages += room.messages.length;
    const withId = room.messages.filter((m) => m && m._id);
    report.withoutId += room.messages.length - withId.length;
    if (!apply) continue;

    // Insert-only: a message copied on an earlier run is never overwritten
    for (let i = 0; i < withId.length; i += BATCH) {
      const ops = withId.slice(i, i + BATCH).map((m) => ({
        updateOne: { filter: { _id: m._id }, update: { $setOnInsert: { ...m, roomId: room._id } }, upsert: true },
      }));
      const out = await messages.bulkWrite(ops, { ordered: false });
      report.copied += out.upsertedCount;
    }

    if (removeEmbedded && withId.length === room.messages.length) {
      const copied = await messages.countDocuments({ _id: { $in: withId.map((m) => m._id) } });
      if (copied !== withId.length) continue;
      // Only if no message was added to the array since it was read; a later run picks that room up again
      const out = await rooms.updateOne({ _id: room._id, messages: { $size: room.messages.length } }, { $unset: { messages: '' } });
      if (out.modifiedCount) report.roomsEmptied += 1; else report.roomsChangedMeanwhile += 1;
    }
  }
  return report;
}

async function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter((a) => !OPTIONS.includes(a));
  const apply = argv.includes('--apply');
  const removeEmbedded = argv.includes('--remove-embedded');
  if (unknown.length || (removeEmbedded && !apply)) {
    console.error(`Usage: node scripts/migrateChatMessages.js [--apply [--remove-embedded]]${unknown.length ? ` (unknown: ${unknown.join(' ')})` : ''}`);
    process.exitCode = 1;
    return;
  }
  await mongoose.connect(process.env.MONGODB_URI);
  // The collection's indexes, before anything reads it
  if (apply) await require('../models/ChatMessage').createIndexes();
  const report = await migrateChatMessages(mongoose.connection.db, { apply, removeEmbedded });
  console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: ${report.rooms} rooms hold ${report.messages} embedded messages; `
    + `${report.copied} copied now${removeEmbedded ? `, ${report.roomsEmptied} rooms emptied, ${report.roomsChangedMeanwhile} changed meanwhile (run again)` : ''}`
    + `${report.withoutId ? `; ${report.withoutId} messages have no _id and were left in place` : ''}.`);
  await mongoose.disconnect();
}

module.exports = { migrateChatMessages };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
