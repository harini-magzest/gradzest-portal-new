const mongoose = require('mongoose');

// A student's request to have their personal data erased. An admin reviews it (there may be a live application or a legal
// reason to wait) and either completes it, which runs lib/studentData.eraseStudent, or declines it with a reason.
// The name and email are copied here because the account is anonymised once it is completed.
const DeletionRequestSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  reason: { type: String, default: '', maxlength: 500 },
  status: { type: String, enum: ['pending', 'completed', 'declined', 'cancelled'], default: 'pending' },
  handledBy: String,
  handledByName: String,
  handledAt: Date,
  adminNote: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

module.exports = mongoose.model('DeletionRequest', DeletionRequestSchema);
