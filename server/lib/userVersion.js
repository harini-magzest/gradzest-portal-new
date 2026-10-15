// A counter that goes up every time a user record is written through Mongoose.
//
// Things that are expensive to compute from the whole users collection and only change when a user does (the student
// list's tab counts and country list) can be remembered against this number: while it has not moved, the answer
// cannot have changed, and the moment any write happens the remembered answer is dropped. No guessing a TTL for
// "how fresh must this be".
//
// It only sees writes made in this process. Another server instance, or a script writing straight to the collection,
// does not move it, so the readers also keep a short TTL as a backstop. The one raw write in the app
// (lib/studentData.js, erasing a student) calls bump() itself.

let version = 0;

const current = () => version;
const bump = () => { version += 1; };

/** Mongoose plugin: bump on every write operation the model can perform. */
function plugin(schema) {
  const everywhere = ['save', 'insertMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'updateMany', 'deleteMany', 'bulkWrite'];
  for (const op of everywhere) schema.post(op, function afterWrite() { bump(); });
  // These exist both on a document and on a query, and both are writes.
  for (const op of ['updateOne', 'deleteOne', 'replaceOne']) {
    schema.post(op, { document: true, query: true }, function afterWrite() { bump(); });
  }
}

module.exports = { current, bump, plugin };
