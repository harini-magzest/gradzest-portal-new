const mongoose = require('mongoose');

// Records every time a counselor/admin views a student's sensitive fields —
// this collection IS the compliance/audit record (who accessed whose PII,
// when), so unlike SecurityEvent it has no TTL: auto-deleting it would
// defeat its purpose.
const piiAccessLogSchema = new mongoose.Schema(
  {
    accessorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    accessorEmail: { type: String, default: '' },
    accessorRole: { type: String, default: '' },
    applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    applicantEmail: { type: String, default: '' },
    fieldsAccessed: [{ type: String }],
    accessType: { type: String, enum: ['view', 'list'], default: 'view' },
    ip: { type: String, default: '' },
  },
  { timestamps: true },
);

piiAccessLogSchema.index({ accessorId: 1, createdAt: -1 });
piiAccessLogSchema.index({ applicantId: 1, createdAt: -1 });
piiAccessLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PiiAccessLog', piiAccessLogSchema);
