const mongoose = require('mongoose');

// express-rate-limit store kept in MongoDB, so the counts are shared by every server
// instance and survive restarts (the default in-memory store does neither).
// Each limiter gets its own prefix; rows expire through a TTL index plus an expiry check
// on every read, so a stale row never counts against a fresh window.
class MongoRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.localKeys = false;
    this.indexed = false;
    this.windowMs = 60000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  collection() {
    return mongoose.connection.db.collection('ratelimits');
  }

  async ensureIndex() {
    if (this.indexed) return;
    await this.collection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    this.indexed = true;
  }

  id(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    await this.ensureIndex();
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    const row = await this.collection().findOneAndUpdate(
      { _id: this.id(key) },
      [{
        $set: {
          count: { $cond: [{ $gt: ['$expiresAt', now] }, { $add: ['$count', 1] }, 1] },
          expiresAt: { $cond: [{ $gt: ['$expiresAt', now] }, '$expiresAt', { $literal: resetAt }] },
        },
      }],
      { upsert: true, returnDocument: 'after' },
    );
    return { totalHits: row.count, resetTime: row.expiresAt };
  }

  async get(key) {
    const row = await this.collection().findOne({ _id: this.id(key), expiresAt: { $gt: new Date() } });
    return row ? { totalHits: row.count, resetTime: row.expiresAt } : undefined;
  }

  async decrement(key) {
    await this.collection().updateOne({ _id: this.id(key), expiresAt: { $gt: new Date() } }, { $inc: { count: -1 } });
  }

  async resetKey(key) {
    await this.collection().deleteOne({ _id: this.id(key) });
  }

  async resetAll() {
    await this.collection().deleteMany({ _id: { $regex: `^${this.prefix}:` } });
  }
}

module.exports = { MongoRateLimitStore };
