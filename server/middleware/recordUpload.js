const crypto = require('crypto');
const fs = require('fs');
const UploadRecord = require('../models/UploadRecord');
const { inspectFile } = require('../lib/fileInspect');
const { quarantineFreshFile } = require('../lib/quarantine');

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('data', (c) => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Mount right after scanUploadedFile (so only files that passed ClamAV get here) and before
 * uploadToS3IfConfigured (which may delete the local copy). For every file it:
 *   1. inspects the content locally (disguised executables, macros, remote templates, PDF launch
 *      actions, scripts hidden in images, deceptive filenames);
 *   2. BLOCKS and quarantines the upload if a 'high' finding is present — the user gets a clear
 *      error, an incident is opened, and the file is kept out of the served uploads folder;
 *   3. otherwise records who uploaded what (with SHA-256 and any lesser findings) and starts a
 *      hash-only VirusTotal lookup in the background.
 * If the inspection/recording machinery itself fails, the upload proceeds — a bug here must not
 * stop students submitting documents.
 */
function recordUpload(source) {
  return async function recordUploadMiddleware(req, res, next) {
    if (!req.file) return next();
    const io = req.app?.get?.('io') || null;
    let blocked = false;
    const blockedResponse = () => res.status(400).json({ message: 'This file was blocked by a security check and was not uploaded. Please upload a standard, unmodified PDF, Word document or image.' });
    try {
      let inspection = null;
      try { inspection = inspectFile(req.file.path, req.file.originalname); } catch (err) { console.error('[recordUpload] inspect failed:', err.message); }
      blocked = inspection?.risk === 'high';

      const sha256 = await sha256OfFile(req.file.path);
      const base = {
        userId: req.user.id, email: req.user.email || '', name: req.user.name || '', role: req.user.role || '',
        source, originalName: String(req.file.originalname || '').slice(0, 255), storedName: req.file.filename || '',
        mimeType: req.file.mimetype || '', size: req.file.size || 0, sha256,
        ip: req.ip, userAgent: String(req.headers?.['user-agent'] || '').slice(0, 300),
        inspection: inspection || undefined,
      };

      if (blocked) {
        let moved = true;
        try { quarantineFreshFile(req.file.path, req.file.filename); } catch (err) { moved = false; console.error('[recordUpload] quarantine move failed:', err.message); }
        const codes = inspection.findings.filter((f) => f.severity === 'high').map((f) => f.code);
        const rec = await UploadRecord.create({
          ...base, blocked: true, quarantined: moved, quarantinedAt: new Date(),
          quarantineReason: `Blocked at upload: ${codes.join(', ')}`,
        });
        io?.to('admin-room').emit('upload_recorded', rec.toObject());
        await require('../lib/detectIncidents').raiseUnsafeUploadIncident(rec, io).catch((err) => console.error('[recordUpload] incident failed:', err.message));
        if (!moved) fs.unlink(req.file.path, () => {}); // never leave a high-risk file in the served folder
        return blockedResponse();
      }

      const rec = await UploadRecord.create(base);
      io?.to('admin-room').emit('upload_recorded', rec.toObject());
    } catch (err) {
      console.error('[recordUpload] Failed:', err.message);
      if (blocked) {
        // The file was already judged unsafe — a bookkeeping failure must not let it through.
        try { quarantineFreshFile(req.file.path, req.file.filename); } catch { fs.unlink(req.file.path, () => {}); }
        return blockedResponse();
      }
    }
    next();
  };
}

module.exports = { recordUpload, sha256OfFile };
