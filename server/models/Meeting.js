const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  scheduledDate: { type: String, required: true }, // YYYY-MM-DD
  scheduledTime: { type: String, required: true }, // HH:MM
  duration: { type: Number, default: 60 }, // minutes
  platform: { type: String, enum: ['teams', 'zoom', 'meet', 'jitsi', 'other'], default: 'other' },
  meetingLink: { type: String, default: '' },
  participants: [{
    userId: String,
    name: String,
    role: String,
    email: String,
  }],
  status: { type: String, enum: ['scheduled', 'ongoing', 'completed', 'cancelled'], default: 'scheduled' },
  // Which reminder windows have already fired for this meeting — e.g. ['24h', '1h']. Prevents duplicate reminders.
  remindersSent: { type: [String], default: [] },
  notes: String,
  createdBy: String,
  createdByName: { type: String, default: '' },
}, { timestamps: true });

// Upcoming meetings (reminder job, dashboards) and one person's upcoming meetings
MeetingSchema.index({ status: 1, scheduledDate: 1 });
MeetingSchema.index({ 'participants.userId': 1, scheduledDate: 1 });

module.exports = mongoose.model('Meeting', MeetingSchema);
