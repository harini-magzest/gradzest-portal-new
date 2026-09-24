/**
 * Creates the three demo accounts used in the login modal.
 * Run once: node server/seedDemo.js
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');

const DEMOS = [
  { name: 'Demo Student', email: 'student@demo.com', password: 'demo123', role: 'student' },
  { name: 'Demo Counselor', email: 'counselor@demo.com', password: 'demo123', role: 'counselor' },
  { name: 'Demo Admin', email: 'admin@demo.com', password: 'demo123', role: 'admin' },
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
    const hashed = await bcrypt.hash(demo.password, 10);
    await User.create({
      name: demo.name,
      email: demo.email,
      password: hashed,
      role: demo.role,
      status: 'active',
      joinedDate: new Date().toISOString().split('T')[0],
    });
    console.log(`  created ${demo.email}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(err => { console.error(err); process.exit(1); });
