const crypto = require('crypto');
const fs = require('fs');
const UploadRecord = require('../models/UploadRecord');
const { isConfigured, checkUpload } = require('../lib/virusTotal');

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('data', (c) => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Mount right after scanUploadedFile (so only files that passed ClamAV are recorded)
 * and before uploadToS3IfConfigured (which may delete the local copy). Records who
 * uploaded what and kicks off a hash-only VirusTotal lookup in the background.
 * Never blocks or fails the upload — if recording breaks, the upload still proceeds.
 */
function recordUpload(source) {
  return async function recordUploadMiddleware(req, res, next) {
    if (!req.file) return next();
    try {
      const sha256 = await sha256OfFile(req.file.path);
      const rec = await UploadRecord.create({
        userId: req.user.id, email: req.user.email || '', name: req.user.name || '', role: req.user.role || '',
        source, originalName: String(req.file.originalname || '').slice(0, 255), storedName: req.file.filename || '',
        mimeType: req.file.mimetype || '', size: req.file.size || 0, sha256,
        ip: req.ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        vt: { status: isConfigured() ? 'pending' : 'not_configured' },
      });
      const io = req.app.get('io');
      io?.to('admin-room').emit('upload_recorded', rec.toObject());
      if (isConfigured()) checkUpload(rec._id, { io }).catch(() => {});
    } catch (err) {
      console.error('[recordUpload] Failed:', err.message);
    }
    next();
  };
}

module.exports = { recordUpload, sha256OfFile };
