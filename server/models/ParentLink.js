const mongoose = require('mongoose');

// A read-only link a student gives a parent or guardian. Only a hash of the secret is stored, so a database leak does
// not expose working links; the link itself is shown once, when it is created.
const ParentLinkSchema = new mongoose.Schema({
  studentId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  label: { type: String, default: '', maxlength: 60 }, // e.g. "Mum"
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  lastViewedAt: Date,
  viewCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('ParentLink', ParentLinkSchema);
