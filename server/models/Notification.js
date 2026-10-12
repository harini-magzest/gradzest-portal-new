const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  type:     { type: String, default: 'application' },
  priority: { type: String, enum: ['urgent', 'normal', 'info'], default: 'normal' },
  title:    { type: String, required: true },
  message:  { type: String, required: true },
  link:     { type: String, default: '' },
  read:     { type: Boolean, default: false },
}, { timestamps: true });

NotificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
