const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const Profile = require('../models/Profile');

/*
 * Access control for staff, modelled on Bigin's Users and Controls:
 *   Profile → WHAT a counselor can do   (permission keys below)
 *   Role    → WHOSE students they can see (their own + everyone in roles below theirs)
 * Admin accounts always have full access and see everything. A counselor with no role keeps
 * the portal's original visibility, so nothing changes until an admin assigns roles.
 */

const PERMISSIONS = [
  { module: 'Students', items: [
    { key: 'students.view',   label: 'View students' },
    { key: 'students.create', label: 'Add students' },
    { key: 'students.edit',   label: 'Edit student profiles' },
    { key: 'students.stage',  label: 'Change lead stage' },
    { key: 'students.email',  label: 'Email students' },
  ] },
  { module: 'Documents', items: [
    { key: 'documents.request', label: 'Request documents' },
    { key: 'documents.verify',  label: 'Verify / reject documents' },
  ] },
  { module: 'Notes', items: [
    { key: 'notes.create', label: 'Add and edit notes' },
    { key: 'notes.delete', label: 'Delete notes' },
  ] },
  { module: 'Applications', items: [
    { key: 'applications.view',   label: 'View applications' },
    { key: 'applications.create', label: 'Create applications' },
    { key: 'applications.edit',   label: 'Update application status' },
  ] },
  { module: 'Meetings', items: [
    { key: 'meetings.create', label: 'Schedule meetings' },
  ] },
];

const ALL_KEYS = PERMISSIONS.flatMap(m => m.items.map(i => i.key));
const LABELS = Object.fromEntries(PERMISSIONS.flatMap(m => m.items.map(i => [i.key, i.label])));

async function seedProfiles() {
  try {
    if (await Profile.estimatedDocumentCount() > 0) return;
    await Profile.insertMany([
      { name: 'Administrator', description: 'Full access to everything. Used by admin accounts.', permissions: ALL_KEYS, isSystem: true },
      { name: 'Standard Counselor', description: 'Default for counselors.', permissions: ALL_KEYS, isDefault: true },
    ]);
    console.log('[access] Seeded default profiles');
  } catch (err) {
    console.error('[access] Seeding profiles failed:', err.message);
  }
}

// All role ids strictly below `roleId` in the hierarchy
async function descendantRoleIds(roleId) {
  const roles = await Role.find().select('parentRole').lean();
  const children = new Map();
  for (const r of roles) {
    const p = r.parentRole ? String(r.parentRole) : null;
    if (p) children.set(p, [...(children.get(p) || []), String(r._id)]);
  }
  const out = [];
  const stack = [String(roleId)];
  while (stack.length) {
    for (const c of children.get(stack.pop()) || []) {
      if (!out.includes(c)) { out.push(c); stack.push(c); }
    }
  }
  return out;
}

/**
 * Resolve the caller's access once per request (cached on req).
 * teamIds === null means "not restricted by role".
 */
async function loadAccess(req) {
  if (req._access) return req._access;
  const me = await User.findById(req.user.id).select('role isAppTeam hierarchyRole profileId assignedStudents').lean();
  let access;
  if (!me) {
    access = { me: null, admin: false, permissions: new Set(), teamIds: null, teamStudentIds: new Set() };
  } else if (me.role === 'admin') {
    access = { me, admin: true, permissions: new Set(ALL_KEYS), teamIds: null, teamStudentIds: new Set() };
  } else {
    const profile = (me.profileId && await Profile.findById(me.profileId).lean())
      || await Profile.findOne({ isDefault: true }).lean();
    const permissions = new Set(profile ? profile.permissions : ALL_KEYS);
    let teamIds = null;
    const teamStudentIds = new Set((me.assignedStudents || []).map(String));
    if (me.hierarchyRole && await Role.exists({ _id: me.hierarchyRole })) {
      const below = await descendantRoleIds(me.hierarchyRole);
      const team = below.length
        ? await User.find({ hierarchyRole: { $in: below } }).select('_id assignedStudents').lean()
        : [];
      teamIds = [String(me._id), ...team.map(u => String(u._id))];
      team.forEach(u => (u.assignedStudents || []).forEach(id => teamStudentIds.add(String(id))));
    }
    access = { me, admin: false, permissions, teamIds, teamStudentIds };
  }
  req._access = access;
  return access;
}

/** Extra Mongo filter limiting students to the caller's team, or null when unrestricted. */
function studentFilter(access) {
  if (access.admin || !access.teamIds) return null;
  const ids = [...access.teamStudentIds].filter(id => mongoose.isValidObjectId(id));
  return { $or: [{ counselorId: { $in: access.teamIds } }, { _id: { $in: ids } }] };
}

/** Is this student the caller's own (assigned to them)? */
function ownsStudent(access, student) {
  if (!access.me) return false;
  const sid = String(student._id);
  return String(student.counselorId || '') === String(access.me._id)
    || (access.me.assignedStudents || []).map(String).includes(sid);
}

/** Can the caller see this student at all? */
function canView(access, student) {
  if (access.admin || !access.teamIds) return true;
  return access.teamIds.includes(String(student.counselorId || '')) || access.teamStudentIds.has(String(student._id));
}

/** Can the caller change this student? Own students always; team students when role-restricted. */
function canManage(access, student) {
  if (access.admin) return true;
  if (ownsStudent(access, student)) return true;
  return !!access.teamIds && canView(access, student);
}

/** Route middleware: counselors need `perm` in their profile. Other roles pass through. */
function can(perm) {
  return async (req, res, next) => {
    if (req.user.role !== 'counselor') return next();
    try {
      const access = await loadAccess(req);
      if (!access.permissions.has(perm)) {
        return res.status(403).json({ message: `Your profile does not allow: ${LABELS[perm] || perm}` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Route helper: 404s if the target isn't a student, 403s if the caller
 * can't see (or, with `{ manage: true }`, can't change) them. Admins always
 * pass. Sends the response itself and returns true when the caller should
 * stop; returns false to let the route proceed.
 */
async function denyStudent(req, res, id, { manage = false } = {}) {
  const student = await User.findById(id).select('role counselorId assignedStudents').lean();
  if (!student || student.role !== 'student') {
    res.status(404).json({ message: 'Student not found' });
    return true;
  }
  if (req.user.role === 'admin') return false;
  const access = await loadAccess(req);
  const allowed = manage ? canManage(access, student) : canView(access, student);
  if (!allowed) {
    res.status(403).json({ message: 'Forbidden' });
    return true;
  }
  return false;
}

module.exports = {
  PERMISSIONS, ALL_KEYS, seedProfiles, loadAccess, studentFilter,
  ownsStudent, canView, canManage, can, denyStudent,
};
