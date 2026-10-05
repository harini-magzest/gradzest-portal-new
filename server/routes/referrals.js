const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Referral = require('../models/Referral');
const authMiddleware = require('../middleware/auth');
const { sendServerError } = require('../lib/httpError');
const { ensureCode, progressOf, maskName } = require('../lib/referrals');

const router = express.Router();

const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';

// A student's own code, share link and the people who signed up with it. Names are shortened ("Asha K.") and no
// contact details are included.
router.get('/me', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  try {
    const code = await ensureCode(req.user.id);
    if (!code) return res.status(500).json({ message: 'Could not create your referral code' });
    const referrals = await Referral.find({ referrerId: String(req.user.id) }).sort({ createdAt: -1 }).lean();
    const referred = await User.find({ _id: { $in: referrals.map((r) => r.referredId) } }).select('name applications').lean();
    const byId = new Map(referred.map((u) => [String(u._id), u]));
    const rows = referrals.map((r) => {
      const status = progressOf(byId.get(r.referredId));
      return { name: maskName(byId.get(r.referredId)?.name), status, rewardEarned: status === 'enrolled', rewardPaid: !!r.paidAt, joinedAt: r.createdAt };
    });
    res.json({
      code, link: `${frontendUrl()}/?ref=${code}`, rewardText: process.env.REFERRAL_REWARD_TEXT || '', referrals: rows,
      stats: { total: rows.length, enrolled: rows.filter((r) => r.rewardEarned).length, paid: rows.filter((r) => r.rewardPaid).length },
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Forbidden' }));

// Every referral, for the admin who hands out rewards
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const referrals = await Referral.find().sort({ createdAt: -1 }).limit(500).lean();
    const ids = [...new Set(referrals.flatMap((r) => [r.referrerId, r.referredId]))];
    const users = await User.find({ _id: { $in: ids } }).select('name email applications').lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const rows = referrals.map((r) => {
      const status = progressOf(byId.get(r.referredId));
      return {
        id: String(r._id),
        referrerName: byId.get(r.referrerId)?.name || 'Unknown', referrerEmail: byId.get(r.referrerId)?.email || '',
        referredName: byId.get(r.referredId)?.name || 'Unknown',
        status, rewardEarned: status === 'enrolled', paid: !!r.paidAt, paidAt: r.paidAt || null, paidNote: r.paidNote || '', createdAt: r.createdAt,
      };
    });
    res.json({ referrals: rows, stats: { total: rows.length, earned: rows.filter((r) => r.rewardEarned).length, owed: rows.filter((r) => r.rewardEarned && !r.paid).length } });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Mark a reward as given (or undo it). Only referrals whose student has enrolled have a reward to give.
router.put('/:id/paid', authMiddleware, adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Referral not found' });
  if (typeof req.body?.paid !== 'boolean') return res.status(400).json({ message: 'paid must be true or false' });
  try {
    const referral = await Referral.findById(req.params.id);
    if (!referral) return res.status(404).json({ message: 'Referral not found' });
    if (req.body.paid) {
      const referred = await User.findById(referral.referredId).select('applications').lean();
      if (progressOf(referred) !== 'enrolled') return res.status(409).json({ message: 'The referred student has not enrolled yet' });
      referral.paidAt = new Date();
      referral.paidBy = String(req.user.id);
      referral.paidNote = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
    } else {
      referral.paidAt = undefined;
      referral.paidBy = undefined;
      referral.paidNote = '';
    }
    await referral.save();
    res.json({ id: String(referral._id), paid: !!referral.paidAt, paidAt: referral.paidAt || null, paidNote: referral.paidNote });
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
