// Converts stored S3 object URLs (https://<bucket>.s3.<region>.amazonaws.com/documents/<name>) into the `/uploads/<name>`
// paths the app stores now. Files are then served by /uploads after its access checks (lib/uploadToS3.js), so the
// bucket can stay private. The objects themselves are not touched.
//
//   node scripts/migrateS3Urls.js           dry run (the default): counts what would change, changes nothing
//   node scripts/migrateS3Urls.js --apply   rewrites the stored URLs
//
// Looks at every string field of users (documents, offer letters, profile files), chat rooms (attachments and
// recordings) and knowledge-base documents. Prints counts only, never names or file contents. Safe to run twice.
// The database is MONGODB_URI from the environment, or from server/.env when it is not set.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const S3_URL = /^https:\/\/[^/\s]+\.amazonaws\.com\/(?:[^/\s]+\/)*([A-Za-z0-9][A-Za-z0-9._-]{0,200})$/;
const COLLECTIONS = ['users', 'chatrooms', 'knowledgedocuments'];

// Every { path, value } in `doc` whose value is an S3 object URL, as dotted paths ready for $set
function s3Fields(value, at = '', found = []) {
  if (typeof value === 'string') {
    const m = S3_URL.exec(value);
    if (m) found.push({ path: at, value: `/uploads/${m[1]}` });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => s3Fields(v, at ? `${at}.${i}` : String(i), found));
  } else if (value && typeof value === 'object' && !(value instanceof Date) && value._bsontype === undefined) {
    for (const [k, v] of Object.entries(value)) s3Fields(v, at ? `${at}.${k}` : k, found);
  }
  return found;
}

async function migrateS3Urls(db, { apply = false } = {}) {
  const summary = {};
  for (const name of COLLECTIONS) {
    let docs = 0, fields = 0;
    const cursor = db.collection(name).find({});
    for await (const doc of cursor) {
      const { _id, ...rest } = doc;
      const changes = s3Fields(rest);
      if (!changes.length) continue;
      docs += 1; fields += changes.length;
      if (apply) await db.collection(name).updateOne({ _id }, { $set: Object.fromEntries(changes.map((c) => [c.path, c.value])) });
    }
    summary[name] = { documents: docs, fields };
  }
  return summary;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const unknown = process.argv.slice(2).filter((a) => a !== '--apply');
  if (unknown.length) throw new Error(`Unknown option ${unknown.join(' ')}. Use --apply, or nothing for a dry run`);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (environment or server/.env)');
  const { mongoose } = require('../db');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const { host, name } = mongoose.connection;
    console.log(`Database: ${name} on ${host}`);
    console.log(apply ? 'APPLYING' : 'DRY RUN: nothing will be changed (add --apply to make these changes)');
    const summary = await migrateS3Urls(mongoose.connection.db, { apply });
    for (const [coll, { documents, fields }] of Object.entries(summary)) {
      console.log(`  ${coll.padEnd(20)} ${documents} record(s), ${fields} S3 URL(s) ${apply ? 'converted' : 'to convert'}`);
    }
  } finally {
    mongoose.connection.removeAllListeners('disconnected'); // db.js would log this deliberate disconnect as a dropped connection
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error('Failed:', err.message); process.exitCode = 1; });
}

module.exports = { migrateS3Urls, s3Fields };
