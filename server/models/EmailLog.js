const mongoose = require('mongoose');

// Every email Gradzest sends to a student (automatic or written by staff), for the
// Emails tab on the student record.
const EmailLogSchema = new mongoose.Schema({
  studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to:         { type: String, required: true },
  subject:    { type: String, default: '' },
  html:       { type: String, default: '' },
  kind:       { type: String, enum: ['auto', 'manual'], default: 'auto' },
  sentById:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sentByName: { type: String, default: '' },
  status:     { type: String, enum: ['sent', 'failed'], required: true },
  error:      { type: String, default: '' },
}, { timestamps: true });

EmailLogSchema.index({ studentId: 1, createdAt: -1 });

module.exports = mongoose.model('EmailLog', EmailLogSchema);
