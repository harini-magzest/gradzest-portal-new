const mongoose = require('mongoose');

// One row per referred student (they can only have been referred once). Progress is not stored here: it is worked out
// from the referred student's applications when needed (see lib/referrals.js).
const ReferralSchema = new mongoose.Schema({
  referrerId: { type: String, required: true, index: true },
  referredId: { type: String, required: true, unique: true },
  // Set by an admin once the reward has been given out
  paidAt: Date,
  paidBy: String,
  paidNote: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Referral', ReferralSchema);
