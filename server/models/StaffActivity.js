const mongoose = require('mongoose');

// Audit trail of actions taken by staff (counselors, admins, application team).
// Powers the per-counselor timeline on the admin Counselor Performance page.
const StaffActivitySchema = new mongoose.Schema({
  actorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName:   { type: String, default: '' },
  actorRole:   { type: String, default: '' },
  // 'stage' | 'application' | 'comment' | 'document' | 'note' | 'meeting' | 'call'
  kind:        { type: String, required: true },
  title:       { type: String, required: true },
  detail:      { type: String, default: '' },
  studentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  studentName: { type: String, default: '' },
}, { timestamps: true });

StaffActivitySchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model('StaffActivity', StaffActivitySchema);
