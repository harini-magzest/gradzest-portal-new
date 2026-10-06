// Student referrals: every student has a short code; someone who signs up with it is linked to the referrer. How far the
// referred student has got is read from their applications each time (nothing to keep in sync), and a referral
// "earns" its reward once the referred student is enrolled.
const crypto = require('crypto');
const User = require('../models/User');
const Referral = require('../models/Referral');

// No 0/O/1/I/L: codes get read out and typed by hand
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateCode() {
  let code = '';
  for (const b of crypto.randomBytes(CODE_LENGTH)) code += ALPHABET[b % ALPHABET.length];
  return code;
}

// Returns the user's code, creating one the first time. A collision with another user's code is retried.
async function ensureCode(userId) {
  const existing = await User.findById(userId).select('referralCode').lean();
  if (!existing) return null;
  if (existing.referralCode) return existing.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const updated = await User.findOneAndUpdate(
        { _id: userId, referralCode: { $exists: false } }, { $set: { referralCode: code } }, { new: true },
      ).select('referralCode').lean();
      if (updated) return updated.referralCode;
      return (await User.findById(userId).select('referralCode').lean())?.referralCode || null; // another request won the race
    } catch (err) {
      if (err.code !== 11000) throw err; // duplicate code: try another
    }
  }
  return null;
}

const STATUS_ORDER = ['signed_up', 'applied', 'offer', 'enrolled'];
const OFFER = ['offer_received', 'accepted'];

/** How far a referred student has got. */
function progressOf(student) {
  const apps = student?.applications || [];
  if (apps.some((a) => a.status === 'enrolled')) return 'enrolled';
  if (apps.some((a) => OFFER.includes(a.status))) return 'offer';
  if (apps.some((a) => a.status && a.status !== 'draft')) return 'applied';
  return 'signed_up';
}

/** "Asha Kumar" -> "Asha K." so a referrer sees who joined without their full name being shared. */
function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A friend';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// Links a newly created user to whoever's code they signed up with. Never throws: a bad or unknown code must not
// stop someone from signing up.
async function recordReferral(code, newUser) {
  try {
    const clean = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(clean)) return null;
    const referrer = await User.findOne({ referralCode: clean }).select('_id email').lean();
    if (!referrer || String(referrer._id) === String(newUser._id)) return null;
    if (referrer.email && newUser.email && referrer.email.toLowerCase() === newUser.email.toLowerCase()) return null;
    return await Referral.create({ referrerId: String(referrer._id), referredId: String(newUser._id) });
  } catch (err) {
    if (err.code !== 11000) console.error('[referrals] could not record referral:', err.message);
    return null;
  }
}

module.exports = { generateCode, ensureCode, progressOf, maskName, recordReferral, STATUS_ORDER };
