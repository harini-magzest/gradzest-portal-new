const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  name:         { type: String, default: '' },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:        { type: String, default: '' },
  subscribedAt: { type: Date, default: Date.now },
  // Admin follow-up tracking
  leadStatus:   { type: String, enum: ['new', 'contacted', 'interested', 'converted', 'not_interested'], default: 'new' },
  notes:        { type: String, default: '' },
  contactedAt:  { type: Date },
  // Follow-up task assigned to a counselor
  assignedTo:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedToName: { type: String, default: '' },
  taskId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
});

// The admin list pages newest first (lib/adminLists.js)
subscriberSchema.index({ subscribedAt: -1 });

module.exports = mongoose.model('Subscriber', subscriberSchema);
