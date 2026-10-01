// Break-glass: removes a SOC owner's two-factor setup so they can enrol again. Needs server access (it talks to the
// database directly), which is the point — it can't be done through the web app, so someone who has only hijacked the
// owner's login can't switch MFA off.
//
//   node scripts/resetSocMfa.js owner@example.com
//
// Needs MONGODB_URI (and DATA_ENCRYPTION_KEY, since the secret is stored encrypted) in server/.env.
// Every SOC step-up token issued so far stops working immediately.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const SocMfa = require('../models/SocMfa');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) { console.error('Usage: node scripts/resetSocMfa.js <owner-email>'); process.exit(1); }
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email }).select('_id email');
  if (!user) { console.error(`No user with email ${email}`); await mongoose.disconnect(); process.exit(1); }
  const res = await SocMfa.deleteOne({ userId: user._id });
  console.log(res.deletedCount ? `Two-factor setup removed for ${email}. They must enrol again at /soc.` : `${email} had no two-factor setup.`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err.message); process.exit(1); });
