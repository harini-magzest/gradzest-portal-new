const mongoose = require('mongoose');

// A permission profile ("what can this user do"), managed from Settings → Users and Controls →
// Profiles. Permission keys are listed in lib/access.js (PERMISSIONS). Applies to counselors;
// admin accounts always have full access.
const ProfileSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  permissions: [String],
  // System profiles (Administrator) cannot be edited or deleted
  isSystem:    { type: Boolean, default: false },
  // Used for counselors who have no profile assigned
  isDefault:   { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Profile', ProfileSchema);
