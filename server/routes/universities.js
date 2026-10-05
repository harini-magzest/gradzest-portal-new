const express = require('express');
const { sendServerError } = require('../lib/httpError');
const mongoose = require('mongoose');
const University = require('../models/University');
const { fetchEnrichmentData } = require('../lib/enrichUniversity');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function dbReady(res) {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ message: 'Database not ready — please wait a moment and retry' });
    return false;
  }
  return true;
}

// Auto-fill university details by name (uses 24h in-memory cache)
router.get('/autofill', async (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ message: 'name query param required' });
  try {
    const data = await fetchEnrichmentData(name);
    res.json(data);
  } catch (err) {
    console.error('autofill error:', err.message);
    res.status(500).json({ message: 'Failed to fetch university details' });
  }
});

router.get('/', async (req, res) => {
  if (!dbReady(res)) return;
  try {
    const unis = await University.find({});
    res.json(unis);
  } catch (err) {
    console.error('GET /api/universities error:', err);
    sendServerError(res, err, 'Server error');
  }
});

// PUT /api/universities/:id/courses/:courseId/custom — course tags + custom fields (admins and counselors)
router.put('/:id/courses/:courseId/custom', authMiddleware, async (req, res) => {
  if (!['admin', 'counselor'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  if (!dbReady(res)) return;
  try {
    const { id, courseId } = req.params;
    let uni = await University.findOne({ id });
    if (!uni && mongoose.Types.ObjectId.isValid(id)) uni = await University.findById(id);
    if (!uni) return res.status(404).json({ message: 'University not found' });
    const course = (mongoose.Types.ObjectId.isValid(courseId) && uni.courses.id(courseId)) || uni.courses.find(c => c.id === courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    if (Array.isArray(req.body.tags)) {
      const seen = new Set();
      course.tags = req.body.tags
        .map(t => String(t).trim().slice(0, 40))
        .filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
        .slice(0, 30);
    }
    if (Array.isArray(req.body.customFields)) {
      course.customFields = req.body.customFields
        .map(f => ({ key: String(f?.key || '').trim().slice(0, 60), value: String(f?.value ?? '').trim().slice(0, 200) }))
        .filter(f => f.key && f.value)
        .slice(0, 30);
    }
    await uni.save();
    res.json(course);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.get('/:id', async (req, res) => {
  if (!dbReady(res)) return;
  try {
    const { id } = req.params;
    // Try custom id field first, then fall back to MongoDB _id
    let uni = await University.findOne({ id });
    if (!uni && mongoose.Types.ObjectId.isValid(id)) {
      uni = await University.findById(id);
    }
    if (!uni) return res.status(404).json({ message: 'University not found' });
    res.json(uni);
  } catch (err) {
    console.error('GET /api/universities/:id error:', err);
    sendServerError(res, err, 'Server error');
  }
});

module.exports = router;
