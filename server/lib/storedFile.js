const fs = require('fs');
const path = require('path');
const { deleteFromS3, isS3Configured, s3KeyFor } = require('./uploadToS3');

// Removes a file stored by middleware/upload + uploadToS3IfConfigured, given the `/uploads/<name>` path the upload
// flow stores (or an S3 URL from before files were stored that way). The file is removed from local disk and, when S3
// is in use, from the bucket. Failures are logged, never thrown: the database record is the source of truth and is
// already gone.
function deleteStoredFile(storedUrl) {
  if (!storedUrl) return;
  const name = path.basename(String(storedUrl));
  if (isS3Configured() || String(storedUrl).includes('amazonaws.com/')) {
    deleteFromS3(s3KeyFor(name)).catch(err => console.error('[storedFile] S3 delete failed:', err.message));
  }
  fs.unlink(path.join(__dirname, '..', 'uploads', name), () => {});
}

module.exports = { deleteStoredFile };
