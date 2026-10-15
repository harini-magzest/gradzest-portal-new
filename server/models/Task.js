const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  author:     { type: String, required: true },
  authorRole: { type: String, default: '' },
  text:       { type: String, required: true },
}, { timestamps: true });

// One entry per status change, so the task's progress can be followed over time
const StatusChangeSchema = new mongoose.Schema({
  from:     { type: String, default: '' },
  to:       { type: String, required: true },
  note:     { type: String, default: '' },
  by:       { type: String, default: '' },
  byRole:   { type: String, default: '' },
}, { timestamps: true });

const TASK_STATUSES = ['pending', 'in_progress', 'on_hold', 'completed'];

const TaskSchema = new mongoose.Schema({
  title:          { type: String, required: true },
  description:    { type: String, default: '' },
  assignedTo:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedToName: { type: String, default: '' },
  // Assignee's department: 'student' | 'counselor' | 'appteam' | 'admin'
  assignedToRole: { type: String, default: '' },
  assignedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedByName: { type: String, default: '' },
  priority:       { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  dueDate:        { type: String, default: '' },
  status:         { type: String, enum: TASK_STATUSES, default: 'pending' },
  comments:       [CommentSchema],
  history:        [StatusChangeSchema],
  // Set when the task is a follow-up for a website subscriber lead
  subscriberId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber', default: null },
  // Set when the task was created from a student's record
  studentId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  studentName:    { type: String, default: '' },
}, { timestamps: true });

TaskSchema.index({ assignedTo: 1, createdAt: -1 });
TaskSchema.index({ assignedBy: 1, createdAt: -1 });
TaskSchema.index({ studentId: 1, createdAt: -1 });

module.exports = mongoose.model('Task', TaskSchema);
module.exports.TASK_STATUSES = TASK_STATUSES;
