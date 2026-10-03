const mongoose = require('mongoose');

// What was discussed on a call, written by the staff member after it ends.
// callId is the in-app call message's _id, or `sf-<id>` for a Smartflo phone call.
const CallSummarySchema = new mongoose.Schema({
  callId:        { type: String, required: true, unique: true },
  source:        { type: String, enum: ['in_app', 'smartflo'], default: 'in_app' },
  summary:       { type: String, required: true, maxlength: 4000 },
  authorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName:    { type: String, default: '' },
  otherPartyId:  { type: String, default: '' },
  otherPartyName:{ type: String, default: '' },
  callStartedAt: { type: Date, default: null },
}, { timestamps: true });

CallSummarySchema.index({ authorId: 1, callStartedAt: -1 });

module.exports = mongoose.model('CallSummary', CallSummarySchema);
