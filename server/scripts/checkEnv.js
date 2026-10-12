// Reports which environment variables are missing, by NAME only (never prints a value).
// Run after pulling or setting up a machine:  node scripts/checkEnv.js
// Secrets are not in git: get the values from whoever owns them (password manager / secure channel), put them in
// server/.env, and use .env.example as the list of what to fill in.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const REQUIRED = [
  ['MONGODB_URI', 'database connection string'],
  ['JWT_SECRET', 'signs login tokens'],
  ['DATA_ENCRYPTION_KEY', '64 hex chars; encrypts SOC data at rest (openssl rand -hex 32)'],
  ['SOC_OWNER_EMAILS', 'who may open the SOC'],
  ['FRONTEND_URL', 'e.g. http://localhost:5173'],
  ['SMTP_HOST', 'email'], ['SMTP_PORT', 'email'], ['SMTP_USER', 'email'], ['SMTP_PASS', 'email'], ['SMTP_FROM', 'email'],
  ['GOOGLE_CLIENT_ID', 'Google sign-in'], ['GOOGLE_CLIENT_SECRET', 'Google sign-in'],
];
// At least one of these must be set for Zest to answer (Anthropic is preferred; Gemini is the free fallback).
const ONE_OF = [['ANTHROPIC_API_KEY', 'GEMINI_API_KEY'], 'Zest AI assistant'];

const missing = REQUIRED.filter(([k]) => !process.env[k]);
const [aiKeys, aiWhy] = ONE_OF;
const aiMissing = !aiKeys.some((k) => process.env[k]);

const key = process.env.DATA_ENCRYPTION_KEY;
const problems = [];
if (key && !/^[0-9a-fA-F]{64}$/.test(key)) problems.push('DATA_ENCRYPTION_KEY must be exactly 64 hex characters');
// The same strength rules the server applies at start-up (it refuses to start in production when one fails)
const { secretProblem } = require('../lib/jwt');
if (process.env.JWT_SECRET) {
  const p = secretProblem(process.env.JWT_SECRET, 'JWT_SECRET');
  if (p) problems.push(p);
}
// Signs the short-lived file links. Required in production; a development machine derives one from JWT_SECRET.
if (process.env.FILE_URL_SECRET || process.env.NODE_ENV === 'production') {
  const p = secretProblem(process.env.FILE_URL_SECRET, 'FILE_URL_SECRET');
  if (p) problems.push(p);
  else if (process.env.FILE_URL_SECRET === process.env.JWT_SECRET) problems.push('FILE_URL_SECRET must differ from JWT_SECRET');
}

for (const [k, why] of missing) console.log(`MISSING  ${k}  (${why})`);
if (aiMissing) console.log(`MISSING  one of ${aiKeys.join(' / ')}  (${aiWhy})`);
for (const p of problems) console.log(`INVALID  ${p}`);
const ok = !missing.length && !aiMissing && !problems.length;
console.log(ok ? 'All required environment variables are set.' : '\nCopy server/.env.example to server/.env and fill in the missing values.');
process.exit(ok ? 0 : 1);
