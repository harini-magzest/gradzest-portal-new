const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const { scanUploadedFile } = require('../middleware/scanUpload');
const { uploadToS3IfConfigured } = require('../middleware/uploadToS3IfConfigured');
const { logPiiAccess } = require('../lib/logPiiAccess');
const attachUserEmail = require('../middleware/attachUserEmail');
const { recordStaffActivity } = require('../lib/staffActivity');
const { fireEvent } = require('../lib/automation');
const { can, loadAccess, studentFilter, canView, canManage, denyStudent } = require('../lib/access');

const router = express.Router();

// Get all students (counselor only)
router.get('/', authMiddleware, attachUserEmail, async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  try {
    const students = await User.find({ role: 'student' }).select('-password');
    const io = req.app.get('io');
    students.forEach((s) => logPiiAccess({ accessor: req.user, applicant: s, accessType: 'list', ip: req.ip, io }));
    res.json(students.map(s => s.toJSON()));
  } catch {
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

// Update current student profile
router.put('/me', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  // leadStatus/source are admin-managed lead-tracking fields, never writable by the student
  const { password, role, _id, __v, leadStatus, source, ...updates } = req.body;
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
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Add document (student only) — accepts multipart/form-data with optional file
router.post('/me/documents', authMiddleware, upload.single('file'), scanUploadedFile, uploadToS3IfConfigured, async (req, res) => {
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
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete own document (student)
router.delete('/me/documents/:docId', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { documents: { _id: req.params.docId } } });
    res.json({ message: 'Document deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new student (counselor only)
router.post('/', authMiddleware, can('students.create'), async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  const { password, role, _id, ...data } = req.body;
  if (!data.name || !data.email) return res.status(400).json({ message: 'Name and email are required' });
  try {
    const existing = await User.findOne({ email: data.email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists' });
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    // Generate a random 12-char password instead of a hardcoded default
    const tempPassword = crypto.randomBytes(6).toString('hex'); // e.g. "a3f8c1d2e5b7"
    const hashed = await bcrypt.hash(tempPassword, 10);
    const student = new User({ ...data, email: data.email.toLowerCase(), password: hashed, role: 'student', emailVerified: true, source: 'counselor_created', leadStatus: undefined, counselorId: req.user.id });
    await student.save();
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { assignedStudents: student._id.toString() } });

    // Email the student their login credentials
    const mailer = req.app.get('mailer');
    if (mailer && data.email) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      mailer.sendMail({
        from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: data.email.toLowerCase(),
        subject: 'Your Gradzest Account Has Been Created',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
            <div style="background:#0d1b4b;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
            </div>
            <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
              <p style="font-size:16px;">Hi ${data.name},</p>
              <p style="font-size:15px;">Your counselor has created a Gradzest account for you. Here are your login credentials:</p>
              <div style="margin:20px 0;padding:16px 20px;background:#f0f4ff;border-left:4px solid #0d1b4b;border-radius:4px;">
                <p style="margin:0 0 8px;font-size:14px;"><strong>Email:</strong> ${data.email.toLowerCase()}</p>
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
    // Return tempPassword so the counselor can share it manually if email fails
    recordStaffActivity(req, { kind: 'student', title: 'Student added', detail: student.email, studentId: student._id, studentName: student.name });
    fireEvent('student.created', { studentId: student._id });
    res.status(201).json({ ...obj, tempPassword });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
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
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

const COUNSELOR_EDITABLE_FIELDS = ['name', 'phone', 'nationality', 'educationLevel', 'gpa', 'englishScore', 'preferredCountries', 'budget', 'interestedCourses', 'status'];

// Update an assigned student's profile (counselor only)
router.put('/:id', authMiddleware, can('students.edit'), async (req, res) => {
  if (req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id, { manage: true })) return;
    const updates = {};
    for (const field of COUNSELOR_EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.name !== undefined && !String(updates.name).trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }
    const student = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'student' },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
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
  } catch {
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
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/students/:id/record — timeline, activities, emails and chats for the student record tabs
router.get('/:id/record', authMiddleware, can('students.view'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
  } catch { return res.status(500).json({ message: 'Server error' }); }
  const StaffActivity = require('../models/StaffActivity');
  const ActivityLog = require('../models/ActivityLog');
  const EmailLog = require('../models/EmailLog');
  const Meeting = require('../models/Meeting');
  const ChatRoom = require('../models/ChatRoom');
  try {
    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('name email createdAt joinedDate source applications documents counselorId');
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
    staffActs.forEach(a => timeline.push({ id: String(a._id), at: a.createdAt, kind: a.kind, title: a.title, by: a.actorName, detail: a.detail }));
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
    res.status(500).json({ message: err.message || 'Server error' });
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
  } catch { res.status(500).json({ message: 'Server error' }); }
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
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/students/:id/notes — add a note
router.post('/:id/notes', authMiddleware, can('notes.create'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: 'Note text is required' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const author = await User.findById(req.user.id).select('name');
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $push: { counselorNotes: { text: text.trim(), counselorId: req.user.id, counselorName: author?.name || 'Counselor' } } },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'Student not found' });
    recordStaffActivity(req, { kind: 'note', title: 'Note added', detail: text.trim().slice(0, 140), studentId: user._id, studentName: user.name });
    res.json(user.toJSON());
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/students/:id/notes/:noteId — edit a note
router.put('/:id/notes/:noteId', authMiddleware, can('notes.create'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: 'Note text is required' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, 'counselorNotes._id': req.params.noteId },
      { $set: { 'counselorNotes.$.text': text.trim() } },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json(user.toJSON());
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/students/:id/notes/:noteId — delete a note
router.delete('/:id/notes/:noteId', authMiddleware, can('notes.delete'), async (req, res) => {
  if (!['counselor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    if (await denyStudent(req, res, req.params.id)) return;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $pull: { counselorNotes: { _id: req.params.noteId } } },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json(user.toJSON());
  } catch { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
