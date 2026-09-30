const mongoose = require('mongoose');

// An allowlist entry: matching activity from this IP/CIDR (or for this
// email) no longer opens new incidents. Events are still recorded — only
// incident creation is suppressed — so the audit trail stays complete.
const suppressionRuleSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['ip', 'email'], required: true },
    value: { type: String, required: true },
    // Empty = suppress every rule type for this subject.
    incidentTypes: { type: [String], default: [] },
    reason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

suppressionRuleSchema.index({ kind: 1, value: 1 });
// Removes expired rules automatically; documents without expiresAt never expire.
suppressionRuleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SuppressionRule', suppressionRuleSchema);
