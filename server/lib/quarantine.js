// Moves files in and out of a quarantine folder that is NOT served by the app (unlike
// server/uploads, which is exposed at /uploads to any signed-in user). A quarantined
// document therefore stops being downloadable the moment it is moved, and analysts can still
// inspect, restore or permanently delete it.
//
// Only works for files on local disk. When S3 storage is enabled the local copy is deleted
// after upload, so there is nothing here to move — callers get a clear { ok: false, reason }.

const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const quarantineDir = () => process.env.QUARANTINE_DIR || path.join(__dirname, '..', 'quarantine');

// storedName comes from our own database, but never trust it as a path.
const safeName = (name) => path.basename(String(name || ''));

function ensureDir() {
  fs.mkdirSync(quarantineDir(), { recursive: true });
}

function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err; // different drives: copy then remove
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

// Used at upload time, for a file that was just written by multer (any path) and must not be kept.
function quarantineFreshFile(srcPath, storedName) {
  ensureDir();
  const name = safeName(storedName || path.basename(srcPath));
  moveFile(srcPath, path.join(quarantineDir(), name));
  return name;
}

// Used by analysts, for a file already stored in uploads/.
function quarantineStored(storedName) {
  const name = safeName(storedName);
  if (!name) return { ok: false, reason: 'No stored file name on record' };
  const src = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(src)) return { ok: false, reason: 'The file is not on local disk (stored in S3, or already removed). Remove it from the bucket directly.' };
  ensureDir();
  moveFile(src, path.join(quarantineDir(), name));
  return { ok: true };
}

function restoreStored(storedName) {
  const name = safeName(storedName);
  const src = path.join(quarantineDir(), name);
  if (!name || !fs.existsSync(src)) return { ok: false, reason: 'The file is no longer in quarantine.' };
  moveFile(src, path.join(UPLOADS_DIR, name));
  return { ok: true };
}

function purgeQuarantined(storedName) {
  const name = safeName(storedName);
  const src = path.join(quarantineDir(), name);
  if (!name || !fs.existsSync(src)) return { ok: false, reason: 'The file is no longer in quarantine.' };
  fs.unlinkSync(src);
  return { ok: true };
}

const inQuarantine = (storedName) => fs.existsSync(path.join(quarantineDir(), safeName(storedName)));

module.exports = { quarantineFreshFile, quarantineStored, restoreStored, purgeQuarantined, inQuarantine, quarantineDir, UPLOADS_DIR };
