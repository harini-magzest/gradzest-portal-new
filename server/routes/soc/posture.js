// Security posture: dependency audit, code flags, active protections and known gaps.
const express = require('express');
const { sendServerError } = require('../../lib/httpError');
const { execFile } = require('child_process');
const path = require('path');
const { getCodeAnalysis } = require('../../lib/codeScan');
const { getActiveFeatures } = require('../../lib/activeFeatures');
const { getServiceHealth } = require('../../lib/serviceHealth');
const authMiddleware = require('../../middleware/auth');
const { adminOnly } = require('./shared');

const router = express.Router();

// ── Posture ───────────────────────────────────────────────────────────────────

let postureCache = null;
let postureCacheAt = 0;
const POSTURE_CACHE_MS = 60 * 60 * 1000; // 1 hour — npm audit is slow and hits the network

function runNpmAudit(cwd) {
  return new Promise((resolve) => {
    // shell: true — on Windows `npm` resolves to npm.cmd, which execFile can't
    // launch directly without going through a shell (fails with ENOENT otherwise).
    execFile('npm', ['audit', '--json'], { cwd, timeout: 30000, maxBuffer: 10 * 1024 * 1024, shell: true }, (err, stdout) => {
      // npm audit exits non-zero when vulnerabilities are found — that's not a
      // failure, the JSON is still on stdout. Only a genuinely empty stdout is a failure.
      if (!stdout) return resolve({ error: err?.message || 'npm audit produced no output' });
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ error: 'Failed to parse npm audit output' });
      }
    });
  });
}

// Known-incomplete work — hand-maintained deliberately, so it's visible on the
// dashboard itself rather than only living in
// chat history. Update/remove an item here the moment it's actually closed
// out — a stale "known gap" that's secretly fixed is misleading.
const KNOWN_GAPS = [
  // Whether the scanner is running right now is not a known gap: it is checked live (services.scanner, below).
  {
    label: 'Malware scanning: live-fire detection unverified',
    detail: 'The block/log/quarantine response path is proven against a simulated detection, but catching a real malicious file end to end has not been confirmed: on Windows, Defender intercepts the EICAR test file before ClamAV can read it.',
  },
  {
    label: 'clamd on Windows is auto-started by the app, not a real service',
    detail: 'On Windows the app spawns clamd on boot if it isn’t running (installing it as a Windows service needs admin rights), so nothing restarts it if it crashes. A real deployment (e.g. Linux/EC2) should run it as a supervised systemd service (clamav-daemon).',
  },
  {
    label: 'No edge WAF / DDoS protection (still impossible without real network-edge infra)',
    detail: 'The in-app WAF (server/middleware/wafRules.js) plus Skyload (server/middleware/skyload.js — adaptive connection throttling, bot/anomaly scoring, IP reputation) cover payload-level attacks and application-layer abuse, verified live. Neither can defend against volumetric/DDoS traffic — that requires absorbing attack traffic across distributed network-edge infrastructure before it reaches this single server, which no application code running on that same server can do. Real edge protection (e.g. Cloudflare) still isn’t set up; a domain was deliberately not purchased for this, so it stays deferred until a real server (EC2) exists to protect.',
  },
  {
    label: 'S3 upload support is built but untested against a real bucket',
    detail: 'server/lib/uploadToS3.js and server/middleware/uploadToS3IfConfigured.js are real, wired into all three upload routes (students, counselors, chat), and activate automatically once AWS_REGION + AWS_S3_BUCKET are set. Until then it’s a verified no-op — uploads stay on local disk exactly as before. The S3 path itself hasn’t been exercised against a real bucket since no AWS credentials are available in this environment.',
  },
];

// What the dashboard shows for one `npm audit --json` result: the vulnerability counts, or { error: <sentence> }. It never
// returns an empty object, because the dashboard reads "no counts" as "no vulnerabilities" and draws a green all-clear.
// When the audit cannot run (no network, registry timeout) npm prints an error object, not counts; passing that straight
// through left the card blank, and a result without a metadata block looked like a clean bill of health.
function summariseAudit(audit) {
  const counts = audit?.metadata?.vulnerabilities;
  if (counts && typeof counts === 'object') return counts;
  const e = audit?.error;
  const reason = typeof e === 'string' ? e : (e?.summary || e?.code || e?.message || '');
  return { error: String(reason || 'npm audit returned no vulnerability data').slice(0, 300) };
}

// Relative to this file (server/routes/soc/): moving it changes them, which test/socPosture.test.js catches.
const AUDIT_DIRS = {
  frontend: path.join(__dirname, '..', '..', '..'), // the repo root
  backend: path.join(__dirname, '..', '..'),        // server/
};

// One audit at a time: a second "Re-check" while one is running shares it instead of starting two npm processes.
let postureInflight = null;
async function buildPosture(forceRefresh) {
  const [rootAudit, serverAudit] = await Promise.all([
    runNpmAudit(AUDIT_DIRS.frontend),
    runNpmAudit(AUDIT_DIRS.backend),
  ]);
  postureCache = {
    checkedAt: new Date().toISOString(),
    dependencyAudit: { frontend: summariseAudit(rootAudit), backend: summariseAudit(serverAudit) },
    knownGaps: KNOWN_GAPS,
    activeFeatures: getActiveFeatures(),
    codeAnalysis: getCodeAnalysis(forceRefresh),
  };
  postureCacheAt = Date.now();
  return postureCache;
}

router.get('/posture', authMiddleware, adminOnly, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    // Live service checks have their own one-minute cache, so they stay current while the slow npm audit is cached for an hour.
    const services = getServiceHealth(req.app, { refresh: forceRefresh });
    if (!forceRefresh && postureCache && Date.now() - postureCacheAt < POSTURE_CACHE_MS) {
      return res.json({ ...postureCache, services: await services, cached: true });
    }
    if (!postureInflight) postureInflight = buildPosture(forceRefresh).finally(() => { postureInflight = null; });
    res.json({ ...(await postureInflight), services: await services, cached: false });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

module.exports = router;
module.exports.summariseAudit = summariseAudit;
module.exports.AUDIT_DIRS = AUDIT_DIRS;
