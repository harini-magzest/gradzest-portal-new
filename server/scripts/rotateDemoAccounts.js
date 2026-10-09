// Takes the demo accounts out of reach. Their passwords were in the source code, so they are still in git history
// and must be treated as public:
//   admin@eduabroad.com, kavitha@eduabroad.com, rajesh@eduabroad.com, aryan@example.com
//
//   node scripts/rotateDemoAccounts.js                   dry run (the default): shows what would change, changes nothing
//   node scripts/rotateDemoAccounts.js --apply           a new random password for each account
//   node scripts/rotateDemoAccounts.js --delete --apply  delete the accounts instead
//
// Either way every session ends at once: refresh tokens are cleared, and access tokens issued before now are refused
// on their next use (lib/accountState.js; a running server notices within its 10-second cache).
// New passwords are printed once, to this terminal only. Never redirect the output to a file.
// The database is MONGODB_URI from the environment, or from server/.env when it is not set.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { revokeAllSessions, invalidate } = require('../lib/accountState');

const DEMO_EMAILS = ['admin@eduabroad.com', 'kavitha@eduabroad.com', 'rajesh@eduabroad.com', 'aryan@example.com'];

// 24 random bytes = 32 characters, hashed the same way as every other password in the app (bcryptjs, cost 10)
const newPassword = () => crypto.randomBytes(24).toString('base64url');

/**
 * @returns {Promise<{ email: string, role?: string, sessions?: number, action: string, password?: string }[]>}
 *   `password` is set only for an applied rotation; the caller prints it once.
 */
async function rotateDemoAccounts({ apply = false, remove = false, emails = DEMO_EMAILS } = {}) {
  const results = [];
  for (const email of emails) {
    const user = await User.findOne({ email }).select('role sessions').lean();
    if (!user) {
      results.push({ email, action: 'not found, nothing to do' });
      continue;
    }
    const row = { email, role: user.role, sessions: (user.sessions || []).length };
    if (remove && user.role === 'counselor') {
      // Deleting a counselor would leave their students with a counselorId that points nowhere
      const students = await User.countDocuments({ role: 'student', counselorId: user._id });
      if (students) {
        results.push({ ...row, action: `not deleted: ${students} student(s) still assigned; reassign them or rotate instead` });
        continue;
      }
    }
    if (!apply) {
      results.push({ ...row, action: remove ? 'would delete the account' : 'would set a new password and sign out every session' });
      continue;
    }
    if (remove) {
      await User.deleteOne({ _id: user._id });
      invalidate(user._id); // a deleted account's tokens fail as 'missing' on their next use
      results.push({ ...row, action: 'deleted' });
    } else {
      const password = newPassword();
      // A pending reset link would let someone choose the next password, so it goes too
      await User.updateOne({ _id: user._id }, {
        $set: { password: await bcrypt.hash(password, 10), resetPasswordToken: null, resetPasswordExpires: null },
      });
      await revokeAllSessions(user._id);
      results.push({ ...row, action: 'new password set, every session signed out', password });
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !['--apply', '--delete', '--dry-run'].includes(a));
  if (unknown.length) throw new Error(`Unknown option ${unknown.join(' ')}. Use --dry-run (default), --apply, --delete`);
  const apply = args.includes('--apply') && !args.includes('--dry-run');
  const remove = args.includes('--delete');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (environment or server/.env)');

  const { mongoose } = require('../db'); // applies db.js's DNS fallback for mongodb+srv:// on some Windows setups
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const { host, name } = mongoose.connection;
    console.log(`Database: ${name} on ${host}`);
    console.log(apply ? `APPLYING: ${remove ? 'delete' : 'rotate'}` : 'DRY RUN: nothing will be changed (add --apply to make these changes)');
    const results = await rotateDemoAccounts({ apply, remove });
    for (const r of results) {
      console.log(`  ${r.email.padEnd(24)} ${(r.role || '-').padEnd(10)} ${String(r.sessions ?? '-').padStart(3)} session(s)  ${r.action}`);
    }
    const passwords = results.filter((r) => r.password);
    if (passwords.length) {
      console.log('\nNew passwords, shown once. Put them in your password manager now:');
      for (const r of passwords) console.log(`  ${r.email.padEnd(24)} ${r.password}`);
    }
  } finally {
    mongoose.connection.removeAllListeners('disconnected'); // db.js would log this deliberate disconnect as a dropped connection
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error('Failed:', err.message); process.exitCode = 1; });
}

module.exports = { rotateDemoAccounts, DEMO_EMAILS };
