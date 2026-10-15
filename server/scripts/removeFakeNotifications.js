// Removes notifications that were never about anything real. The browser used to create and save
// these itself, before notifications became server-pushed only:
//   - demo "discount" offers shown to every student on first login
//   - guessed alerts ("Offer Expires Soon!", "Document Pending Upload", "Follow Up Required",
//     "Applications Need Attention") worked out in the browser from stale or misread data
//   - pop-ups for the made-up sample events the dev-only POST /api/activity/seed inserts
//   - "Document Rejected … Please re-upload" sent when a document was actually verified
//
// Dry run by default (counts only). Run with --apply to delete.
//   node scripts/removeFakeNotifications.js           # show what would be removed
//   node scripts/removeFakeNotifications.js --apply   # remove it
// Needs MONGODB_URI in server/.env.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// Loading db.js applies its DNS fallback, which mongodb+srv:// addresses need on some Windows setups
const { mongoose } = require('../db');
const Notification = require('../models/Notification');

// The sample actions in routes/activity.js (POST /seed); their pop-ups were titled "⚡ <action>" or "📌 <action>"
const SEEDED_ACTIONS = [
  'submitted new enquiry', 'visa application approved', 'made payment', 'document deadline in 3 days',
  'received university offer', 'uploaded documents', 'visa interview scheduled',
];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CATEGORIES = [
  { label: 'Demo discount offers', filter: { type: 'discount' } },
  {
    label: 'Browser-guessed alerts',
    filter: { title: { $in: ['⚠️ Offer Expires Soon!', '📄 Document Pending Upload', '💬 Follow Up Required', '📊 Applications Need Attention'] } },
  },
  {
    label: 'Pop-ups for seeded sample activity',
    filter: { title: { $in: SEEDED_ACTIONS.flatMap(a => [`⚡ ${a}`, `📌 ${a}`]) } },
  },
  {
    label: '"Document Rejected" sent for a verified document',
    filter: { title: '❌ Document Rejected', message: { $regex: `has been verified\\.${escape(' Please re-upload.')}$` } },
  },
];

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set in server/.env');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(apply ? 'Removing fake notifications…' : 'Dry run (nothing is deleted). Re-run with --apply to delete.');

  let total = 0;
  for (const c of CATEGORIES) {
    const count = await Notification.countDocuments(c.filter);
    total += count;
    if (apply && count) await Notification.deleteMany(c.filter);
    console.log(`  ${String(count).padStart(5)}  ${c.label}`);
  }
  console.log(`  ${String(total).padStart(5)}  ${apply ? 'removed' : 'would be removed'} in total`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
