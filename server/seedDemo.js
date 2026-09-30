/**
 * Creates three demo accounts (student/counselor/admin — including a full
 * admin account) for local testing. Run once: node server/seedDemo.js
 *
 * Passwords are generated randomly, not hardcoded — nothing in the frontend
 * actually references fixed demo credentials (checked: no "demo123" or
 * these emails anywhere in src/), so a fixed, guessable password here would
 * be pure risk with no feature depending on it. Each run prints the
 * generated password to the console so whoever ran it locally can use it.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');

const DEMOS = [
  { name: 'Demo Student', email: 'student@demo.com', role: 'student' },
  { name: 'Demo Counselor', email: 'counselor@demo.com', role: 'counselor' },
  { name: 'Demo Admin', email: 'admin@demo.com', role: 'admin' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  for (const demo of DEMOS) {
    const exists = await User.findOne({ email: demo.email });
    if (exists) {
      console.log(`  skip  ${demo.email} (already exists)`);
      continue;
    }
    const password = crypto.randomBytes(6).toString('hex');
    const hashed = await bcrypt.hash(password, 10);
    await User.create({
      name: demo.name,
      email: demo.email,
      password: hashed,
      role: demo.role,
      status: 'active',
      joinedDate: new Date().toISOString().split('T')[0],
    });
    console.log(`  created ${demo.email} / ${password}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(err => { console.error(err); process.exit(1); });
