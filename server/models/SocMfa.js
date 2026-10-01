const mongoose = require('mongoose');

// Two-factor state for a SOC owner. The TOTP secret is encrypted at rest (DATA_ENCRYPTION_KEY) like the rest of the
// SOC data, and recovery codes are stored only as hashes — the plaintext is shown once at enrolment and never again.
const socMfaSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    secret: { type: String, default: '' },
    enabled: { type: Boolean, default: false },       // false while enrolment is pending confirmation
    enrolledAt: { type: Date, default: null },
    lastUsedStep: { type: Number, default: 0 },        // newest TOTP step already accepted: stops code replay
    recoveryHashes: { type: [String], default: [] },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    // SOC step-up tokens issued before this moment are void (set on sign-out, lockout and reset).
    revokedBefore: { type: Date, default: null },
  },
  { timestamps: true },
);

socMfaSchema.plugin(require('../lib/encryptedFields'), { fields: ['secret'] });

module.exports = mongoose.model('SocMfa', socMfaSchema);
