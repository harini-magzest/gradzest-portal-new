const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const University = require('../models/University');
const authMiddleware = require('../middleware/auth');
const { checkEligibility } = require('../lib/eligibilityChecker');
const { recordStaffActivity } = require('../lib/staffActivity');
const { fireEvent } = require('../lib/automation');
const { can, loadAccess, studentFilter, canView } = require('../lib/access');

const statusLabel = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const router = express.Router();

// Get applications
router.get('/', authMiddleware, can('applications.view'), async (req, res) => {
  try {
    if (req.user.role === 'student') {
      const user = await User.findById(req.user.id).select('applications');
      return res.json(user?.applications || []);
    }
    if (req.user.role === 'counselor') {
      // Role-restricted counselors see their whole team's applications; others only their own
      const teamFilter = studentFilter(await loadAccess(req));
      const students = await User.find({ role: 'student', ...(teamFilter || { counselorId: req.user.id }) }).select('applications name');
      const apps = students.flatMap(s =>
        s.applications.map(a => ({ ...a.toJSON(), studentName: s.name, studentId: s._id }))
      );
      return res.json(apps);
    }
    res.json([]);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Fields a student may supply when applying. Everything else on an application
// (offer letter, offer type, staff comments/notes, ids) is staff- or server-controlled.
const STUDENT_APPLICATION_FIELDS = [
  'universityId', 'universityName', 'courseId', 'courseName', 'intake', 'studyMode', 'scholarshipInterest',
  'dateOfBirth', 'gender', 'passportNumber', 'phone', 'address',
  'educationLevel', 'previousInstitution', 'previousDegree', 'previousMajor', 'graduationYear', 'percentage',
  'englishTest', 'moi', 'englishProficiencyTest', 'fundingSource', 'sponsorName',
  'whyCourse', 'careerGoals', 'whyUniversity', 'documentsChecklist',
];

// Create application (student only)
router.post('/', authMiddleware, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  if (!req.body.universityName || !req.body.courseName) {
    return res.status(400).json({ message: 'universityName and courseName are required' });
  }
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  try {
    const supplied = Object.fromEntries(STUDENT_APPLICATION_FIELDS.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]));
    const app = { ...supplied, studentId: req.user.id, submittedDate: today, updatedDate: now, statusChangedAt: now, status: 'submitted' };
    const user = await User.findByIdAndUpdate(req.user.id, { $push: { applications: app } }, { new: true }).select('-password');
    const newApp = user.applications[user.applications.length - 1];
    fireEvent('application.created', { studentId: user._id, application: newApp });
    res.json(newApp.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add comment to application
router.post('/:appId/comments', authMiddleware, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: 'Comment text required' });
  try {
    const poster = await User.findById(req.user.id).select('name role');
    const comment = { author: poster.name, authorRole: poster.role, text: text.trim() };
    const user = await User.findOneAndUpdate(
      { 'applications._id': req.params.appId },
      { $push: { 'applications.$.comments': comment } },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'Application not found' });
    const app = user.applications.find(a => a._id.toString() === req.params.appId);
    recordStaffActivity(req, { kind: 'comment', title: 'Commented on application', detail: `${app.universityName}: "${text.trim().slice(0, 120)}"`, studentId: user._id, studentName: user.name });

    // Notify the student if the commenter is not the student themselves
    if (req.user.role !== 'student') {
      const io = req.app.get('io');
      const userSockets = req.app.get('userSockets');
      const sids = userSockets?.get(String(user._id));
      if (io && sids) sids.forEach(sid => io.to(sid).emit('application:commented', {
        appId: req.params.appId,
        universityName: app.universityName,
        courseName: app.courseName,
        author: poster.name,
      }));
    }

    res.json(app.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update application status
router.put('/:appId', authMiddleware, can('applications.edit'), async (req, res) => {
  const { status, notes, offerType } = req.body;
  try {
    // Find current status before updating (to store rejectedFrom)
    const existing = await User.findOne({ 'applications._id': req.params.appId }).select('applications.$ counselorId');
    if (existing && req.user.role === 'counselor' && !canView(await loadAccess(req), existing)) {
      return res.status(403).json({ message: 'This student is outside your team' });
    }
    const currentStatus = existing?.applications?.[0]?.status;

    const updateFields = { 'applications.$.status': status, 'applications.$.updatedDate': new Date().toISOString() };
    if (notes !== undefined) updateFields['applications.$.notes'] = notes;
    if (status && status !== currentStatus) updateFields['applications.$.statusChangedAt'] = new Date();
    if (status === 'rejected' && currentStatus) updateFields['applications.$.rejectedFrom'] = currentStatus;
    if (offerType !== undefined) updateFields['applications.$.offerType'] = status === 'offer_received' ? offerType : '';

    const user = await User.findOneAndUpdate(
      { 'applications._id': req.params.appId },
      { $set: updateFields },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'Application not found' });
    const app = user.applications.find(a => a._id.toString() === req.params.appId);
    if (status && status !== currentStatus) {
      recordStaffActivity(req, {
        kind: 'application', title: 'Application status updated',
        detail: `${app.universityName} – ${app.courseName}: '${statusLabel(currentStatus)}' to '${statusLabel(status)}'`,
        studentId: user._id, studentName: user.name,
      });
      fireEvent('application.statusChanged', { studentId: user._id, application: app, fromStatus: currentStatus });
    }

    // Notify student in real-time via socket
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    if (io && userSockets && status) {
      const sids = userSockets.get(String(user._id));
      if (sids) {
        sids.forEach(sid => io.to(sid).emit('application:updated', {
          appId: req.params.appId,
          status,
          universityName: app.universityName,
          courseName: app.courseName,
        }));
      }
    }

    // Email fallback for critical status changes
    const CRITICAL = ['offer_received', 'accepted', 'rejected'];
    if (CRITICAL.includes(status) && user.email) {
      const STATUS_LABEL = { offer_received: 'Offer Received', accepted: 'Accepted', rejected: 'Rejected' };
      const isGood = status !== 'rejected';
      const mailer = req.app.get('mailer');
      if (mailer) {
        mailer.sendMail({
          from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: user.email,
          subject: `Application Update: ${app.universityName} — ${STATUS_LABEL[status]}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
              <div style="background:#3b0764;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
              </div>
              <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                <p style="font-size:16px;">Hi ${user.name},</p>
                <p style="font-size:15px;line-height:1.6;">Your application for <strong>${app.courseName}</strong> at <strong>${app.universityName}</strong> has been updated:</p>
                <div style="margin:20px 0;padding:16px 20px;background:${isGood ? '#f0fdf4' : '#fef2f2'};border-left:4px solid ${isGood ? '#16a34a' : '#dc2626'};border-radius:4px;">
                  <p style="margin:0;font-size:18px;font-weight:bold;color:${isGood ? '#15803d' : '#b91c1c'};">${STATUS_LABEL[status]}</p>
                </div>
                <p style="font-size:14px;color:#6b7280;">Log in to your Gradzest portal to view full details and take action.</p>
              </div>
            </div>`,
        }).catch(() => {});
      }
    }

    res.json(app.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Check eligibility for all courses in a university (bulk)
router.post('/check-eligibility-bulk', authMiddleware, async (req, res) => {
  const { universityId, studentId } = req.body;
  if (!universityId) return res.status(400).json({ message: 'universityId required' });
  try {
    let student;
    if (req.user.role === 'student') {
      student = await User.findById(req.user.id).select('-password');
    } else if (studentId) {
      student = await User.findById(studentId).select('-password');
    } else {
      return res.status(400).json({ message: 'studentId required for non-student users' });
    }
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const query = { $or: [{ id: universityId }] };
    if (mongoose.isValidObjectId(universityId)) query.$or.push({ _id: universityId });
    const uni = await University.findOne(query);
    if (!uni) return res.status(404).json({ message: 'University not found' });

    const results = {};
    for (const course of uni.courses) {
      const key = course.id || course._id?.toString();
      results[key] = checkEligibility(student, course.requirements || []);
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Check eligibility for a single course
router.post('/check-eligibility', authMiddleware, async (req, res) => {
  const { universityId, courseId, studentId } = req.body;
  if (!universityId || !courseId) return res.status(400).json({ message: 'universityId and courseId required' });
  try {
    let student;
    if (req.user.role === 'student') {
      student = await User.findById(req.user.id).select('-password');
    } else if (studentId) {
      student = await User.findById(studentId).select('-password');
    } else {
      return res.status(400).json({ message: 'studentId required for non-student users' });
    }
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const query = { $or: [{ id: universityId }] };
    if (mongoose.isValidObjectId(universityId)) query.$or.push({ _id: universityId });
    const uni = await University.findOne(query);
    if (!uni) return res.status(404).json({ message: 'University not found' });

    const course = uni.courses.find(c => c.id === courseId || c._id?.toString() === courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    res.json(checkEligibility(student, course.requirements || []));
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
