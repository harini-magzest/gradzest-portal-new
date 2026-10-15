// Tests every outside service the server is set up to use and says which ones actually work. Read-only: it sends no email
// or WhatsApp message, writes nothing to the database and never prints a key.
//
//   npm run check:integrations          (from server/)
//
// "skipped" means the service is not configured, which is fine. Exit code 1 only when something that IS configured fails.
// For which variables are missing altogether, see scripts/checkEnv.js.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { runChecks, hasFailures } = require('../lib/integrationsCheck');

const LABEL = { ok: 'OK      ', fail: 'FAILED  ', skipped: 'skipped ', configured: 'set     ' };

async function pingDatabase() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try { await mongoose.connection.db.admin().ping(); } finally { await mongoose.disconnect(); }
}

async function verifyMailer({ host, port, secure, user, pass }) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass }, connectionTimeout: 8000, greetingTimeout: 8000 });
  try { await transporter.verify(); } finally { transporter.close(); }
}

async function headBucket({ region, bucket }) {
  const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({ region });
  try { await client.send(new HeadBucketCommand({ Bucket: bucket })); } finally { client.destroy(); }
}

(async () => {
  const results = await runChecks({ pingDatabase, verifyMailer, headBucket });
  const width = Math.max(...results.map((r) => r.name.length));
  console.log('');
  for (const r of results) console.log(`${LABEL[r.status] || r.status}  ${r.name.padEnd(width)}  ${r.detail}`);
  const failed = results.filter((r) => r.status === 'fail').length;
  console.log(`\n${failed ? `${failed} service${failed === 1 ? '' : 's'} not working.` : 'Everything that is configured is working.'}`);
  process.exit(hasFailures(results) ? 1 : 0);
})().catch((err) => {
  // Never print err.stack or the raw error: a driver error can carry a connection string.
  console.error('check failed:', String(err?.message || err).split('\n')[0].replace(/\b[a-z+]+:\/\/\S+/gi, '<url>'));
  process.exit(2);
});
