const express = require('express');
const { sendServerError } = require('../lib/httpError');
const { logError } = require('../lib/logError');
const User = require('../models/User');
const { buildCounselorPerformance } = require('../lib/counselorPerformance');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const { scanUploadedFile } = require('../middleware/scanUpload');
const { recordUpload } = require('../middleware/recordUpload');
const attachUserEmail = require('../middleware/attachUserEmail');
const { uploadToS3IfConfigured } = require('../middleware/uploadToS3IfConfigured');

const router = express.Router();

// Get own profile (counselor)
router.get('/me', authMiddleware, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user.toJSON());
  } catch (err) {
    logError('counselors', err);
    res.status(500).json({ message: 'Server error' });
  }
});

const COUNSELOR_SELF_EDITABLE = ['name', 'phone', 'avatar', 'bio', 'title', 'specialization', 'experience', 'languages', 'certifications', 'linkedIn', 'website'];

// Update own profile (counselor)
router.put('/me', authMiddleware, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  // Allowlist: profileId (permissions), hierarchyRole (whose students they can see), assignedStudents,
  // isAppTeam, active, smartfloAgent etc. are admin-controlled and must never be self-editable.
  const updates = Object.fromEntries(COUNSELOR_SELF_EDITABLE.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]));
  try {
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.toJSON());
  } catch (err) {
    logError('counselors', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get own documents (counselor)
router.get('/me/documents', authMiddleware, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  try {
    const user = await User.findById(req.user.id).select('documents');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json((user.documents || []).map(d => d.toJSON()));
  } catch (err) {
    logError('counselors', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload own document (counselor) — multipart/form-data with optional file
router.post('/me/documents', authMiddleware, attachUserEmail, upload.single('file'), scanUploadedFile, recordUpload('counselor_document'), uploadToS3IfConfigured, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  const { name, type } = req.body;
  const url = req.file ? (req.file.s3Url || `/uploads/${req.file.filename}`) : undefined;
  const docName = (name || req.file?.originalname || 'Document').trim();
  try {
    const doc = { name: docName, type: type || 'Other', url, uploadedDate: new Date().toISOString().split('T')[0], status: 'pending' };
    const user = await User.findByIdAndUpdate(req.user.id, { $push: { documents: doc } }, { new: true }).select('-password');
    const newDoc = user.documents[user.documents.length - 1];
    res.json(newDoc.toJSON());
  } catch (err) {
    logError('counselors', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// The signed-in counselor's own call stats, workload and activity timeline (same data admins see)
// GET /api/counselors/me/performance?days=1|7|30|90
router.get('/me/performance', authMiddleware, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Counselors only' });
  try {
    const counselor = await User.findById(req.user.id).select('name email smartfloAgent');
    if (!counselor) return res.status(404).json({ message: 'Counselor not found' });
    res.json(await buildCounselorPerformance(counselor, req.query.days));
  } catch (err) {
    sendServerError(res, err); // logs the details server-side; the client gets a generic message
  }
});

// Get assigned students for the logged-in counselor
router.get('/me/students', authMiddleware, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  try {
    const counselor = await User.findById(req.user.id).select('assignedStudents');
    if (!counselor) return res.status(404).json({ message: 'Not found' });
    const students = await User.find({ _id: { $in: counselor.assignedStudents || [] } }).select('-password');
    res.json(students.map(s => s.toJSON()));
  } catch (err) {
    logError('counselors', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete own document (counselor)
router.delete('/me/documents/:docId', authMiddleware, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { documents: { _id: req.params.docId } } });
    res.json({ message: 'Document deleted' });
  } catch (err) {
    logError('counselors', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
