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

const TARGETS = {
  SecurityEvent: ['email', 'ip', 'userAgent', 'message'],
  RequestLog: ['ip', 'userAgent'],
  ActivityLog: ['studentName', 'detail'],
  SecurityIncident: ['title', 'relatedIp', 'relatedEmail'],
  BlockedIp: ['ip', 'reason'],
  PiiAccessLog: ['accessorEmail', 'applicantEmail', 'ip'],
  AnalystAction: ['analystEmail', 'targetId', 'reason'],
  UiActivity: ['email', 'name', 'ip', 'userAgent', 'element.label', 'element.href', 'context', 'device.label', 'device.model'],
  UploadRecord: ['email', 'name', 'originalName', 'ip', 'userAgent'],
};

const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  for (const [name, fields] of Object.entries(TARGETS)) {
    const col = require(`../models/${name}`).collection;
    let scanned = 0; let changed = 0; let ops = [];
    for await (const doc of col.find({})) {
      scanned++;
      const $set = {};
      for (const f of fields) {
        const v = get(doc, f);
        if (typeof v === 'string' && v !== '' && !isEncrypted(v)) $set[f] = encrypt(v);
      }
      if (Object.keys($set).length) { changed++; if (apply) ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set } } }); }
      if (ops.length >= 500) { await col.bulkWrite(ops); ops = []; }
    }
    if (ops.length) await col.bulkWrite(ops);
    console.log(`${name}: ${scanned} rows, ${changed} ${apply ? 'encrypted' : 'need encrypting'}`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
