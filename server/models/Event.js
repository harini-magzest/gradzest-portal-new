const mongoose = require('mongoose');

// A webinar, workshop or open day that students can register for.
const EventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, default: '', maxlength: 2000 },
  startsAt: { type: Date, required: true },
  durationMin: { type: Number, default: 60, min: 5, max: 600 },
  // Where it happens: a Zoom/Meet/Jitsi URL, or leave empty for an in-person event described in `description`
  link: { type: String, default: '' },
  // Maximum registrations; 0 means unlimited
  capacity: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
  // Shown to registrants after the event
  recordingUrl: { type: String, default: '' },
  registrations: [{
    _id: false,
    userId: { type: String, required: true },
    name: String,
    email: String,
    registeredAt: { type: Date, default: Date.now },
  }],
  // Reminder windows already sent ('24h', '1h'), so a job re-run never repeats one
  remindersSent: { type: [String], default: [] },
  createdBy: { type: String, required: true },
  createdByName: { type: String, default: '' },
}, { timestamps: true });

EventSchema.index({ startsAt: 1 });

module.exports = mongoose.model('Event', EventSchema);
