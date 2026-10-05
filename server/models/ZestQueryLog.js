const mongoose = require('mongoose');

// Every question asked of Zest and the answer it gave, so admin can audit what
// the assistant is telling staff/students.
const ZestQueryLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userRole: { type: String, default: '' },
  question: { type: String, required: true },
  answer: { type: String, default: '' },
  sourceDocIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeDocument' }],
  // Names of any live-data tools Zest called to answer this (see lib/zestTools.js) — lets admin
  // audit when Zest pulled real student/task/alert data, not just what it said.
  toolsUsed: [{ type: String }],
}, { timestamps: true });

ZestQueryLogSchema.index({ createdAt: -1 });

// Questions and answers routinely contain a student's name, email, application status or document names (Zest's
// lookup tools return them), so the log is encrypted at rest like the other PII-bearing collections. Rows written
// before this was added stay readable: the plugin only decrypts values that are actually ciphertext.
ZestQueryLogSchema.plugin(require('../lib/encryptedFields'), { fields: ['question', 'answer'] });

module.exports = mongoose.model('ZestQueryLog', ZestQueryLogSchema);
