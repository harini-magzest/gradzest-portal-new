const mongoose = require('mongoose');

// Generic atomic counter, keyed by name (e.g. 'counselorRoundRobin').
// $inc via findOneAndUpdate is atomic in MongoDB, so concurrent creations
// still each get a distinct, sequential value — no lost updates.
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  value: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', CounterSchema);
