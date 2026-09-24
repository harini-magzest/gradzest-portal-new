const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  author:     { type: String, required: true },
  authorRole: { type: String, default: '' },
  text:       { type: String, required: true },
}, { timestamps: true });

const TaskSchema = new mongoose.Schema({
  title:          { type: String, required: true },
  description:    { type: String, default: '' },
  assignedTo:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedToName: { type: String, default: '' },
  assignedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedByName: { type: String, default: '' },
  priority:       { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  dueDate:        { type: String, default: '' },
  status:         { type: String, enum: ['pending', 'completed'], default: 'pending' },
  comments:       [CommentSchema],
}, { timestamps: true });

TaskSchema.index({ assignedTo: 1, createdAt: -1 });
TaskSchema.index({ assignedBy: 1, createdAt: -1 });

module.exports = mongoose.model('Task', TaskSchema);
