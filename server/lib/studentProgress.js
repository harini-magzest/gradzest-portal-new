// Loads a student's document checklist and application timeline (see documentChecklist.js and
// applicationTimeline.js for how they are worked out). Shared by the student, staff and parent views.
const User = require('../models/User');
const { buildChecklist, destinationNames } = require('./documentChecklist');
const { buildTimeline } = require('./applicationTimeline');

async function checklistFor(studentId) {
  const Country = require('../models/Country');
  const University = require('../models/University');
  const mongoose = require('mongoose');
  const student = await User.findOne({ _id: studentId, role: 'student' }).select('documents preferredCountries applications passport').lean();
  if (!student) return null;
  const apps = student.applications || [];
  const ids = apps.map((a) => a.universityId).filter((id) => id && mongoose.isValidObjectId(id));
  const names = apps.map((a) => a.universityName).filter(Boolean);
  const unis = ids.length || names.length
    ? await University.find({ $or: [{ _id: { $in: ids } }, { name: { $in: names } }] }).select('country').lean()
    : [];
  const wanted = destinationNames(student, unis.map((u) => u.country)).map((n) => n.toLowerCase());
  const countries = wanted.length ? (await Country.find({}).select('name visa.documents').lean()).filter((c) => wanted.includes(String(c.name).toLowerCase())) : [];
  return buildChecklist(student, countries);
}

async function timelineFor(studentId) {
  const student = await User.findOne({ _id: studentId, role: 'student' }).select('applications').lean();
  return student ? { applications: buildTimeline(student.applications || []) } : null;
}

// The one thing the student should do next (see nextStep.js).
async function nextStepForStudent(studentId) {
  const [checklist, timeline] = await Promise.all([checklistFor(studentId), timelineFor(studentId)]);
  if (!checklist || !timeline) return null;
  return require('./nextStep').nextStepFor(checklist, timeline.applications);
}

module.exports = { checklistFor, timelineFor, nextStepForStudent };
