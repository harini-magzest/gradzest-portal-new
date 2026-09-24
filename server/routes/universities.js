const express = require('express');
const mongoose = require('mongoose');
const University = require('../models/University');
const { fetchEnrichmentData } = require('../lib/enrichUniversity');

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
    res.status(500).json({ message: err.message || 'Server error' });
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
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
