// VirusTotal hash reputation for uploaded documents.
//
// PRIVACY: only the SHA-256 is ever sent. The file is never uploaded, because
// VirusTotal shares submitted files with its customers and these are students'
// passports and certificates. The consequence is that a private document VirusTotal
// has never seen comes back "unknown" — that is normal and is NOT a risk signal;
// ClamAV (which already scanned the file locally) is the content check. VirusTotal
// adds value by recognising files that are *known* malicious.
//
// Needs VT_API_KEY. The free tier allows 4 lookups/minute and 500/day, so lookups are
// serialized with a minimum gap (VT_MIN_INTERVAL_MS, default 16s) and results for a
// hash that was already checked are reused instead of looked up again.

const UploadRecord = require('../models/UploadRecord');

const VT_BASE = 'https://www.virustotal.com/api/v3';
const FINAL = ['clean', 'suspicious', 'malicious', 'unknown'];
const REUSE_MS = 24 * 60 * 60 * 1000;

const isConfigured = () => !!process.env.VT_API_KEY;
const permalink = (sha256) => `https://www.virustotal.com/gui/file/${sha256}`;
const minInterval = () => (process.env.NODE_ENV === 'test' ? 0 : parseInt(process.env.VT_MIN_INTERVAL_MS || '16000', 10));

function summarize(body) {
  const attrs = body?.data?.attributes || {};
  const stats = attrs.last_analysis_stats || {};
  const malicious = stats.malicious || 0;
  const suspicious = stats.suspicious || 0;
  return {
    status: malicious > 0 ? 'malicious' : suspicious > 0 ? 'suspicious' : 'clean',
    malicious, suspicious, harmless: stats.harmless || 0, undetected: stats.undetected || 0,
    label: attrs.popular_threat_classification?.suggested_threat_label || '',
    lastAnalysisDate: attrs.last_analysis_date ? new Date(attrs.last_analysis_date * 1000) : null,
    checkedAt: new Date(), error: '',
  };
}

// Look up one hash. Never throws; returns { status, ... } in the same shape stored on the record.
async function lookupHash(sha256, fetchImpl = globalThis.fetch) {
  if (!isConfigured()) return { status: 'not_configured', error: '' };
  try {
    const res = await fetchImpl(`${VT_BASE}/files/${encodeURIComponent(sha256)}`, {
      headers: { 'x-apikey': process.env.VT_API_KEY, accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { status: 'unknown', checkedAt: new Date(), error: '' };
    if (res.status === 429) return { status: 'rate_limited', error: 'VirusTotal rate limit reached — will retry' };
    if (res.status === 401 || res.status === 403) return { status: 'error', error: 'VirusTotal rejected the API key' };
    if (!res.ok) return { status: 'error', error: `VirusTotal returned HTTP ${res.status}` };
    return summarize(await res.json());
  } catch (err) {
    return { status: 'error', error: `Lookup failed: ${err.message}` };
  }
}

// One lookup at a time, spaced out, so a burst of uploads can't blow the free-tier quota.
let chain = Promise.resolve();
let lastRun = 0;

async function checkUpload(recordId, { io = null, fetchImpl, force = false } = {}) {
  const run = async () => {
    try {
      const rec = await UploadRecord.findById(recordId);
      if (!rec) return null;
      if (!isConfigured()) {
        rec.vt.status = 'not_configured';
        await rec.save();
        return rec;
      }

      // Same file already checked recently (same hash from another upload) — reuse, no API call.
      const prior = force ? null : await UploadRecord.findOne({
        sha256: rec.sha256, _id: { $ne: rec._id }, 'vt.status': { $in: FINAL }, 'vt.checkedAt': { $gt: new Date(Date.now() - REUSE_MS) },
      }).lean();
      let result;
      if (prior) {
        const { attempts, ...rest } = prior.vt;
        result = { ...rest };
      } else {
        const wait = lastRun + minInterval() - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastRun = Date.now();
        result = await lookupHash(rec.sha256, fetchImpl);
      }

      rec.vt = { ...rec.vt.toObject(), ...result, attempts: (rec.vt.attempts || 0) + 1 };
      await rec.save();
      if (io) io.to('admin-room').emit('upload_updated', rec.toObject());
      if (rec.vt.status === 'malicious' || rec.vt.status === 'suspicious') {
        await require('./detectIncidents').raiseUploadRiskIncident(rec, io);
      }
      return rec;
    } catch (err) {
      console.error('[virusTotal] check failed:', err.message);
      return null;
    }
  };
  const result = chain.then(run);
  chain = result.catch(() => {});
  return result;
}

// Retry records that are still waiting (restart mid-queue) or were rate-limited / errored.
async function sweepPending({ io = null, limit = 3 } = {}) {
  if (!isConfigured()) return 0;
  const rows = await UploadRecord.find({
    'vt.status': { $in: ['pending', 'rate_limited', 'error'] }, 'vt.attempts': { $lt: 5 },
    createdAt: { $lt: new Date(Date.now() - 60 * 1000) },
  }).sort({ createdAt: 1 }).limit(limit).select('_id').lean();
  for (const r of rows) await checkUpload(r._id, { io });
  return rows.length;
}

function startSweeper(getIo) {
  const t = setInterval(() => { sweepPending({ io: getIo?.() }).catch(() => {}); }, 5 * 60 * 1000);
  t.unref();
  return t;
}

module.exports = { isConfigured, permalink, lookupHash, checkUpload, sweepPending, startSweeper, summarize };
