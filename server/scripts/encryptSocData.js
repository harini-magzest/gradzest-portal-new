// One-off migration: encrypts SOC fields on rows written before field-level encryption was enabled.
// Dry run by default (counts only). Run with --apply to write. Safe to re-run: already-encrypted values are skipped.
//
//   node scripts/encryptSocData.js          # report
//   node scripts/encryptSocData.js --apply  # encrypt in place
//
// Needs MONGODB_URI and DATA_ENCRYPTION_KEY in server/.env. Back up the database first.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { encrypt, isEncrypted } = require('../lib/fieldCrypto');

// Which fields each model encrypts is declared on the model itself (lib/encryptedFields.js).
const MODELS = ['SecurityEvent', 'RequestLog', 'ActivityLog', 'SecurityIncident', 'BlockedIp', 'PiiAccessLog', 'AnalystAction', 'UiActivity', 'UploadRecord'];

const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

(async () => {
  // Never fall back to a derived dev key here: data encrypted with it would be unreadable by the real server.
  if (!process.env.DATA_ENCRYPTION_KEY) throw new Error('DATA_ENCRYPTION_KEY is not set (check server/.env); refusing to encrypt with a fallback key');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  for (const name of MODELS) {
    const { collection: col, schema } = require(`../models/${name}`);
    const fields = schema.socEncryptedPaths;
    let scanned = 0; let changed = 0; let conflicts = 0; let ops = [];
    // Unordered, so one row that collides with an already-encrypted duplicate (e.g. a BlockedIp the live server
    // re-created after deploy, now hitting the unique index) does not stop the rest of the batch.
    const flush = async () => {
      if (!ops.length) return;
      try { await col.bulkWrite(ops, { ordered: false }); } catch (e) {
        const errs = e.writeErrors || [];
        if (!errs.length || errs.some((w) => (w.code ?? w.err?.code) !== 11000)) throw e;
        conflicts += errs.length;
      }
      ops = [];
    };
    for await (const doc of col.find({})) {
      scanned++;
      const $set = {};
      for (const f of fields) {
        const v = get(doc, f);
        if (typeof v === 'string' && v !== '' && !isEncrypted(v)) $set[f] = encrypt(v);
      }
      if (Object.keys($set).length) { changed++; if (apply) ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set } } }); }
      if (ops.length >= 500) await flush();
    }
    await flush();
    console.log(`${name}: ${scanned} rows, ${changed} ${apply ? 'encrypted' : 'need encrypting'}${conflicts ? `, ${conflicts} skipped on duplicate keys (resolve by hand)` : ''}`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
