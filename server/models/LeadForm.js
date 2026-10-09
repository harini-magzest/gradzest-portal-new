const mongoose = require('mongoose');

// Optional questions an admin can add to a marketing form. First/last name and mobile number are always asked.
const FORM_FIELDS = ['email', 'preferredCountries', 'preferredIntake', 'preferredCourseLevel', 'qualification', 'message'];

// A Bigin-style web form (Admin → Settings → Forms). Its public page is /f/<slug>; each submission
// becomes a student lead (routes/forms.js). The slug is fixed once created so printed QR codes keep working.
const LeadFormSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  intro: { type: String, default: '', maxlength: 1000 },
  fields: { type: [{ type: String, enum: FORM_FIELDS }], default: ['email', 'preferredCountries'] },
  thankYouMessage: { type: String, default: 'Thank you! A Gradzest counselor will contact you shortly.', maxlength: 500 },
  // Saved on each lead as utmCampaign when the link itself carries no utm_campaign
  campaign: { type: String, default: '', maxlength: 100 },
  active: { type: Boolean, default: true },
  submissions: { type: Number, default: 0 },
  lastSubmissionAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('LeadForm', LeadFormSchema);
module.exports.FORM_FIELDS = FORM_FIELDS;
