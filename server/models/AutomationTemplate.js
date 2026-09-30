const mongoose = require('mongoose');

// Reusable message used by automation rules. Subject and body may contain
// {{placeholders}} (see VARIABLES in lib/automation.js), filled in at send time.
const AutomationTemplateSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  // email → sent through the mailer; notification → in-app bell notification
  channel:  { type: String, enum: ['email', 'notification'], default: 'email' },
  category: { type: String, default: 'General' },
  subject:  { type: String, default: '' }, // email subject / notification title
  body:     { type: String, default: '' }, // plain text; newlines become line breaks
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('AutomationTemplate', AutomationTemplateSchema);
