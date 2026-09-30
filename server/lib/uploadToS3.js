// Real S3 upload support for the app's file uploads — not a stub. Scanning
// (server/middleware/scanUpload.js) needs a real local file to hand to
// ClamAV, so the flow stays: multer writes to local disk -> ClamAV scans the
// local file -> if the file is clean AND AWS is configured, this uploads
// that already-verified-clean file to S3 and removes the local copy.
//
// If AWS_* env vars aren't set, isS3Configured() is false and every caller
// treats that as "stay on local disk" — the exact current behavior, so
// nothing changes for local dev until real AWS credentials are provided.
//
// Required env vars to activate: AWS_REGION, AWS_S3_BUCKET, and either
// AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, or an IAM role (e.g. on EC2)
// that the SDK picks up automatically without explicit keys.

const fs = require('fs');
const path = require('path');

let S3Client, PutObjectCommand, DeleteObjectCommand;
try {
  ({ S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3'));
} catch {
  // Package not installed in some environment — isS3Configured() below still
  // gates every real call, so this only matters if AWS_S3_BUCKET is also set
  // without the dependency present, which would be a real setup error.
}

const AWS_REGION = process.env.AWS_REGION;
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;

let client = null;
function getClient() {
  if (!client) client = new S3Client({ region: AWS_REGION });
  return client;
}

function isS3Configured() {
  return !!(AWS_REGION && AWS_S3_BUCKET && S3Client);
}

/**
 * Upload a local file to S3 and delete the local copy on success.
 * Returns the S3 object's public-style URL, or null if S3 isn't configured
 * (caller should keep using the local file/path in that case).
 * Throws if S3 IS configured but the upload itself fails — callers should
 * treat that as a real error, not silently fall back, since silently
 * keeping an "uploaded" file only on local disk in a multi-instance
 * deployment is exactly the bug this exists to prevent.
 */
async function uploadToS3(localFilePath, keyPrefix = 'uploads') {
  if (!isS3Configured()) return null;

  const key = `${keyPrefix}/${path.basename(localFilePath)}`;
  const body = fs.readFileSync(localFilePath);

  await getClient().send(new PutObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: guessContentType(localFilePath),
  }));

  fs.unlink(localFilePath, () => {});

  return `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}

async function deleteFromS3(key) {
  if (!isS3Configured()) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key }));
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
  };
  return map[ext] || 'application/octet-stream';
}

module.exports = { uploadToS3, deleteFromS3, isS3Configured };
