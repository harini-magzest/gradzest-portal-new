const { uploadToS3, isS3Configured } = require('../lib/uploadToS3');

/**
 * Mount immediately AFTER scanUploadedFile — only a file that has already
 * passed the virus scan reaches here. If S3 isn't configured (no
 * AWS_REGION/AWS_S3_BUCKET), this is a true no-op: req.file is left exactly
 * as multer produced it, and the route saves a local /uploads/ URL exactly
 * as it does today. If S3 IS configured, the local file is uploaded and
 * deleted, and req.file.s3Url is set for the route handler to prefer.
 */
async function uploadToS3IfConfigured(req, res, next) {
  if (!req.file || !isS3Configured()) return next();
  try {
    req.file.s3Url = await uploadToS3(req.file.path, 'documents');
    next();
  } catch (err) {
    console.error('[uploadToS3IfConfigured] Failed:', err.message);
    res.status(503).json({ message: 'File storage is temporarily unavailable. Please try again.' });
  }
}

module.exports = { uploadToS3IfConfigured };
