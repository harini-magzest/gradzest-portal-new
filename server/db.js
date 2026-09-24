const mongoose = require('mongoose');

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
