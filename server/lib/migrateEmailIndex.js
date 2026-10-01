const User = require('../models/User');

/**
 * One-time swap of the users.email index from "unique" to "unique when present".
 *
 * Email used to be required, so the collection has a plain unique `email_1` index — under it a
 * second student without an email collides on the missing value. Mongoose can't change the
 * options of an existing index, so drop it and build the partial one the schema now declares.
 * Idempotent: does nothing once the partial index is in place.
 */
async function migrateEmailIndex() {
  try {
    const indexes = await User.collection.indexes();
    const current = indexes.find(i => i.name === 'email_1');
    if (current?.partialFilterExpression) return;
    if (current) await User.collection.dropIndex('email_1');
    await User.collection.createIndex(
      { email: 1 },
      { name: 'email_1', unique: true, partialFilterExpression: { email: { $type: 'string' } } },
    );
    console.log('[migrate] users.email index is now unique only when an email is present');
  } catch (err) {
    console.error('[migrate] email index migration failed:', err.message);
  }
}

module.exports = { migrateEmailIndex };
