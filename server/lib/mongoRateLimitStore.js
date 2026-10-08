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

  // True once the database connection is up. During the first seconds after boot it is not, and the limiter used to
  // crash every request with a 500 (reading .collection of undefined). Until then requests pass uncounted; counting
  // starts the moment the connection exists.
  ready() {
    return mongoose.connection.readyState === 1 && !!mongoose.connection.db;
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
    if (!this.ready()) return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
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
    if (!this.ready()) return undefined;
    const row = await this.collection().findOne({ _id: this.id(key), expiresAt: { $gt: new Date() } });
    return row ? { totalHits: row.count, resetTime: row.expiresAt } : undefined;
  }

  async decrement(key) {
    if (!this.ready()) return;
    await this.collection().updateOne({ _id: this.id(key), expiresAt: { $gt: new Date() } }, { $inc: { count: -1 } });
  }

  async resetKey(key) {
    if (!this.ready()) return;
    await this.collection().deleteOne({ _id: this.id(key) });
  }

  async resetAll() {
    if (!this.ready()) return;
    await this.collection().deleteMany({ _id: { $regex: `^${this.prefix}:` } });
  }
}

module.exports = { MongoRateLimitStore };
