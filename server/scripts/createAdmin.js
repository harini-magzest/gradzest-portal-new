// Creates the first full admin on a fresh database, instead of the demo seed's admin@eduabroad.com.
// The password is generated (24 random bytes, shown once) unless ADMIN_PASSWORD is set; either way it is stored hashed.
//
//   ADMIN_EMAIL=you@yourdomain.com ADMIN_NAME="Your Name" node scripts/createAdmin.js
//
// Refuses if an account with that email already exists, so it can't be used to take over an existing user.
// Needs MONGODB_URI in server/.env.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { mongoose } = require('../db'); // applies db.js's DNS fallback for mongodb+srv:// on some Windows setups
const User = require('../models/User');

// Stricter than the sign-up rule: this account can do everything
function checkPasswordStrength(pw) {
  if (pw.length < 12) return 'use at least 12 characters';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'mix upper case, lower case and numbers';
  return null;
}

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const name = String(process.env.ADMIN_NAME || 'Administrator').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set ADMIN_EMAIL to the new admin\'s email address');

  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(24).toString('base64url');
  if (!generated) {
    const problem = checkPasswordStrength(password);
    if (problem) throw new Error(`ADMIN_PASSWORD is too weak: ${problem}`);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  if (await User.exists({ email })) throw new Error(`An account with ${email} already exists; nothing was changed`);
  await User.create({
    name, email, role: 'admin', isAppTeam: false, emailVerified: true,
    password: await bcrypt.hash(password, 12),
  });
  console.log(`Created admin ${email}.`);
  if (generated) console.log(`Password (shown once, store it in your password manager): ${password}`);
}

main()
  .catch((err) => { console.error('Failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect().catch(() => {}));
