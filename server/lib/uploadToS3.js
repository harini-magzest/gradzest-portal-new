// Real S3 upload support for the app's file uploads — not a stub. Scanning
// (server/middleware/scanUpload.js) needs a real local file to hand to
// ClamAV, so the flow stays: multer writes to local disk -> ClamAV scans the
// local file -> if the file is clean AND AWS is configured, this uploads
// that already-verified-clean file to S3 and removes the local copy.
//
// The bucket must be private (Block Public Access on; no public-read ACL or bucket policy). Nothing here stores or
// returns an S3 URL: records keep `/uploads/<name>`, and /uploads (app.js) streams the object from S3 after the same
// signed-link and per-file checks it applies to files on disk. Objects live under the key `documents/<name>`.
//
// If AWS_* env vars aren't set, isS3Configured() is false and every caller
// treats that as "stay on local disk", so nothing changes for local dev.
//
// Required env vars to activate: AWS_REGION, AWS_S3_BUCKET, and either
// AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, or an IAM role (e.g. on EC2)
// that the SDK picks up automatically without explicit keys.

const fs = require('fs');
const path = require('path');

let S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand;
try {
  ({ S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3'));
} catch {
  // Package not installed in some environment — isS3Configured() below still
  // gates every real call, so this only matters if AWS_S3_BUCKET is also set
  // without the dependency present, which would be a real setup error.
}

const KEY_PREFIX = 'documents';
const bucket = () => process.env.AWS_S3_BUCKET;

let client = null;
function getClient() {
  if (!client) client = new S3Client({ region: process.env.AWS_REGION });
  return client;
}

function isS3Configured() {
  return !!(process.env.AWS_REGION && bucket() && (S3Client || client));
}

/** The object key for a stored file (`/uploads/<name>`, a local path, or just `<name>`). */
const s3KeyFor = (storedName) => `${KEY_PREFIX}/${path.basename(String(storedName))}`;

/**
 * Upload a local file to S3 and delete the local copy on success.
 * Returns the object key, or null if S3 isn't configured (the caller keeps the local file then).
 * Throws if S3 IS configured but the upload itself fails — callers should
 * treat that as a real error, not silently fall back, since silently
 * keeping an "uploaded" file only on local disk in a multi-instance
 * deployment is exactly the bug this exists to prevent.
 */
async function uploadToS3(localFilePath) {
  if (!isS3Configured()) return null;

  const key = s3KeyFor(localFilePath);
  const body = fs.readFileSync(localFilePath);

  await getClient().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: guessContentType(localFilePath),
  }));

  fs.unlink(localFilePath, () => {});
  return key;
}

/** The stored file `name` from S3 as { body: Readable, contentType, contentLength }, or null if there is no such object. */
async function getFromS3(name) {
  if (!isS3Configured()) return null;
  try {
    const out = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: s3KeyFor(name) }));
    return { body: out.Body, contentType: out.ContentType, contentLength: out.ContentLength };
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** Whether the stored file `name` exists in the bucket (a HEAD request: nothing is downloaded). */
async function existsInS3(name) {
  if (!isS3Configured()) return false;
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: s3KeyFor(name) }));
    return true;
  } catch (err) {
    if (err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

async function deleteFromS3(key) {
  if (!isS3Configured()) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
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

// Tests swap in a fake client (an object with `send(command)`); nothing else should call this.
function _setClientForTests(fake) { client = fake; }

module.exports = { uploadToS3, getFromS3, existsInS3, deleteFromS3, isS3Configured, s3KeyFor, _setClientForTests };
