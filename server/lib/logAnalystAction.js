const crypto = require('crypto');
const AnalystAction = require('../models/AnalystAction');

// Each entry's hash covers its own content plus the previous entry's hash
// (a hash chain), so altering or deleting any past row breaks verification
// from that point on. This detects tampering after the fact — it doesn't
// prevent someone with database write access from rewriting the whole chain.
function computeHash(prevHash, e) {
  const payload = JSON.stringify([
    prevHash, String(e.analystId), e.analystEmail, e.action, e.targetType, e.targetId, e.reason,
    e.metadata || {}, new Date(e.createdAt).toISOString(),
  ]);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Writes are chained one at a time within this process so two concurrent
// actions can't both link to the same predecessor.
let chainQueue = Promise.resolve();

/**
 * Log an admin/analyst action taken from the SOC dashboard. Fire-and-forget —
 * never throws, never blocks the caller (the underlying action has already
 * succeeded by the time this is called).
 */
function logAnalystAction({ analyst, action, targetType, targetId, reason = '', metadata = {}, io = null }) {
  const run = async () => {
    try {
      const last = await AnalystAction.findOne({ hash: { $ne: '' } }).sort({ createdAt: -1, _id: -1 }).select('hash').lean();
      const prevHash = last?.hash || '';
      const fields = {
        analystId: analyst.id || analyst._id,
        analystEmail: analyst.email || '',
        action,
        targetType,
        targetId: String(targetId),
        reason,
        metadata,
        createdAt: new Date(),
      };
      const entry = await AnalystAction.create({ ...fields, prevHash, hash: computeHash(prevHash, fields) });

      if (io) io.to('admin-room').emit('analyst_action', entry.toObject());

      return entry;
    } catch (err) {
      console.error('[logAnalystAction] Failed:', err.message);
      return null;
    }
  };
  const result = chainQueue.then(run);
  chainQueue = result.catch(() => {});
  return result;
}

// Walks the chain oldest → newest. Returns { ok, checked, unchained, brokenAt }.
// Rows with no hash predate the chain and are counted but not verified.
async function verifyAuditChain() {
  const rows = await AnalystAction.find().sort({ createdAt: 1, _id: 1 }).lean();
  let prev = '';
  let checked = 0;
  let unchained = 0;
  for (const row of rows) {
    if (!row.hash) { unchained += 1; continue; }
    if (row.prevHash !== prev || computeHash(row.prevHash, row) !== row.hash) {
      return { ok: false, checked, unchained, brokenAt: { id: row._id, createdAt: row.createdAt, action: row.action } };
    }
    prev = row.hash;
    checked += 1;
  }
  return { ok: true, checked, unchained, brokenAt: null };
}

module.exports = { logAnalystAction, verifyAuditChain, computeHash };
