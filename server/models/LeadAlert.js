const mongoose = require('mongoose');

// One flagged row produced by the daily Zest analytics job (jobs/zestDailyAnalytics.js).
// `flaggedOn` is a day bucket (midnight UTC of the run date) so the unique index below
// stops the job from re-creating the same alert every time it runs that day.
const LeadAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  alertType: { type: String, enum: ['stale', 'duplicate', 'overdue_task', 'stuck_application'], required: true },
  severity: { type: String, enum: ['warning', 'urgent'], default: 'warning' },
  detail: { type: String, default: '' },
  counselorId: { type: String, default: '' },
  resolved: { type: Boolean, default: false },
  flaggedOn: { type: Date, required: true },
}, { timestamps: true });

LeadAlertSchema.index({ userId: 1, alertType: 1, flaggedOn: 1 }, { unique: true });
LeadAlertSchema.index({ flaggedOn: -1, resolved: 1 });

module.exports = mongoose.model('LeadAlert', LeadAlertSchema);
