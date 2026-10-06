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
  // True when the answer came from the knowledge-base fallback because the AI was unavailable
  degraded: { type: Boolean, default: false },
  // The asker's thumbs up/down on this answer (POST /api/zest/feedback). The comment is free text, so it is
  // encrypted like the question.
  feedback: {
    rating: { type: String, enum: ['up', 'down'] },
    comment: { type: String, default: '' },
    at: Date,
  },
}, { timestamps: true });

ZestQueryLogSchema.index({ createdAt: -1 });

// Questions and answers routinely contain a student's name, email, application status or document names (Zest's
// lookup tools return them), so the log is encrypted at rest like the other PII-bearing collections. Rows written
// before this was added stay readable: the plugin only decrypts values that are actually ciphertext.
ZestQueryLogSchema.plugin(require('../lib/encryptedFields'), { fields: ['question', 'answer', 'feedback.comment'] });

module.exports = mongoose.model('ZestQueryLog', ZestQueryLogSchema);
