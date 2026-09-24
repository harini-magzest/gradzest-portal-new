const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  scheduledDate: { type: String, required: true }, // YYYY-MM-DD
  scheduledTime: { type: String, required: true }, // HH:MM
  duration: { type: Number, default: 60 }, // minutes
  platform: { type: String, enum: ['teams', 'zoom', 'meet', 'other'], default: 'other' },
  meetingLink: { type: String, default: '' },
  participants: [{
    userId: String,
    name: String,
    role: String,
    email: String,
  }],
  status: { type: String, enum: ['scheduled', 'ongoing', 'completed', 'cancelled'], default: 'scheduled' },
  notes: String,
  createdBy: String,
  createdByName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Meeting', MeetingSchema);
