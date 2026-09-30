const mongoose = require('mongoose');

// "When <trigger>, if <conditions>, then <actions>" — evaluated by lib/automation.js.
const ConditionSchema = new mongoose.Schema({
  field: { type: String, required: true },
  op:    { type: String, required: true },
  value: { type: String, default: '' },
}, { _id: false });

const ActionSchema = new mongoose.Schema({
  type: {
    type: String, required: true,
    enum: ['send_email', 'send_notification', 'create_task', 'assign_counselor', 'change_stage'],
  },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationTemplate', default: null },
  // Who receives an email / notification / task: student | counselor | admins | role | user
  recipient:  { type: String, default: 'student' },
  roleId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // create_task
  taskTitle:    { type: String, default: '' },
  taskDescription: { type: String, default: '' },
  taskPriority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  taskDueDays:  { type: Number, default: 1 },
  // change_stage
  leadStage:  { type: String, default: '' },
}, { _id: false });

const AutomationRuleSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  active:      { type: Boolean, default: true },
  trigger:     { type: String, required: true },
  // schedule.daily only: hour of day (0–23, IST) the rule is checked
  scheduleHour: { type: Number, default: 9, min: 0, max: 23 },
  conditionMatch: { type: String, enum: ['all', 'any'], default: 'all' },
  conditions:  [ConditionSchema],
  actions:     [ActionSchema],
  runCount:    { type: Number, default: 0 },
  lastRunAt:   { type: Date, default: null },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

AutomationRuleSchema.index({ trigger: 1, active: 1 });

module.exports = mongoose.model('AutomationRule', AutomationRuleSchema);
