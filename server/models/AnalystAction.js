const mongoose = require('mongoose');

// Permanent audit trail of state-changing actions an analyst took from the
// SOC dashboard (block/unblock an IP, revoke a user's sessions, change an
// incident's status/assignment). No TTL — same reasoning as SecurityIncident:
// this collection is the record of what was done and by whom.
const analystActionSchema = new mongoose.Schema(
  {
    analystId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    analystEmail: { type: String, default: '' },
    action: {
      type: String,
      enum: ['block_ip', 'unblock_ip', 'revoke_user_sessions', 'incident_status_change', 'incident_assigned',
        'bulk_block_ip', 'revoke_session', 'force_password_reset', 'add_suppression', 'remove_suppression', 'lock_account', 'unlock_account', 'review_upload', 'quarantine_upload', 'restore_upload', 'purge_upload'],
      required: true,
    },
    targetType: { type: String, enum: ['ip', 'user', 'incident', 'session', 'suppression', 'upload'], required: true },
    targetId: { type: String, required: true },
    reason: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Hash chain: each entry commits to the previous entry's hash, so editing
    // or deleting a past row breaks verification of everything after it.
    // Rows written before this existed have no hash and are skipped.
    prevHash: { type: String, default: '' },
    hash: { type: String, default: '' },
  },
  { timestamps: true },
);

analystActionSchema.index({ analystId: 1, createdAt: -1 });
analystActionSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
analystActionSchema.index({ createdAt: -1 });

analystActionSchema.plugin(require('../lib/encryptedFields'), { fields: ['analystEmail','targetId','reason'] });

module.exports = mongoose.model('AnalystAction', analystActionSchema);
