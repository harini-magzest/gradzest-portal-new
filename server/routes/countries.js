const express = require('express');
const mongoose = require('mongoose');
const Country = require('../models/Country');
const { fetchCountryData } = require('../lib/enrichCountry');

const router = express.Router();

router.get('/autofill', async (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ message: 'name query param required' });
  try {
    const data = await fetchCountryData(name);
    res.json(data);
  } catch (err) {
    console.error('country autofill error:', err.message);
    res.status(500).json({ message: 'Failed to fetch country details' });
  }
});

router.get('/', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Database not ready' });
  }
  try {
    const countries = await Country.find({}).sort({ name: 1 });
    res.json(countries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
