const express = require('express');
const { logError } = require('../lib/logError');
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const { isWhatsAppConfigured } = require('../lib/whatsapp');

const router = express.Router();

// GET /api/notifications — latest 50 for logged-in user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const notifs = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifs);
  } catch (err) {
    logError('notifications', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/notifications — save a new notification (called from frontend)
router.post('/', authMiddleware, async (req, res) => {
  const { type, priority, title, message, link } = req.body;
  if (!title || !message) return res.status(400).json({ message: 'title and message required' });
  try {
    // Dedup: skip if same title already saved for this user in last 60 seconds
    const recent = await Notification.findOne({
      userId: req.user.id,
      title,
      createdAt: { $gt: new Date(Date.now() - 60_000) },
    });
    if (recent) return res.status(200).json(recent);

    const notif = await Notification.create({ userId: req.user.id, type, priority, title, message, link });
    res.status(201).json(notif);
  } catch (err) {
    logError('notifications', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET/PUT /api/notifications/preferences — which channels the signed-in user wants reminders on
const prefsOf = (user) => ({
  email: user?.notificationPrefs?.email !== false,
  whatsapp: user?.notificationPrefs?.whatsapp === true,
  whatsappAvailable: isWhatsAppConfigured(),
  hasPhone: !!user?.phone,
});

router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    res.json(prefsOf(await User.findById(req.user.id).select('phone notificationPrefs').lean()));
  } catch (err) {
    logError('notifications', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/preferences', authMiddleware, async (req, res) => {
  const set = {};
  for (const key of ['email', 'whatsapp']) {
    if (req.body[key] === undefined) continue;
    if (typeof req.body[key] !== 'boolean') return res.status(400).json({ message: `${key} must be true or false` });
    set[`notificationPrefs.${key}`] = req.body[key];
  }
  if (!Object.keys(set).length) return res.status(400).json({ message: 'Nothing to update' });
  try {
    const user = await User.findByIdAndUpdate(req.user.id, { $set: set }, { new: true }).select('phone notificationPrefs').lean();
    if (set['notificationPrefs.whatsapp'] && !user?.phone) {
      // Allow saving, but say why nothing will arrive yet.
      return res.json({ ...prefsOf(user), warning: 'Add a phone number to your profile to receive WhatsApp messages.' });
    }
    res.json(prefsOf(user));
  } catch (err) {
    logError('notifications', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/notifications/read-all — must be before /:id routes
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
    res.json({ message: 'All marked as read' });
  } catch (err) {
    logError('notifications', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: 'Not found' });
    res.json(notif);
  } catch (err) {
    logError('notifications', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/notifications — clear all for user
router.delete('/', authMiddleware, async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user.id });
    res.json({ message: 'Cleared' });
  } catch (err) {
    logError('notifications', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/notifications/:id — dismiss one
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'Deleted' });
  } catch (err) {
    logError('notifications', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
