// One-off migration: encrypts SOC fields on rows written before field-level encryption was enabled.
// Dry run by default (counts only). Run with --apply to write. Safe to re-run: already-encrypted values are skipped.
//
//   node scripts/encryptSocData.js          # report
//   node scripts/encryptSocData.js --apply  # encrypt in place
//
// Needs MONGODB_URI and DATA_ENCRYPTION_KEY in server/.env. Back up the database first.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');
const { encrypt, decryptStrict, deriveEncKey, isEncrypted } = require('../lib/fieldCrypto');

// Which fields each model encrypts is declared on the model itself (lib/encryptedFields.js).
const MODELS = ['SecurityEvent', 'RequestLog', 'ActivityLog', 'SecurityIncident', 'BlockedIp', 'PiiAccessLog', 'AnalystAction', 'UiActivity', 'UploadRecord'];

// Keys that values may have been written with before DATA_ENCRYPTION_KEY was loaded: the development fallback derived
// from JWT_SECRET (what a dev server without the key used). Values under these are re-encrypted from their plaintext
// instead of being wrapped a second time. Extra legacy master keys (64 hex) can be given in LEGACY_ENCRYPTION_KEYS.
const legacyKeys = () => [
  ...(process.env.JWT_SECRET ? [crypto.createHash('sha256').update(`dev-only:${process.env.JWT_SECRET}`).digest('hex')] : []),
  ...String(process.env.LEGACY_ENCRYPTION_KEYS || '').split(',').map((k) => k.trim()).filter((k) => /^[0-9a-f]{64}$/i.test(k)),
].map(deriveEncKey);

// Peels encryption layers off `value` (current key first, then legacy keys) until plaintext is left. A prefixed string
// that no key opens is treated as ordinary text (e.g. something a user typed).
function toPlaintext(value, legacy) {
  let cur = value;
  for (let round = 0; round < 4 && isEncrypted(cur); round++) {
    let next = decryptStrict(cur);
    for (const k of legacy) { if (next !== null) break; next = decryptStrict(cur, k); }
    if (next === null) break;
    cur = next;
  }
  return cur;
}

// Collects { 'path.0.sub': encryptedValue } for every value under `parts` that is not exactly one layer of current-key
// ciphertext. A step that lands on an array (e.g. 'notes.text') visits each element.
function collect(node, parts, prefix, out, legacy) {
  if (node == null) return;
  if (Array.isArray(node)) { node.forEach((el, i) => collect(el, parts, `${prefix}.${i}`, out, legacy)); return; }
  if (!parts.length) {
    if (typeof node === 'string' && node !== '') { const e = encrypt(toPlaintext(node, legacy)); if (e !== node) out[prefix] = e; }
    return;
  }
  collect(node[parts[0]], parts.slice(1), prefix ? `${prefix}.${parts[0]}` : parts[0], out, legacy);
}

async function main() {
  // Never fall back to a derived dev key here: data encrypted with it would be unreadable by the real server.
  if (!process.env.DATA_ENCRYPTION_KEY) throw new Error('DATA_ENCRYPTION_KEY is not set (check server/.env); refusing to encrypt with a fallback key');
  const apply = process.argv.includes('--apply');
  const legacy = legacyKeys();
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
      for (const f of fields) collect(doc, f.split('.'), '', $set, legacy);
      if (Object.keys($set).length) { changed++; if (apply) ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set } } }); }
      if (ops.length >= 500) await flush();
    }
    await flush();
    console.log(`${name}: ${scanned} rows, ${changed} ${apply ? 'encrypted' : 'need encrypting'}${conflicts ? `, ${conflicts} skipped on duplicate keys (resolve by hand)` : ''}`);
  }
  await mongoose.disconnect();
}

module.exports = { toPlaintext, collect, legacyKeys };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
