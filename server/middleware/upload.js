const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Stored names are unguessable (128 random bits) and never reuse the uploader's filename. Document uploads keep their
// extension, which fileFilter below has already limited to the allowed list.
const randomName = (ext) => `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, randomName(path.extname(file.originalname).toLowerCase())),
});

// Recordings: the extension comes from the (allowed) audio type, never from the uploaded name, so a file called
// "x.html" sent as audio/webm is stored as .webm and can't be served back as a web page.
const RECORDING_EXT = { webm: '.webm', ogg: '.ogg', mp4: '.mp4' };
const recordingStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, randomName(RECORDING_EXT[(/^(?:audio|video)\/(webm|ogg|mp4)/.exec(file.mimetype) || [])[1]] || '.bin')),
});

/** True when a recording's first bytes are really WebM, Ogg or MP4 (its MIME type is only what the browser claimed). */
function isRealRecording(filePath) {
  let head;
  try {
    const fd = fs.openSync(filePath, 'r');
    head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
  } catch { return false; }
  return head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) // WebM / Matroska (EBML)
    || head.subarray(0, 4).toString('latin1') === 'OggS'
    || head.subarray(4, 8).toString('latin1') === 'ftyp';               // MP4 / ISO BMFF
}

const allowedMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif',
];

// Call recordings recorded in the browser (MediaRecorder → webm/ogg audio)
const recording = multer({
  storage: recordingStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB ≈ several hours of opus audio
  fileFilter: (req, file, cb) => {
    const ok = /^(audio|video)\/(webm|ogg|mp4)/.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only audio recordings are allowed'));
  },
});

module.exports = Object.assign(multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif'];
    const extOk = allowedExts.includes(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowedMimeTypes.includes(file.mimetype);
    if (extOk && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents, and images are allowed'));
    }
  },
}), { recording, isRealRecording });
