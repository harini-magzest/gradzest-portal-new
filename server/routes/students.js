const express = require('express');
const { logError } = require('../lib/logError');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const { scanUploadedFile } = require('../middleware/scanUpload');
const { recordUpload } = require('../middleware/recordUpload');
const { uploadToS3IfConfigured } = require('../middleware/uploadToS3IfConfigured');
const { logPiiAccess } = require('../lib/logPiiAccess');
const { deleteStoredFile } = require('../lib/storedFile');
const attachUserEmail = require('../middleware/attachUserEmail');
const { recordStaffActivity } = require('../lib/staffActivity');
const { fireEvent } = require('../lib/automation');
const { can, loadAccess, studentFilter, canView, canManage, denyStudent } = require('../lib/access');
const { assignNextCounselor } = require('../lib/assignCounselor');
const { notesFor, canSee, isAuthor, isPublic } = require('../lib/studentNotes');
const { checklistFor, timelineFor } = require('../lib/studentProgress');
const { validateBulk } = require('../lib/bulkActions');

const router = express.Router();

// Get all students (counselor only)
router.get('/', authMiddleware, attachUserEmail, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  try {
    // Honour the role hierarchy: a role-restricted counselor sees their team's students, not everyone.
    const teamFilter = studentFilter(await loadAccess(req));
    const students = await User.find({ role: 'student', ...(teamFilter || {}) }).select('-password');
    const io = req.app.get('io');
    students.forEach((s) => logPiiAccess({ accessor: req.user, applicant: s, accessType: 'list', ip: req.ip, io }));
    res.json(students.map(s => s.toJSON()));
  } catch (err) {
    logError('students', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current student profile
router.get('/me', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.toJSON());
  } catch (err) {
    console.error('[GET /students/me]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// The fields on the student's own profile page — nothing else is writable through PUT /me.
const STUDENT_SELF_EDITABLE = [
  'name', 'firstName', 'lastName', 'phone', 'nationality', 'dateOfBirth', 'gender', 'maritalStatus', 'placeOfBirth',
  'passport', 'address', 'educationLevel', 'gpa', 'englishScore', 'moi', 'englishProficiencyTest', 'budget',
  'preferredCountries', 'interestedCourses', 'academicDetails', 'experienceDetails', 'avatar',
  'secondaryEmail', 'altPhone', 'universityName', 'preferredCourseLevel', 'preferredIntake',
  'preferredUniversities', 'preferredCities', 'needsScholarship', 'needsLoan', 'needsAccommodation', 'preferenceNote',
];
// Plain-text fields from the list above: coerced to trimmed strings so a stray object or
// number can't reach Mongoose, and capped so one field can't bloat the record.
const SELF_TEXT_FIELDS = new Set([
  'secondaryEmail', 'altPhone', 'universityName', 'preferredCourseLevel', 'preferredIntake',
  'preferredUniversities', 'preferredCities', 'preferenceNote',
]);
const YES_NO_FIELDS = new Set(['needsScholarship', 'needsLoan', 'needsAccommodation']);

// Update current student profile
router.put('/me', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  // Allowlist, not a blocklist: everything else on the record (role flags, counselor assignment, lead stage,
  // document/application status, staff notes, lock and session state, reset tokens) is staff- or server-controlled.
  const updates = Object.fromEntries(STUDENT_SELF_EDITABLE.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]));
  for (const k of Object.keys(updates)) {
    if (SELF_TEXT_FIELDS.has(k)) updates[k] = String(updates[k] ?? '').trim().slice(0, k === 'preferenceNote' ? 2000 : 300);
    if (YES_NO_FIELDS.has(k) && !['yes', 'no', 'not_sure', ''].includes(updates[k])) delete updates[k];
  }
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: false }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.toJSON());
  } catch (err) {
    console.error('[PUT /students/me]', err);
    sendServerError(res, err, 'Server error');
  }
});

