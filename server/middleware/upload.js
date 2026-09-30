const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

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
  storage,
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
}), { recording });
