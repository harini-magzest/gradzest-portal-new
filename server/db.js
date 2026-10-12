const dns = require('dns');
const mongoose = require('mongoose');

// On some Windows networks (IPv6 link-local DNS), Node falls back to 127.0.0.1
// and mongodb+srv SRV lookups fail with ECONNREFUSED. Use public resolvers instead.
if (dns.getServers().every((s) => s === '127.0.0.1' || s === '::1')) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

mongoose.connection.on('connected', () =>
  console.log(`[MongoDB] Connected to ${mongoose.connection.name}`)
);
mongoose.connection.on('error', (err) =>
  console.error('[MongoDB] Connection error:', err.message)
);
mongoose.connection.on('disconnected', () =>
  console.warn('[MongoDB] Disconnected — attempting to reconnect...')
);

// Graceful shutdown on SIGINT / SIGTERM
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, async () => {
    // Request-log rows are batched in memory (middleware/requestLogger.js): write them before the connection goes.
    // Loaded here, not at the top, so scripts that only use connectDB() do not pull in the models; capped so a
    // dead database cannot hold the shutdown up.
    try {
      await Promise.race([
        require('./middleware/requestLogger').flushRequestLogs(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch { /* shutting down anyway */ }
    await mongoose.connection.close();
    console.log(`[MongoDB] Connection closed on ${signal}`);
    process.exit(0);
  });
});

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment variables');

  try {
    await mongoose.connect(uri, MONGO_OPTIONS);
  } catch (err) {
    console.error(`[MongoDB] Initial connection failed: ${err.message} — retrying in 5s...`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return connectDB();
  }
}

module.exports = { connectDB, mongoose };