// Bulk actions: change the stage, add a tag, create a follow-up task or (admin) reassign the counselor for many students at
// once. Each student is checked on its own against the caller's access, so one student the caller may not change never
// blocks the rest; the response says exactly what happened to each. Declared before the /:id routes.
router.post('/bulk', authMiddleware, async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  const checked = validateBulk(req.body, req.user, LEAD_STAGES);
  if (checked.error) return res.status(checked.status || 400).json({ message: checked.error });
  const { ids, action, value } = checked;

  try {
    const access = req.user.role === 'admin' ? { admin: true, permissions: new Set(['students.stage']) } : await loadAccess(req);
    if (action === 'set_stage' && !access.admin && !access.permissions.has('students.stage')) {
      return res.status(403).json({ message: 'Your profile does not allow changing lead stages' });
    }

    let counselor = null;
    if (action === 'reassign' && value) {
      counselor = await User.findOne({ _id: value, role: 'counselor' }).select('name');
      if (!counselor) return res.status(400).json({ message: 'Counselor not found' });
    }

    const students = await User.find({ _id: { $in: ids }, role: 'student' });
    const byId = new Map(students.map((s) => [String(s._id), s]));
    const result = { action, requested: ids.length, updated: 0, unchanged: 0, skipped: [] };
    const actor = req.user.role === 'counselor' ? await User.findById(req.user.id).select('name') : null;

    for (const id of ids) {
      const student = byId.get(id);
      if (!student) { result.skipped.push({ id, name: '', reason: 'not_found' }); continue; }
      if (!canManage(access, student)) { result.skipped.push({ id, name: student.name, reason: 'forbidden' }); continue; }

      if (action === 'set_stage') {
        const from = student.leadStage || 'new_enquiry';
        if (from === value) { result.unchanged++; continue; }
        student.leadStage = value;
        student.leadStageChangedAt = new Date();
        await student.save();
        recordStaffActivity(req, { kind: 'stage', title: 'Lead Stage updated (bulk)', detail: `'${LEAD_STAGES[from]}' to '${LEAD_STAGES[value]}'`, studentId: student._id, studentName: student.name });
        fireEvent('student.stageChanged', { studentId: student._id, fromStage: from });
      } else if (action === 'add_tag') {
        const tags = student.tags || [];
        if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) { result.unchanged++; continue; }
        if (tags.length >= 20) { result.skipped.push({ id, name: student.name, reason: 'too_many_tags' }); continue; }
        student.tags = [...tags, value];
        await student.save();
        recordStaffActivity(req, { kind: 'student', title: 'Tag added (bulk)', detail: value, studentId: student._id, studentName: student.name });
      } else if (action === 'create_task') {
        const Task = require('../models/Task');
        await Task.create({
          title: value.title, priority: value.priority, dueDate: value.dueDate,
          studentId: student._id, studentName: student.name,
          assignedTo: req.user.id, assignedToName: actor?.name || '', assignedToRole: req.user.role,
          assignedBy: req.user.id, assignedByName: actor?.name || '',
        });
        recordStaffActivity(req, { kind: 'task', title: 'Task created (bulk)', detail: `${value.title}${value.dueDate ? ` · due ${value.dueDate}` : ''}`, studentId: student._id, studentName: student.name });
      } else {
        // reassign (admin only). Students are not emailed one by one here: a mass move should not send a wave of mail.
        const prev = student.counselorId ? String(student.counselorId) : '';
        if (prev === (value || '')) { result.unchanged++; continue; }
        if (prev) await User.findByIdAndUpdate(prev, { $pull: { assignedStudents: id } });
        student.counselorId = value || undefined;
        if (value && student.leadStatus === 'new') student.leadStatus = 'contacted';
        await student.save();
        if (value) {
          await User.findByIdAndUpdate(value, { $addToSet: { assignedStudents: id } });
          fireEvent('counselor.assigned', { studentId: id });
        }
        recordStaffActivity(req, { kind: 'student', title: 'Counselor reassigned (bulk)', detail: counselor ? `to ${counselor.name}` : 'unassigned', studentId: student._id, studentName: student.name });
      }
      result.updated++;
    }
    res.json(result);
  } catch (err) {
    logError('students', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Document checklist and application timeline, for the student themself (/me/...) or for staff viewing a student they
// are allowed to see (/:id/...). `me` routes are declared first so "me" is never read as a student id.
const asStudent = (req, res, next) => (req.user.role === 'student' ? next() : res.status(403).json({ message: 'Forbidden' }));

// Universities a student has saved to compare. Capped so the list stays a shortlist.
const SHORTLIST_MAX = 20;

router.get('/me/shortlist', authMiddleware, asStudent, async (req, res) => {
  try {
    const { findUniversity } = require('../lib/findUniversity');
    const { summarise } = require('../lib/universityCompare');
    const me = await User.findById(req.user.id).select('shortlist').lean();
    const unis = await Promise.all((me?.shortlist || []).map((s) => findUniversity(s.universityId)));
    // A university deleted since it was saved just drops out of the list
    res.json(unis.filter(Boolean).map(summarise));
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/me/shortlist', authMiddleware, asStudent, async (req, res) => {
  try {
    const { findUniversity } = require('../lib/findUniversity');
    const uni = await findUniversity(req.body?.universityId);
    if (!uni) return res.status(404).json({ message: 'University not found' });
    const universityId = uni.id || String(uni._id);
    const me = await User.findById(req.user.id).select('shortlist').lean();
    const list = me?.shortlist || [];
    if (list.some((s) => s.universityId === universityId)) return res.json({ universityId, saved: true, count: list.length });
    if (list.length >= SHORTLIST_MAX) return res.status(409).json({ message: `Your shortlist is full (${SHORTLIST_MAX}). Remove one to add another.` });
    await User.updateOne({ _id: req.user.id, 'shortlist.universityId': { $ne: universityId } }, { $push: { shortlist: { universityId, addedAt: new Date() } } });
    res.status(201).json({ universityId, saved: true, count: list.length + 1 });
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

router.delete('/me/shortlist/:universityId', authMiddleware, asStudent, async (req, res) => {
  try {
    await User.updateOne({ _id: req.user.id }, { $pull: { shortlist: { universityId: req.params.universityId } } });
    res.json({ universityId: req.params.universityId, saved: false });
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/me/checklist', authMiddleware, asStudent, async (req, res) => {
  try {
    const result = await checklistFor(req.user.id);
    if (!result) return res.status(404).json({ message: 'Student not found' });
    res.json(result);
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/me/timeline', authMiddleware, asStudent, async (req, res) => {
  try {
    const result = await timelineFor(req.user.id);
    if (!result) return res.status(404).json({ message: 'Student not found' });
    res.json(result);
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id/checklist', authMiddleware, can('students.view'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    res.json(await checklistFor(req.params.id));
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id/timeline', authMiddleware, can('students.view'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    res.json(await timelineFor(req.params.id));
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

// Add document (student only) — accepts multipart/form-data with optional file
router.post('/me/documents', authMiddleware, attachUserEmail, upload.single('file'), scanUploadedFile, recordUpload('student_document'), uploadToS3IfConfigured, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  const { name, type, url: preExistingUrl } = req.body;
  const url = req.file ? (req.file.s3Url || `/uploads/${req.file.filename}`) : (preExistingUrl || undefined);
  const docName = (name || req.file?.originalname || 'Document').trim();
  try {
    const doc = { name: docName, type: type || 'Other', url, uploadedDate: new Date().toISOString().split('T')[0], status: 'pending' };
    const user = await User.findByIdAndUpdate(req.user.id, { $push: { documents: doc } }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const newDoc = user.documents[user.documents.length - 1];
    fireEvent('document.uploaded', { studentId: user._id, document: newDoc });
    res.json(newDoc.toJSON());
  } catch (err) {
    logError('students', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete own document (student)
router.delete('/me/documents/:docId', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  try {
    const owner = await User.findOneAndUpdate(
      { _id: req.user.id, 'documents._id': req.params.docId },
      { $pull: { documents: { _id: req.params.docId } } },
      { projection: { 'documents': { $elemMatch: { _id: req.params.docId } } } },
    );
    const removed = owner?.documents?.[0];
    if (removed) deleteStoredFile(removed.url);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    logError('students', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Staff-editable profile fields ─────────────────────────────────────────────
// Allowlist shared by create and edit — never spread req.body into a User.
const TEXT_FIELDS = [
  'name', 'firstName', 'lastName', 'title', 'secondaryEmail', 'universityName', 'phone', 'altPhone',
  'dateOfBirth', 'gender', 'nationality', 'socialLeadId', 'educationLevel', 'status',
  'preferredCourseLevel', 'preferredIntake', 'qualification', 'workSummary', 'branch',
  'preferredUniversities', 'preferredCities', 'preferenceNote',
];
const LONG_TEXT_FIELDS = new Set(['workSummary', 'preferenceNote']);
const YES_NO_VALUES = ['yes', 'no', 'not_sure', ''];
const STAFF_YES_NO_FIELDS = ['needsScholarship', 'needsLoan', 'needsAccommodation'];
const LIST_FIELDS = ['preferredCountries', 'interestedCourses'];
const NUMBER_FIELDS = ['gpa', 'budget'];
const ADDRESS_KEYS = ['street', 'city', 'state', 'country', 'postalCode'];
const ENGLISH_TYPES = ['IELTS', 'TOEFL', 'PTE', 'Duolingo', 'Other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanProfile(body) {
  const out = {};
  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) out[f] = String(body[f] ?? '').trim().slice(0, LONG_TEXT_FIELDS.has(f) ? 2000 : 300);
  }
  for (const f of LIST_FIELDS) {
    if (Array.isArray(body[f])) out[f] = body[f].map(v => String(v).trim()).filter(Boolean).slice(0, 30);
  }
  for (const f of NUMBER_FIELDS) {
    if (body[f] === undefined) continue;
    const n = body[f] === null || body[f] === '' ? NaN : Number(body[f]);
    out[f] = Number.isFinite(n) ? n : null;
  }
  if (body.englishScore !== undefined) {
    const t = body.englishScore?.type;
    const score = Number(body.englishScore?.score);
    out.englishScore = ENGLISH_TYPES.includes(t) ? { type: t, ...(Number.isFinite(score) ? { score } : {}) } : null;
  }
  if (body.address && typeof body.address === 'object') {
    for (const k of ADDRESS_KEYS) {
      if (body.address[k] !== undefined) out[`address.${k}`] = String(body.address[k] ?? '').trim().slice(0, 200);
    }
  }
  for (const f of STAFF_YES_NO_FIELDS) {
    if (body[f] !== undefined && YES_NO_VALUES.includes(body[f])) out[f] = body[f];
  }
  if (out.status === '') delete out.status; // enum field — blank means "leave as is"
  return out;
}

const fullName = (first, last) => [first, last].map(v => (v || '').trim()).filter(Boolean).join(' ');

/** Another student with the same mobile number (compares the last 10 digits, ignoring formatting). */
async function findByPhone(phone, excludeId) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  if (digits.length < 7) return null;
  const pattern = new RegExp(`${digits.split('').join('\\D*')}\\D*$`);
  return User.findOne({ role: 'student', phone: pattern, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    .select('name').lean();
}

const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Create a student (admin, Application Team or counselor). Only a name and a mobile number (or an
// email) are needed — a lead who just phoned in can be added now and filled in later. With an
// email the student also gets a login; without one they can't sign in until an email is added.
router.post('/', authMiddleware, can('students.create'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  const profile = cleanProfile(req.body);
  const name = fullName(profile.firstName, profile.lastName) || profile.name || '';
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!name) return res.status(400).json({ message: 'Name is required' });
  if (!profile.phone && !email) return res.status(400).json({ message: 'A mobile number or an email is required' });
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  try {
    if (email && await User.exists({ email })) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }
    if (profile.phone && !req.body.allowDuplicatePhone) {
      const dupe = await findByPhone(profile.phone);
      if (dupe) {
        return res.status(409).json({
          message: `${dupe.name} already has this mobile number`, existingId: String(dupe._id), duplicatePhone: true,
        });
      }
    }

    let tempPassword;
    let hashed;
    if (email) {
      const bcrypt = require('bcryptjs');
      tempPassword = require('crypto').randomBytes(6).toString('hex'); // random 12-char temporary password
      hashed = await bcrypt.hash(tempPassword, 10);
    }
    const student = new User({
      role: 'student', name, email: email || undefined, password: hashed, emailVerified: !!email,
      source: req.user.role === 'counselor' ? 'counselor_created' : 'admin_created',
      joinedDate: new Date().toISOString().split('T')[0],
    });
    student.set(profile);
    student.name = name;
    if (LEAD_STAGES[req.body.leadStage]) student.leadStage = req.body.leadStage;

    // Owner: a counselor owns what they add; admins pick one or get the next in the round-robin
    if (req.user.role === 'counselor') {
      student.counselorId = req.user.id;
      await student.save();
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { assignedStudents: student._id.toString() } });
    } else {
      const owner = req.body.counselorId
        ? await User.findOne({ _id: req.body.counselorId, role: 'counselor' }).select('_id').lean().catch(() => null)
        : null;
      if (req.body.counselorId && !owner) return res.status(400).json({ message: 'Owner must be a counselor' });
      await student.save();
      if (owner) {
        student.counselorId = String(owner._id);
        await User.findByIdAndUpdate(owner._id, { $addToSet: { assignedStudents: student._id.toString() } });
      } else {
        await assignNextCounselor(student);
      }
      await student.save();
    }

    // Email the student their login credentials
    const mailer = req.app.get('mailer');
    if (mailer && email) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      mailer.sendMail({
        from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: email,
        subject: 'Your Gradzest Account Has Been Created',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
            <div style="background:#0d1b4b;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
            </div>
            <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
              <p style="font-size:16px;">Hi ${escHtml(name)},</p>
              <p style="font-size:15px;">Your counselor has created a Gradzest account for you. Here are your login credentials:</p>
              <div style="margin:20px 0;padding:16px 20px;background:#f0f4ff;border-left:4px solid #0d1b4b;border-radius:4px;">
                <p style="margin:0 0 8px;font-size:14px;"><strong>Email:</strong> ${escHtml(email)}</p>
                <p style="margin:0;font-size:14px;"><strong>Temporary Password:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px;">${tempPassword}</code></p>
              </div>
              <p style="font-size:14px;color:#6b7280;">Please log in and change your password as soon as possible.</p>
              <a href="${frontendUrl}/login" style="display:inline-block;margin-top:16px;background:#0d1b4b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Log In to Gradzest</a>
            </div>
          </div>`,
      }).catch(() => {});
    }

    const obj = student.toJSON();
    delete obj.password;
    recordStaffActivity(req, { kind: 'student', title: 'Student added', detail: student.email || student.phone, studentId: student._id, studentName: student.name });
    fireEvent('student.created', { studentId: student._id });
    // Return tempPassword so staff can share it manually if the email doesn't arrive
    res.status(201).json(tempPassword ? { ...obj, tempPassword } : obj);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// Get student by ID (counselor or admin)
router.get('/:id', authMiddleware, attachUserEmail, async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const student = await User.findById(req.params.id).select('-password');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    logPiiAccess({ accessor: req.user, applicant: student, accessType: 'view', ip: req.ip, io: req.app.get('io') });
    res.json(student.toJSON());
  } catch (err) {
    logError('students', err);
    res.status(500).json({ message: 'Server error' });
  }
});

const FIELD_LABELS = {
  firstName: 'First Name', lastName: 'Last Name', title: 'Title', email: 'Email',
  secondaryEmail: 'Secondary Email', universityName: 'University Name', phone: 'Mobile', altPhone: 'Phone',
  dateOfBirth: 'Date of Birth', gender: 'Gender', nationality: 'Nationality', socialLeadId: 'Social Lead ID',
  address: 'Address', preferredCountries: 'Destination', englishScore: 'English Language Test',
  interestedCourses: 'Preferred Courses', preferredCourseLevel: 'Preferred Course Level',
  preferredIntake: 'Preferred Intake', qualification: 'Qualification and YOP', workSummary: 'Work',
  branch: 'Branch', educationLevel: 'Education Level', gpa: 'GPA', budget: 'Budget', status: 'Status',
  preferredUniversities: 'Preferred Universities', preferredCities: 'Preferred Cities',
  needsScholarship: 'Scholarship', needsLoan: 'Education Loan', needsAccommodation: 'Accommodation',
  preferenceNote: "Student's notes",
};

// Update a student's profile (admin, Application Team, or the student's counselor / team lead)
router.put('/:id', authMiddleware, can('students.edit'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id, { manage: true })) return;
    const student = await User.findOne({ _id: req.params.id, role: 'student' });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const updates = cleanProfile(req.body);
    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      const name = fullName(updates.firstName ?? student.firstName, updates.lastName ?? student.lastName);
      if (name) updates.name = name;
    }
    if (updates.name !== undefined && !updates.name) return res.status(400).json({ message: 'Name is required' });

    // Email is the login ID: it can be added to a lead that has none, but not changed here
    const email = String(req.body.email || '').trim().toLowerCase();
    if (email && email !== student.email) {
      if (student.email) return res.status(400).json({ message: "Email is the student's login and can't be changed here" });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
      if (await User.exists({ email })) return res.status(409).json({ message: 'An account with this email already exists' });
      updates.email = email;
    }
    if (updates.phone && !req.body.allowDuplicatePhone) {
      const dupe = await findByPhone(updates.phone, student._id);
      if (dupe) {
        return res.status(409).json({
          message: `${dupe.name} already has this mobile number`, existingId: String(dupe._id), duplicatePhone: true,
        });
      }
    }

    student.set(updates);
    const changed = Array.from(new Set(student.modifiedPaths().map(p => p.split('.')[0]).filter(p => FIELD_LABELS[p])));
    await student.save();
    if (changed.length) {
      recordStaffActivity(req, {
        kind: 'student', title: 'Profile updated', detail: changed.map(p => FIELD_LABELS[p]).join(', '),
        studentId: student._id, studentName: student.name,
      });
    }
    const obj = student.toJSON();
    delete obj.password;
    res.json(obj);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// Request document for student (counselor only)
router.post('/:id/documents', authMiddleware, can('documents.request'), async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  const { name, type } = req.body;
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const doc = { name, type, uploadedDate: new Date().toISOString().split('T')[0], status: 'pending' };
    const user = await User.findByIdAndUpdate(req.params.id, { $push: { documents: doc } }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'Student not found' });
    const newDoc = user.documents[user.documents.length - 1];
    recordStaffActivity(req, { kind: 'document', title: 'Document requested', detail: `${doc.name}${doc.type ? ` (${doc.type})` : ''}`, studentId: user._id, studentName: user.name });

    // Notify student via socket
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const sids = userSockets?.get(String(req.params.id));
    if (io && sids) sids.forEach(sid => io.to(sid).emit('document:requested', { name: doc.name, type: doc.type }));

    // Email fallback
    if (user.email) {
      const mailer = req.app.get('mailer');
      if (mailer) mailer.sendMail({
        from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: user.email,
        subject: `Document Requested: ${doc.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
            <div style="background:#3b0764;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
            </div>
            <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
              <p style="font-size:16px;">Hi ${user.name},</p>
              <p style="font-size:15px;">Your counselor has requested the following document:</p>
              <div style="margin:20px 0;padding:16px 20px;background:#fff7ed;border-left:4px solid #ea580c;border-radius:4px;">
                <p style="margin:0;font-size:16px;font-weight:bold;">📄 ${doc.name}${doc.type ? ` (${doc.type})` : ''}</p>
              </div>
              <p style="font-size:14px;color:#6b7280;">Please log in to your Gradzest portal and upload it at your earliest convenience.</p>
            </div>
          </div>`,
      }).catch(() => {});
    }

    res.json(newDoc.toJSON());
  } catch (err) {
    logError('students', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update document status (counselor only)
router.put('/:id/documents/:docId', authMiddleware, can('documents.verify'), async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  const { status } = req.body;
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, 'documents._id': req.params.docId },
      { $set: { 'documents.$.status': status } },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'Not found' });

    // Notify student of document status change
    const doc = user.documents.id(req.params.docId);
    if (doc) recordStaffActivity(req, { kind: 'document', title: `Document marked ${status}`, detail: doc.name, studentId: user._id, studentName: user.name });
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    const sids = userSockets?.get(String(req.params.id));
    if (io && sids && doc) sids.forEach(sid => io.to(sid).emit('document:status_updated', { name: doc.name, status }));

    res.json(user.toJSON());
  } catch (err) {
    logError('students', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/students/:id/record — timeline, activities, emails and chats for the student record tabs
router.get('/:id/record', authMiddleware, can('students.view'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
  } catch (err) { logError('students', err); return res.status(500).json({ message: 'Server error' }); }
  const StaffActivity = require('../models/StaffActivity');
  const ActivityLog = require('../models/ActivityLog');
  const EmailLog = require('../models/EmailLog');
  const Meeting = require('../models/Meeting');
  const ChatRoom = require('../models/ChatRoom');
  try {
    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('name email createdAt joinedDate source applications documents counselorId counselorNotes');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const sid = String(student._id);
    const me = String(req.user.id);

    const Task = require('../models/Task');
    const [staffActs, studentActs, emails, meetings, allRooms, tasks, owner] = await Promise.all([
      StaffActivity.find({ studentId: student._id }).sort({ createdAt: -1 }).limit(300).lean(),
      ActivityLog.find({ studentId: student._id }).sort({ createdAt: -1 }).limit(200).lean(),
      EmailLog.find({ studentId: student._id }).sort({ createdAt: -1 }).limit(200).lean(),
      Meeting.find({ 'participants.userId': sid }).sort({ scheduledDate: -1, scheduledTime: -1 }).limit(100).lean(),
      ChatRoom.find({ participants: sid }).lean(),
      Task.find({ studentId: student._id }).sort({ createdAt: -1 }).limit(200).lean(),
      // Owner: the linked counselor, or (for counselor-created students) whoever lists them as assigned
      User.findOne(student.counselorId
        ? { _id: student.counselorId, role: 'counselor' }
        : { role: 'counselor', assignedStudents: sid }).select('name title').lean(),
    ]);

    // Counselors see only their own conversation with the student; admins see all of them
    const rooms = req.user.role === 'admin' ? allRooms : allRooms.filter(r => r.participants.includes(me));

    // ── Timeline ──
    const SOURCE = { self_signup: 'signed up via email', github: 'signed up via GitHub', facebook: 'signed up via Facebook', admin_created: 'added by admin', counselor_created: 'added by counselor' };
    const timeline = [];
    timeline.push({ id: 'joined', at: student.createdAt || student.joinedDate, kind: 'student', title: 'Student created', detail: SOURCE[student.source] || '' });
    // Note text never goes in the shared timeline (older entries stored a snippet, which may be from a private note)
    staffActs.forEach(a => timeline.push({ id: String(a._id), at: a.createdAt, kind: a.kind, title: a.title, by: a.actorName, detail: a.kind === 'note' ? '' : a.detail }));
    studentActs.forEach(a => timeline.push({ id: String(a._id), at: a.createdAt, kind: a.type, title: a.action, detail: a.detail }));
    (student.applications || []).forEach(a => a.submittedDate && timeline.push({
      id: `app-${a._id}`, at: a.submittedDate, kind: 'application', title: 'Application submitted', detail: `${a.universityName} – ${a.courseName}`,
    }));
    (student.documents || []).forEach(d => d.url && d.uploadedDate && timeline.push({
      id: `doc-${d._id}`, at: d.uploadedDate, kind: 'document', title: 'Document uploaded', detail: `${d.name}${d.type ? ` (${d.type})` : ''}`,
    }));
    emails.forEach(e => timeline.push({
      id: `email-${e._id}`, at: e.createdAt, kind: 'email', title: e.status === 'sent' ? 'Email sent' : 'Email failed',
      by: e.sentByName || (e.kind === 'auto' ? 'Gradzest (automatic)' : ''), detail: e.subject,
    }));
    timeline.sort((a, b) => new Date(b.at) - new Date(a.at));

    // ── Activities: meetings, chat-scheduled meetings, calls ──
    const activities = meetings.map(m => ({
      id: String(m._id), type: 'meeting', title: m.title, date: m.scheduledDate, time: m.scheduledTime,
      duration: m.duration, status: m.status, link: m.meetingLink, platform: m.platform, by: m.createdByName,
      with: (m.participants || []).filter(p => p.userId !== sid).map(p => p.name).filter(Boolean),
    }));
    allRooms.forEach(r => {
      const other = r.participantNames?.[r.participants.findIndex(p => p !== sid)] || 'Staff';
      (r.messages || []).forEach(m => {
        if (m.type === 'call') activities.push({
          id: String(m._id), type: 'call', title: `${m.senderId === sid ? 'Call from student to' : 'Call from'} ${m.senderId === sid ? other : m.senderName || other}`,
          at: m.timestamp, status: m.callStatus, duration: m.callDuration,
        });
        if (m.type === 'meeting') activities.push({
          id: String(m._id), type: 'chat_meeting', title: `Meeting scheduled in chat by ${m.senderName || other}`,
          date: m.meetingDate, time: m.meetingTime, notes: m.meetingNotes, at: m.timestamp,
        });
      });
    });

    res.json({
      timeline: timeline.slice(0, 400),
      notesCount: notesFor(student, me).length,
      activities,
      tasks: tasks.map(t => ({ ...t, id: String(t._id) })),
      owner: owner ? { id: String(owner._id), name: owner.name, title: owner.title || '' } : null,
      emails: emails.map(e => ({ ...e, id: String(e._id) })),
      rooms: rooms.map(r => ({
        id: String(r._id), type: r.type, participants: r.participants, participantNames: r.participantNames,
        messages: (r.messages || []).slice(-200).map(m => ({ ...m, id: String(m._id) })),
      })),
    });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// POST /api/students/:id/emails — staff writes an email to the student (logged via the mailer wrapper)
router.post('/:id/emails', authMiddleware, can('students.email'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  const subject = String(req.body.subject || '').trim();
  const body = String(req.body.body || '').trim();
  if (!subject || !body) return res.status(400).json({ message: 'Subject and message are required' });
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(400).json({ message: 'Email is not set up yet. Fill in the SMTP settings in server/.env.' });
  }
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('name email');
    if (!student?.email) return res.status(404).json({ message: 'Student has no email address' });
    const sender = await User.findById(req.user.id).select('name');
    const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    await req.app.get('mailer').sendMail({
      from: `"${(sender?.name || 'Gradzest').replace(/"/g, '')} via Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: student.email,
      subject,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;">${esc(body).replace(/\n/g, '<br>')}</div>`,
      gzMeta: { kind: 'manual', sentById: req.user.id, sentByName: sender?.name || '' },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ message: `Email could not be sent: ${err.message}` });
  }
});

// PUT /api/students/:id/lead-stage — admin, or the student's assigned counselor
const LEAD_STAGES = {
  new_enquiry: 'New Enquiry', interested: 'Interested', counselling: 'Counselling', shortlisting: 'Shortlisting',
  applications: 'Applications', visa_process: 'Visa Process', visa_approved: 'Visa Approved', enrolment: 'Enrolment',
  future_lead: 'Future Lead', other_agent: 'Other Agent', dropped_plans: 'Dropped Plans', test_prep: 'Test Prep',
  dnd: 'DND', not_responding: 'Not Responding', other: 'Other',
};
router.put('/:id/lead-stage', authMiddleware, can('students.stage'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  const { leadStage } = req.body;
  if (!LEAD_STAGES[leadStage]) return res.status(400).json({ message: 'Invalid lead stage' });
  try {
    const student = await User.findOne({ _id: req.params.id, role: 'student' });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (req.user.role === 'counselor' && !canManage(await loadAccess(req), student)) {
      return res.status(403).json({ message: 'Only the assigned counselor or their team lead can change this student\'s stage' });
    }
    const from = student.leadStage || 'new_enquiry';
    if (from !== leadStage) {
      student.leadStage = leadStage;
      student.leadStageChangedAt = new Date();
      await student.save();
      recordStaffActivity(req, {
        kind: 'stage', title: 'Lead Stage updated',
        detail: `'${LEAD_STAGES[from]}' to '${LEAD_STAGES[leadStage]}'`,
        studentId: student._id, studentName: student.name,
      });
      fireEvent('student.stageChanged', { studentId: student._id, fromStage: from });
    }
    const obj = student.toJSON();
    delete obj.password;
    res.json(obj);
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/students/:id/meta — tags and short summary (admin, or the assigned counselor)
router.put('/:id/meta', authMiddleware, async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    const student = await User.findOne({ _id: req.params.id, role: 'student' });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (req.user.role === 'counselor' && String(student.counselorId) !== String(req.user.id)) {
      const me = await User.findById(req.user.id).select('assignedStudents');
      if (!me?.assignedStudents?.map(String).includes(String(student._id))) {
        return res.status(403).json({ message: 'Only the assigned counselor can edit this student' });
      }
    }
    if (Array.isArray(req.body.tags)) {
      const seen = new Set();
      student.tags = req.body.tags
        .map(t => String(t).trim().slice(0, 40))
        .filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
        .slice(0, 20);
    }
    if (req.body.summary !== undefined) student.summary = String(req.body.summary).trim().slice(0, 2000);
    await student.save();
    const obj = student.toJSON();
    delete obj.password;
    res.json(obj);
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

// ── Staff notes: public (all staff who can open the student) or private (author only) ──
const NOTE_VISIBILITY = ['public', 'private'];
const MAX_NOTE_LENGTH = 5000;
const noteText = v => String(v ?? '').trim().slice(0, MAX_NOTE_LENGTH);

/** Loads the student and the note, 404ing when either is missing or the note isn't visible to the caller. */
async function loadNote(req, res) {
  const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('name role counselorNotes');
  const note = student?.counselorNotes.id(req.params.noteId);
  if (!student || !note || !canSee(note, req.user.id)) {
    res.status(404).json({ message: 'Note not found' });
    return {};
  }
  return { student, note };
}

// GET /api/students/:id/notes — public notes plus the caller's own private ones
router.get('/:id/notes', authMiddleware, can('students.view'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('counselorNotes').lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json({ notes: notesFor(student, req.user.id) });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/students/:id/notes — add a note ({ text, visibility }; private unless told otherwise)
router.post('/:id/notes', authMiddleware, can('notes.create'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  const text = noteText(req.body.text);
  const visibility = req.body.visibility === 'public' ? 'public' : 'private';
  if (!text) return res.status(400).json({ message: 'Note text is required' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const author = await User.findById(req.user.id).select('name').lean();
    const student = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'student' },
      { $push: { counselorNotes: { text, visibility, counselorId: String(req.user.id), counselorName: author?.name || 'Staff' } } },
      { new: true, projection: { name: 1, counselorNotes: 1 } },
    ).lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });
    // The activity log is shared with other staff, so it records that a note was added, never its text
    recordStaffActivity(req, {
      kind: 'note', title: visibility === 'public' ? 'Public note added' : 'Private note added',
      studentId: student._id, studentName: student.name,
    });
    res.status(201).json({ notes: notesFor(student, req.user.id) });
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/students/:id/notes/:noteId — the author edits the text and/or switches public ↔ private
router.put('/:id/notes/:noteId', authMiddleware, can('notes.create'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  const text = req.body.text !== undefined ? noteText(req.body.text) : undefined;
  const { visibility } = req.body;
  if (text === '') return res.status(400).json({ message: 'Note text is required' });
  if (visibility !== undefined && !NOTE_VISIBILITY.includes(visibility)) {
    return res.status(400).json({ message: 'Visibility must be public or private' });
  }
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const { student, note } = await loadNote(req, res);
    if (!note) return;
    if (!isAuthor(note, req.user.id)) return res.status(403).json({ message: 'Only the author can edit this note' });
    if (text !== undefined) note.text = text;
    if (visibility !== undefined) note.visibility = visibility;
    await student.save();
    res.json({ notes: notesFor(student, req.user.id) });
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/students/:id/notes/:noteId — the author, or an admin for a public note
router.delete('/:id/notes/:noteId', authMiddleware, can('notes.delete'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const { student, note } = await loadNote(req, res);
    if (!note) return;
    if (!isAuthor(note, req.user.id) && !(req.user.role === 'admin' && isPublic(note))) {
      return res.status(403).json({ message: 'Only the author can delete this note' });
    }
    student.counselorNotes.pull(note._id);
    await student.save();
    res.json({ notes: notesFor(student, req.user.id) });
  } catch (err) { logError('students', err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
