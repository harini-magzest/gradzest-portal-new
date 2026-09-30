const User = require('../models/User');
const Counter = require('../models/Counter');

/**
 * Round-robin pick of an existing counselor, and applies the assignment to
 * `student` (sets counselorId, flips a fresh lead to 'contacted') and to the
 * chosen counselor's assignedStudents list. Mirrors the manual assign route
 * in admin.js so the assignment looks the same everywhere it's read.
 *
 * Returns the assigned counselor doc (name/email), or null if there are no
 * counselor accounts yet — creation should proceed unassigned in that case,
 * never fail because the pool happens to be empty.
 */
async function assignNextCounselor(student) {
  const counselors = await User.find({ role: 'counselor' }).select('name email').sort({ _id: 1 });
  if (!counselors.length) return null;

  const counter = await Counter.findOneAndUpdate(
    { _id: 'counselorRoundRobin' },
    { $inc: { value: 1 } },
    { upsert: true, new: true }
  );
  const counselor = counselors[counter.value % counselors.length];

  student.counselorId = counselor._id.toString();
  if (student.leadStatus === 'new') student.leadStatus = 'contacted';
  await User.findByIdAndUpdate(counselor._id, { $addToSet: { assignedStudents: student._id.toString() } });

  return counselor;
}

module.exports = { assignNextCounselor };
