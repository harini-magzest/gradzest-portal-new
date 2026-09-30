const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const { scanUploadedFile } = require('../middleware/scanUpload');
const { uploadToS3IfConfigured } = require('../middleware/uploadToS3IfConfigured');

const router = express.Router();

// Get own profile (counselor)
router.get('/me', authMiddleware, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update own profile (counselor)
router.put('/me', authMiddleware, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  const { password, role, _id, ...updates } = req.body;
  try {
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.toJSON());
  } catch {
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
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload own document (counselor) — multipart/form-data with optional file
router.post('/me/documents', authMiddleware, upload.single('file'), scanUploadedFile, uploadToS3IfConfigured, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  const { name, type } = req.body;
  const url = req.file ? (req.file.s3Url || `/uploads/${req.file.filename}`) : undefined;
  const docName = (name || req.file?.originalname || 'Document').trim();
  try {
    const doc = { name: docName, type: type || 'Other', url, uploadedDate: new Date().toISOString().split('T')[0], status: 'pending' };
    const user = await User.findByIdAndUpdate(req.user.id, { $push: { documents: doc } }, { new: true }).select('-password');
    const newDoc = user.documents[user.documents.length - 1];
    res.json(newDoc.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
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
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete own document (counselor)
router.delete('/me/documents/:docId', authMiddleware, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { documents: { _id: req.params.docId } } });
    res.json({ message: 'Document deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
