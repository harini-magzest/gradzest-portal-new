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

module.exports = mongoose.model('ZestQueryLog', ZestQueryLogSchema);
