const mongoose = require('mongoose');

// Small named settings an administrator edits in Settings (the company profile, for now). One document per key.
const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('Setting', SettingSchema);
