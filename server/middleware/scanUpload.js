const { execFile } = require('child_process');
const fs = require('fs');
const { logSecurityEvent } = require('./logSecurityEvent');
const { sendCriticalIncidentAlert } = require('../lib/criticalAlert');
const SecurityIncident = require('../models/SecurityIncident');

// Real ClamAV engine (installed via winget, Cisco.ClamAV) — not a stub. Uses
// the `clamd` daemon + `clamdscan` client rather than standalone `clamscan`:
// clamscan reloads the entire ~110MB signature database from disk on every
// single invocation (measured 14-50s per file, cold vs. disk-cached) — that's
// a 14-50 second stall on every upload, not production-viable. clamd loads
// the database once and keeps it resident in memory; clamdscan is a thin
// client that just asks the already-running daemon to scan (measured
// 85-170ms per file). Same documented exit-code contract as clamscan:
// 0 = clean, 1 = virus found, 2 = an error occurred.
//
// clamd itself must already be running (started via `clamd --config-file=<path>`
// pointed at a clamd.conf with DatabaseDirectory set) — this module is only
// the client side. Defaults below are dev-machine (Windows) paths; on a real
// Linux host (e.g. an EC2 instance where ClamAV is installed via apt as
// `clamav-daemon`), set CLAMDSCAN_BIN/CLAMD_CONFIG in the environment —
// typically /usr/bin/clamdscan and /etc/clamav/clamd.conf — rather than
// relying on these Windows-shaped fallbacks.
const isWindows = process.platform === 'win32';
const CLAMDSCAN_BIN = process.env.CLAMDSCAN_BIN
  || (isWindows ? 'C:\\Program Files\\ClamAV\\clamdscan.exe' : '/usr/bin/clamdscan');
const CLAMD_CONFIG = process.env.CLAMD_CONFIG
  || (isWindows ? 'C:\\ClamAV-db\\clamd.conf' : '/etc/clamav/clamd.conf');

function scanFile(filePath) {
  return new Promise((resolve) => {
    execFile(
      CLAMDSCAN_BIN,
      ['--config-file', CLAMD_CONFIG, '--no-summary', filePath],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err?.code;
        if (code === 1) return resolve({ infected: true, signature: stdout.trim() });
        if (code && code !== 1) return resolve({ infected: false, scanError: (stderr || err.message || '').trim() });
        resolve({ infected: false });
      },
    );
  });
}

/**
 * Mount immediately after multer's upload.single('file'). Scans the file
 * that was just written to disk with a real ClamAV engine before it's
 * referenced anywhere else in the app. Deletes the file and rejects the
 * request if infected; fails closed (rejects) if the scan itself can't run,
 * rather than silently letting an unscanned file through.
 */
async function scanUploadedFile(req, res, next) {
  if (!req.file) return next(); // no fresh upload in this request (e.g. a pre-existing URL was supplied instead)
  const filePath = req.file.path;
  try {
    const result = await scanFile(filePath);

    if (result.scanError) {
      fs.unlink(filePath, () => {});
      console.error('[scanUpload] Scan engine error:', result.scanError);
      return res.status(503).json({ message: 'File scanning is temporarily unavailable. Please try again.' });
    }

    if (result.infected) {
      fs.unlink(filePath, () => {});
      const event = await logSecurityEvent('malware_upload', {
        severity: 'critical',
        userId: req.user?.id || null,
        email: req.user?.email || '',
        role: req.user?.role || '',
        ip: req.ip,
        message: `Blocked infected upload: ${result.signature}`,
        meta: { originalName: req.file.originalname, signature: result.signature },
      });
      const incident = await SecurityIncident.create({
        type: 'malware_upload',
        severity: 'critical',
        title: `Malware upload blocked: ${result.signature}`,
        relatedIp: req.ip,
        relatedUserId: req.user?.id || null,
        relatedEmail: req.user?.email || '',
        sourceEventIds: event ? [event._id] : [],
      });
      req.app.get('io')?.to('admin-room').emit('incident_created', incident.toObject());
      sendCriticalIncidentAlert(incident).catch((err) => console.error('[criticalAlert] Failed:', err.message));
      return res.status(400).json({ message: 'This file was flagged as malicious and was not uploaded.' });
    }

    next();
  } catch (err) {
    fs.unlink(filePath, () => {});
    console.error('[scanUpload] Failed:', err.message);
    res.status(503).json({ message: 'File scanning is temporarily unavailable. Please try again.' });
  }
}

module.exports = { scanUploadedFile };
