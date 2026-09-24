const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  name:         { type: String, default: '' },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:        { type: String, default: '' },
  subscribedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Subscriber', subscriberSchema);
