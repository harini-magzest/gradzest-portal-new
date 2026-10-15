const mongoose = require('mongoose');

// One entry per rule execution, shown on the admin Automation → Logs tab.
const AutomationLogSchema = new mongoose.Schema({
  ruleId:      { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationRule', required: true },
  ruleName:    { type: String, default: '' },
  trigger:     { type: String, default: '' },
  studentId:   { type: mongoose.Schema.Types.ObjectId, default: null },
  studentName: { type: String, default: '' },
  status:      { type: String, enum: ['success', 'partial', 'failed'], default: 'success' },
  actions: [{
    _id: false,
    type:   { type: String }, // object form: a bare `type: String` makes Mongoose treat the whole entry as a string
    status: { type: String, enum: ['success', 'failed', 'skipped'] },
    detail: String,
  }],
}, { timestamps: true });

AutomationLogSchema.index({ createdAt: -1 });
AutomationLogSchema.index({ ruleId: 1, studentId: 1, createdAt: -1 });

module.exports = mongoose.model('AutomationLog', AutomationLogSchema);
