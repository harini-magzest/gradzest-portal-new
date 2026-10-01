// Mongoose plugin: encrypts the listed string paths on write and decrypts them on read.
//
//   schema.plugin(encryptedFields, { fields: ['email', 'ip'] });
//
// Writes: a setter on each path encrypts on save/create/insertMany, $set updates and query filters
// (so `find({ ip: '1.2.3.4' })` still matches). Reads: post hooks decrypt hydrated documents, lean()
// results, distinct() and aggregate() output in place, so the rest of the app only ever sees plaintext.
// There are deliberately no getters, so a document serialised without them can never leak ciphertext.
//
// Aggregation $match stages are not cast by Mongoose: to match a specific value there, wrap it in
// encrypt() from fieldCrypto. Substring/regex matching on an encrypted path cannot work.

const { encrypt, decrypt, decryptDeep } = require('./fieldCrypto');

function decryptResult(res) {
  if (!res) return;
  if (Array.isArray(res)) { for (let i = 0; i < res.length; i++) { if (typeof res[i] === 'string') res[i] = decrypt(res[i]); else decryptResult(res[i]); } return; }
  if (res._doc) decryptDeep(res._doc);
  else decryptDeep(res);
}

module.exports = function encryptedFields(schema, { fields }) {
  for (const p of fields) {
    const type = schema.path(p);
    if (!type) throw new Error(`encryptedFields: unknown path "${p}"`);
    // ObjectIds and numbers are cast to strings later by Mongoose; stringify them first so they encrypt too.
    type.set((v) => (typeof v === 'string' ? encrypt(v) : (v && v._bsontype === 'ObjectId' ? encrypt(String(v)) : v)));
  }

  const reads = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'distinct'];
  for (const op of reads) schema.post(op, function (res) { decryptResult(res); });
  schema.post('save', function (doc) { decryptResult(doc); });
  schema.post('insertMany', function (docs) { decryptResult(docs); });
  schema.post('aggregate', function (res) { decryptResult(res); });
};
