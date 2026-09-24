const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

const VALID_STEPS = ['profileComplete', 'documentUploaded', 'counselorViewed', 'universityBrowsed'];

// PUT /api/onboarding/:step — mark a step complete for the current student
router.put('/:step', auth, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  const { step } = req.params;
  if (!VALID_STEPS.includes(step)) return res.status(400).json({ message: 'Invalid step' });
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { [`onboarding.${step}`]: true } },
      { new: true }
    ).select('onboarding');
    res.json(user.onboarding);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
