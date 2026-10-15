// The students that match a filter, as the JSON a client receives (what toJSON() gives), for the unpaged list routes.
//
// Read as plain objects and shaped by lib/leanDoc.js, which server/test/leanDoc.test.js proves equal to the documents'
// own toJSON(). For 3,000 students that is about 0.4 s where hydrating whole documents was about 1.9 s.
//
// `rawFields` is the route's `?fields=` value (lib/fieldSelect.js): without it the whole record, as before.

const User = require('../models/User');
const { toClientJson } = require('./leanDoc');
const { parseFields } = require('./fieldSelect');

/**
 * @param {object} filter   a Mongoose filter, e.g. { role: 'student' }
 * @param {string} [rawFields] the raw `fields` query value
 * @returns {Promise<object[]>} one plain object per student, ready for res.json()
 */
async function findStudentsJson(filter, rawFields) {
  const fields = parseFields(rawFields);

  // A dotted selection (`englishScore.score`) narrows inside a subdocument, which the plain-object path does not
  // model. It is rare; read it the ordinary way rather than risk a different shape.
  if (fields && fields.some((f) => f.includes('.'))) {
    const docs = await User.find(filter).select(fields.join(' '));
    return docs.map((d) => d.toJSON());
  }

  const rows = await User.find(filter).select(fields ? fields.join(' ') : '-password').lean();
  const options = fields ? { only: fields } : { exclude: ['password'] };
  return rows.map((row) => toClientJson(row, User, options));
}

module.exports = { findStudentsJson };
