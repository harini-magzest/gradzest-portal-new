import { afterAll, beforeAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';

// These must be set before any test file requires server/app.js or its models —
// Vitest runs setupFiles before a test file's own top-level requires, so setting
// them here (rather than lazily inside beforeAll) is what makes that ordering hold.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.SOC_OWNER_RECHECK_MS = '300'; // so the live-feed owner re-check can be observed in a test
process.env.SOC_OWNER_EMAILS = '@example.com,owner@soc.test';
process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64);
// A developer's real model keys live in server/.env, and dotenv does not override variables that are already set —
// blanking them here guarantees no test can reach a real model API (slow, flaky, and it spends the key's quota).
// Tests that exercise a model backend inject a fake client or set a dummy key themselves.
// app.js refuses to load without a MONGODB_URI, and dotenv would otherwise fill it from a developer's real
// server/.env (the live database). Pin a dummy first: a machine with no .env (a fresh clone, CI) can run the
// suite, and no test can ever see the real address. beforeAll below swaps in the in-memory server's URI.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/never-used-replaced-in-beforeAll';
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.ZEST_RETRY_BASE_MS = '1'; // retries are exercised in tests; don't make them wait

let mongod: MongoMemoryServer;

beforeAll(async () => {
  // mongod's own startup (WiredTiger init, etc.) can take 20s+ in this environment —
  // well past mongodb-memory-server's 10s default launch timeout.
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  process.env.MONGODB_URI = mongod.getUri();

  // connectDB() retries forever on failure by design (see server/db.js) — a broken
  // memory-server startup should fail the suite fast instead of hanging it.
  const { connectDB, mongoose } = require('../db');
  await Promise.race([
    connectDB(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MongoDB memory server failed to connect within 45s')), 45000),
    ),
  ]);
  // Silence noisy dev-mode logs during test runs.
  mongoose.connection.removeAllListeners('connected');
}, 90000);

afterAll(async () => {
  const { mongoose } = require('../db');
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
