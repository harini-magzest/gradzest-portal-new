const fs = require('fs');
const path = require('path');
const { deleteFromS3 } = require('./uploadToS3');

// Removes a file stored by middleware/upload + uploadToS3IfConfigured. Accepts either an
// S3 object URL or the local `/uploads/<name>` path that the upload flow stores. Failures
// are logged, never thrown: the database record is the source of truth and is already gone.
function deleteStoredFile(storedUrl) {
  if (!storedUrl) return;
  if (storedUrl.includes('amazonaws.com/')) {
    const key = storedUrl.split('amazonaws.com/')[1];
    deleteFromS3(key).catch(err => console.error('[storedFile] S3 delete failed:', err.message));
    return;
  }
  const localPath = path.join(__dirname, '..', 'uploads', path.basename(storedUrl));
  fs.unlink(localPath, () => {});
}

module.exports = { deleteStoredFile };
