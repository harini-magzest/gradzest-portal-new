const { uploadToS3, isS3Configured } = require('../lib/uploadToS3');

/**
 * Mount immediately AFTER scanUploadedFile — only a file that has already
 * passed the virus scan reaches here. If S3 isn't configured (no
 * AWS_REGION/AWS_S3_BUCKET), this is a true no-op: req.file is left exactly
 * as multer produced it. If S3 IS configured, the local file is uploaded as a
 * private object and deleted, and req.file.s3Key is set. Either way the route
 * stores `/uploads/<filename>`: /uploads serves the file from disk or from S3
 * after the same access checks (app.js), so no bucket URL is ever stored.
 */
async function uploadToS3IfConfigured(req, res, next) {
  if (!req.file || !isS3Configured()) return next();
  try {
    req.file.s3Key = await uploadToS3(req.file.path);
    next();
  } catch (err) {
    console.error('[uploadToS3IfConfigured] Failed:', err.message);
    res.status(503).json({ message: 'File storage is temporarily unavailable. Please try again.' });
  }
}

module.exports = { uploadToS3IfConfigured };
