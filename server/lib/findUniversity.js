const mongoose = require('mongoose');
const University = require('../models/University');

// Universities are referred to by their short `id` string or by Mongo _id, depending on who created them.
async function findUniversity(idOrObjectId) {
  const key = String(idOrObjectId || '').trim();
  if (!key || key.length > 64) return null;
  let uni = await University.findOne({ id: key }).lean();
  if (!uni && mongoose.isValidObjectId(key)) uni = await University.findById(key).lean();
  return uni;
}

module.exports = { findUniversity };
