const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const University = require('../models/University');
const Country = require('../models/Country');
const Subscriber = require('../models/Subscriber');
const authMiddleware = require('../middleware/auth');
const { fetchEnrichmentData, clearCache } = require('../lib/enrichUniversity');

const router = express.Router();

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
}

// Stats overview
router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [students, counselors] = await Promise.all([
      User.find({ role: 'student' }),
      User.find({ role: 'counselor' }),
    ]);
    const totalApplications = students.reduce((sum, s) => sum + (s.applications?.length || 0), 0);
    const activeStudents = students.filter(s => s.status === 'active').length;
    res.json({ totalStudents: students.length, totalCounselors: counselors.length, totalApplications, activeStudents });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// List all counselors
router.get('/counselors', authMiddleware, adminOnly, async (req, res) => {
  try {
    const counselors = await User.find({ role: 'counselor' }).select('-password');
    res.json(counselors.map(c => c.toJSON()));
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create counselor (admin only)
router.post('/counselors', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, password, ...rest } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const counselor = new User({
      ...rest,
      name, email: email.toLowerCase(), password: hashed, role: 'counselor',
      specialization: rest.specialization || [], assignedStudents: [],
      experience: rest.experience || 0,
      emailVerified: true,
    });
    await counselor.save();
    const obj = counselor.toJSON();
    delete obj.password;
    res.status(201).json(obj);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Update counselor
router.put('/counselors/:id', authMiddleware, adminOnly, async (req, res) => {
  const { password, role, _id, ...updates } = req.body;
  try {
    const counselor = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'counselor' },
      updates, { new: true }
    ).select('-password');
    if (!counselor) return res.status(404).json({ message: 'Counselor not found' });
    res.json(counselor.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete counselor
router.delete('/counselors/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await User.findOneAndDelete({ _id: req.params.id, role: 'counselor' });
    res.json({ message: 'Counselor deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// List all admin-role users (including app team members)
router.get('/appteam-users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: 'admin' }).select('-password');
    res.json(users.map(u => u.toJSON()));
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle isAppTeam for an admin user
router.put('/users/:id/appteam', authMiddleware, adminOnly, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'admin' },
      { isAppTeam: !!req.body.isAppTeam },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create an Application Team member (admin-role account, isAppTeam: true). Open to any
// admin — same permission as creating a counselor, not restricted to non-appteam admins.
router.post('/appteam', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const member = new User({
      name, email: email.toLowerCase(), password: hashed,
      role: 'admin', isAppTeam: true, emailVerified: true,
    });
    await member.save();
    const obj = member.toJSON();
    delete obj.password;
    res.status(201).json(obj);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Update an Application Team member — scoped to isAppTeam admins only, so this can never
// touch a non-appteam admin account even if someone guesses another user's id.
router.put('/appteam/:id', authMiddleware, adminOnly, async (req, res) => {
  const { password, role, isAppTeam, _id, ...updates } = req.body;
  try {
    if (password) updates.password = await bcrypt.hash(password, 10);
    const member = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'admin', isAppTeam: true },
      updates, { new: true }
    ).select('-password');
    if (!member) return res.status(404).json({ message: 'Application Team member not found' });
    res.json(member.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Delete an Application Team member — same strict scoping as update, for the same reason.
router.delete('/appteam/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const deleted = await User.findOneAndDelete({ _id: req.params.id, role: 'admin', isAppTeam: true });
    if (!deleted) return res.status(404).json({ message: 'Application Team member not found' });
    res.json({ message: 'Application Team member deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create student (admin only)
router.post('/students', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, password, phone, nationality, educationLevel, gpa, englishScore, budget, preferredCountries, interestedCourses, counselorId } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  try {
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(password, 10);
    const student = new User({
      name, email: email.toLowerCase(), password: hashed, role: 'student',
      phone: phone || '', nationality: nationality || '', educationLevel: educationLevel || '',
      gpa: gpa || null, englishScore: englishScore || undefined,
      budget: budget || null, preferredCountries: preferredCountries || [],
      interestedCourses: interestedCourses || [], status: 'active',
      joinedDate: new Date().toISOString().split('T')[0],
      emailVerified: true,
      source: 'admin_created',
    });
    await student.save();
    if (counselorId) {
      await User.findByIdAndUpdate(counselorId, { $push: { assignedStudents: student._id.toString() } });
    }
    const obj = student.toJSON();
    delete obj.password;
    res.status(201).json(obj);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// List all students
router.get('/students', authMiddleware, adminOnly, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('-password');
    res.json(students.map(s => s.toJSON()));
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Count of self-signups nobody has picked up yet (drives the sidebar badge)
router.get('/leads/count', authMiddleware, adminOnly, async (req, res) => {
  try {
    const count = await User.countDocuments({ role: 'student', leadStatus: 'new' });
    res.json({ count });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark a lead as contacted (or back to new)
router.put('/students/:id/lead-status', authMiddleware, adminOnly, async (req, res) => {
  const { leadStatus } = req.body || {};
  if (!['new', 'contacted'].includes(leadStatus)) {
    return res.status(400).json({ message: "leadStatus must be 'new' or 'contacted'" });
  }
  try {
    const student = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'student' },
      { leadStatus },
      { new: true }
    ).select('-password');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update student status
router.put('/students/:id/status', authMiddleware, adminOnly, async (req, res) => {
  const { status } = req.body;
  try {
    const student = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'student' },
      { status }, { new: true }
    ).select('-password');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student.toJSON());
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete student
router.delete('/students/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await User.findOneAndDelete({ _id: req.params.id, role: 'student' });
    res.json({ message: 'Student deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Assign student to counselor (or unassign)
router.put('/students/:id/assign', authMiddleware, adminOnly, async (req, res) => {
  const { counselorId } = req.body;
  try {
    const student = await User.findOne({ _id: req.params.id, role: 'student' });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const prevCounselorId = student.counselorId;
    const studentId = student._id.toString();

    if (prevCounselorId) {
      await User.findByIdAndUpdate(prevCounselorId, { $pull: { assignedStudents: studentId } });
    }

    student.counselorId = counselorId || undefined;
    // Assigning a counselor means someone has picked the lead up
    if (counselorId && student.leadStatus === 'new') student.leadStatus = 'contacted';
    await student.save();

    if (counselorId) {
      await User.findByIdAndUpdate(counselorId, { $addToSet: { assignedStudents: studentId } });
    }

    const updated = await User.findById(req.params.id).select('-password');

    // Notify student and new counselor in real-time
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    if (io && userSockets && counselorId) {
      const counselor = await User.findById(counselorId).select('name email');
      // Notify student
      const studentSids = userSockets.get(studentId);
      if (studentSids) studentSids.forEach(sid => io.to(sid).emit('counselor:assigned', {
        counselorName: counselor?.name || 'Your counselor',
      }));
      // Notify counselor
      const counselorSids = userSockets.get(String(counselorId));
      if (counselorSids) counselorSids.forEach(sid => io.to(sid).emit('student:assigned', {
        studentName: student.name,
      }));
      // Email student
      if (student.email && counselor) {
        const mailer = req.app.get('mailer');
        if (mailer) mailer.sendMail({
          from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: student.email,
          subject: 'Your Counselor Has Been Assigned',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
              <div style="background:#3b0764;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
                <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
              </div>
              <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                <p style="font-size:16px;">Hi ${student.name},</p>
                <p style="font-size:15px;line-height:1.6;"><strong>${counselor.name}</strong> has been assigned as your counselor. They will guide you through your study abroad journey.</p>
                <p style="font-size:14px;color:#6b7280;">Log in to your Gradzest portal to connect with your counselor.</p>
              </div>
            </div>`,
        }).catch(() => {});
      }
    }

    res.json(updated.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Create application for a student (admin or counselor)
router.post('/applications', authMiddleware, async (req, res) => {
  if (!['admin', 'counselor'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const { studentId, universityName, courseName, intake, universityId, courseId } = req.body;
  if (!studentId || !universityName || !courseName) {
    return res.status(400).json({ message: 'studentId, universityName, and courseName are required' });
  }
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  try {
    const app = {
      universityName, courseName,
      intake: intake || '',
      universityId: universityId || '',
      courseId: courseId || '',
      status: 'submitted',
      submittedDate: today,
      updatedDate: now,
    };
    const student = await User.findOneAndUpdate(
      { _id: studentId, role: 'student' },
      { $push: { applications: app } },
      { new: true }
    ).select('-password');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const newApp = student.applications[student.applications.length - 1];
    res.json(newApp.toJSON ? newApp.toJSON() : newApp);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// List all applications across all students
router.get('/applications', authMiddleware, adminOnly, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('-password');
    const applications = [];
    for (const student of students) {
      for (const app of (student.applications || [])) {
        const appObj = app.toJSON ? app.toJSON() : app;
        applications.push({
          ...appObj,
          studentId: student._id.toString(),
          studentName: student.name,
          studentEmail: student.email,
          studentNationality: student.nationality,
        });
      }
    }
    res.json(applications);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update application status (admin only)
router.put('/applications/:studentId/:appId', authMiddleware, adminOnly, async (req, res) => {
  const { status, notes, offerType } = req.body;
  try {
    const existing = await User.findOne({ _id: req.params.studentId, 'applications._id': req.params.appId }).select('applications.$');
    const currentStatus = existing?.applications?.[0]?.status;

    const update = { 'applications.$.updatedDate': new Date().toISOString() };
    if (status) update['applications.$.status'] = status;
    if (notes !== undefined) update['applications.$.notes'] = notes;
    if (status === 'rejected' && currentStatus) update['applications.$.rejectedFrom'] = currentStatus;
    if (offerType !== undefined) update['applications.$.offerType'] = status === 'offer_received' ? offerType : '';

    const student = await User.findOneAndUpdate(
      { _id: req.params.studentId, 'applications._id': req.params.appId },
      { $set: update },
      { new: true }
    ).select('-password');

    if (!student) return res.status(404).json({ message: 'Application not found' });

    const app = student.applications.id(req.params.appId);
    if (!app) return res.status(404).json({ message: 'Application not found' });

    // Notify student in real-time via socket
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    if (io && userSockets && status) {
      const sids = userSockets.get(String(student._id));
      if (sids) {
        sids.forEach(sid => io.to(sid).emit('application:updated', {
          appId: req.params.appId,
          status,
          universityName: app.universityName,
          courseName: app.courseName,
        }));
      }
    }

    const appObj = app.toJSON ? app.toJSON() : app;
    res.json({
      ...appObj,
      studentId: student._id.toString(),
      studentName: student.name,
      studentEmail: student.email,
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Universities CRUD ────────────────────────────────────────────────────────

router.get('/universities', authMiddleware, adminOnly, async (req, res) => {
  try {
    const unis = await University.find({});
    res.json(unis);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.post('/universities', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, country, city, ranking, type, founded, website, description,
            logo, coverImage,
            acceptanceRate, totalStudents, internationalStudents, rating, tags,
            averageFees, courses, facilities, scholarships, applicationDeadlines } = req.body;
    if (!name || !country) return res.status(400).json({ message: 'Name and country are required' });

    // Run enrichment inline so courses + details are populated on creation
    let enriched = {};
    try {
      clearCache(name);
      enriched = await fetchEnrichmentData(name);
    } catch (enrichErr) {
      console.error('Inline enrichment failed for', name, ':', enrichErr.message);
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();

    // Merge: values the admin typed take priority; enriched data fills gaps
    const mergedCourses = (() => {
      const base = courses || [];
      const extra = enriched.courses || [];
      if (!extra.length) return base;
      const seen = new Set(base.map(c => c.name?.toLowerCase()));
      return [...base, ...extra.filter(c => !seen.has(c.name?.toLowerCase()))];
    })();

    const uni = new University({
      id, name,
      country: country || enriched.country || '',
      city: city || enriched.city || '',
      ranking,
      type: type || enriched.type || '',
      founded: founded || enriched.founded || '',
      website: website || enriched.website || '',
      description: description || enriched.description || '',
      logo: logo || enriched.logo || '',
      coverImage: coverImage || enriched.coverImage || '',
      acceptanceRate, totalStudents: totalStudents || enriched.totalStudents,
      internationalStudents, rating,
      tags: tags || [],
      facilities: facilities || [],
      averageFees: averageFees || {},
      courses: mergedCourses,
      scholarships: scholarships || [],
      applicationDeadlines: applicationDeadlines || [],
      socialLinks: enriched.socialLinks || {},
      enrichedAt: Object.keys(enriched).length ? new Date() : undefined,
      enrichmentStatus: Object.keys(enriched).length ? 'done' : undefined,
    });
    await uni.save();
    res.status(201).json(uni);
  } catch (err) { res.status(500).json({ message: err.message || 'Server error' }); }
});

// Bulk enrich all universities missing logo or cover image
router.post('/universities/enrich-all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const unis = await University.find({
      $or: [{ logo: '' }, { logo: null }, { coverImage: '' }, { coverImage: null }],
    });
    res.json({ message: `Started enriching ${unis.length} universities`, count: unis.length });

    setImmediate(async () => {
      for (const uni of unis) {
        try {
          clearCache(uni.name);
          const data = await fetchEnrichmentData(uni.name);
          const update = { enrichedAt: new Date(), enrichmentStatus: 'done' };
          if (data.logo) update.logo = data.logo;
          if (data.coverImage) update.coverImage = data.coverImage;
          if (data.country && !uni.country) update.country = data.country;
          if (data.city && !uni.city) update.city = data.city;
          if (data.type && !uni.type) update.type = data.type;
          if (data.founded && !uni.founded) update.founded = data.founded;
          if (data.website && !uni.website) update.website = data.website;
          if (data.description && !uni.description) update.description = data.description;
          if (data.socialLinks) update.socialLinks = data.socialLinks;
          if (data.courses?.length) {
            const existingNames = new Set((uni.courses || []).map(c => c.name?.toLowerCase()));
            const newCourses = data.courses.filter(c => !existingNames.has(c.name?.toLowerCase()));
            if (newCourses.length) update.courses = [...(uni.courses || []), ...newCourses];
          }
          await University.findByIdAndUpdate(uni._id, update);
          await new Promise(r => setTimeout(r, 600)); // ~1.6 req/sec to avoid rate limits
        } catch (err) {
          console.error('Enrich-all failed for', uni.name, ':', err.message);
        }
      }
      console.log(`[enrich-all] Done. Processed ${unis.length} universities.`);
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Force-refresh enrichment data for a university (clears cache too)
router.post('/universities/:id/enrich', authMiddleware, adminOnly, async (req, res) => {
  try {
    const uni = await University.findById(req.params.id);
    if (!uni) return res.status(404).json({ message: 'University not found' });

    clearCache(uni.name); // bypass 24h cache for manual re-enrich
    const data = await fetchEnrichmentData(uni.name);

    const update = { enrichedAt: new Date(), enrichmentStatus: 'done' };
    if (data.logo) update.logo = data.logo;
    if (data.coverImage) update.coverImage = data.coverImage;
    if (data.country) update.country = data.country;
    if (data.city) update.city = data.city;
    if (data.type) update.type = data.type;
    if (data.founded) update.founded = data.founded;
    if (data.website) update.website = data.website;
    if (data.description) update.description = data.description;
    if (data.socialLinks) update.socialLinks = data.socialLinks;
    if (data.courses?.length) {
      const existingNames = new Set((uni.courses || []).map(c => c.name?.toLowerCase()));
      const newCourses = data.courses.filter(c => !existingNames.has(c.name?.toLowerCase()));
      if (newCourses.length) update.courses = [...(uni.courses || []), ...newCourses];
    }

    const updated = await University.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(updated);
  } catch (err) {
    console.error('Enrich error:', err.message);
    res.status(500).json({ message: 'Enrichment failed: ' + (err.message || 'Unknown error') });
  }
});

router.put('/universities/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { _id, __v, ...updates } = req.body;
    const uni = await University.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!uni) return res.status(404).json({ message: 'University not found' });
    res.json(uni);
  } catch (err) { res.status(500).json({ message: err.message || 'Server error' }); }
});

router.delete('/universities/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await University.findByIdAndDelete(req.params.id);
    res.json({ message: 'University deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Course CRUD within a university
router.post('/universities/:id/courses', authMiddleware, adminOnly, async (req, res) => {
  try {
    const uni = await University.findById(req.params.id);
    if (!uni) return res.status(404).json({ message: 'University not found' });
    const courseId = 'course-' + Date.now();
    uni.courses.push({ ...req.body, id: courseId });
    await uni.save();
    res.status(201).json(uni);
  } catch (err) { res.status(500).json({ message: err.message || 'Server error' }); }
});

router.put('/universities/:id/courses/:courseId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const uni = await University.findById(req.params.id);
    if (!uni) return res.status(404).json({ message: 'University not found' });
    const course = uni.courses.id(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    Object.assign(course, req.body);
    await uni.save();
    res.json(uni);
  } catch (err) { res.status(500).json({ message: err.message || 'Server error' }); }
});

router.delete('/universities/:id/courses/:courseId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const uni = await University.findById(req.params.id);
    if (!uni) return res.status(404).json({ message: 'University not found' });
    uni.courses.pull({ _id: req.params.courseId });
    await uni.save();
    res.json(uni);
  } catch (err) { res.status(500).json({ message: err.message || 'Server error' }); }
});

// ── Countries CRUD ───────────────────────────────────────────────────────────

router.get('/countries', authMiddleware, adminOnly, async (req, res) => {
  try {
    const countries = await Country.find({}).sort({ name: 1 });
    res.json(countries);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.post('/countries', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Country name is required' });
    const country = new Country(req.body);
    await country.save();
    res.status(201).json(country);
  } catch (err) { res.status(500).json({ message: err.message || 'Server error' }); }
});

router.put('/countries/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { _id, __v, id: customId, ...updates } = req.body;
    const country = await Country.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!country) return res.status(404).json({ message: 'Country not found' });
    res.json(country);
  } catch (err) { res.status(500).json({ message: err.message || 'Server error' }); }
});

router.delete('/countries/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await Country.findByIdAndDelete(req.params.id);
    res.json({ message: 'Country deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Analytics overview
router.get('/analytics', authMiddleware, adminOnly, async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const periodDays = period === '7d' ? 7 : period === '90d' ? 90 : period === '1yr' ? 365 : 30;
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [students, counselors] = await Promise.all([
      User.find({ role: 'student' }).select('name joinedDate applications counselorId assignedStudents'),
      User.find({ role: 'counselor' }).select('name assignedStudents'),
    ]);

    const newStudents = students.filter(s => s.joinedDate && new Date(s.joinedDate) >= since).length;

    const allApps = students.flatMap(s => s.applications || []);
    const approvedStatuses = ['offer_received', 'visa_approved', 'enrolled'];
    const approvedCount = allApps.filter(a => approvedStatuses.includes(a.status)).length;
    const visaApprovalRate = allApps.length ? Math.round((approvedCount / allApps.length) * 100) : 0;

    const studentsWithApps = students.filter(s => (s.applications || []).length > 0).length;
    const conversionRate = students.length ? Math.round((studentsWithApps / students.length) * 100) : 0;

    const revenue = studentsWithApps * 500;

    // Monthly registrations (last 6 months)
    const monthlyMap = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      monthlyMap[key] = 0;
    }
    students.forEach(s => {
      if (!s.joinedDate) return;
      const d = new Date(s.joinedDate);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (key in monthlyMap) monthlyMap[key]++;
    });
    const monthlyRegistrations = Object.entries(monthlyMap).map(([month, count]) => ({ month, count }));

    // Applications by country (from university name heuristic — use preferredCountries if available)
    const countryCount = {};
    students.forEach(s => (s.applications || []).forEach(a => {
      const country = a.universityCountry || 'Unknown';
      countryCount[country] = (countryCount[country] || 0) + 1;
    }));
    const applicationsByCountry = Object.entries(countryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([country, count]) => ({ country, count }));

    // Conversion funnel
    const totalRegistered = students.length;
    const totalApplied = studentsWithApps;
    const totalOffers = students.filter(s => (s.applications || []).some(a => a.status === 'offer_received' || a.status === 'enrolled' || a.status === 'visa_approved')).length;
    const totalEnrolled = students.filter(s => (s.applications || []).some(a => a.status === 'enrolled')).length;
    const base = totalRegistered || 1;
    const conversionFunnel = [
      { stage: 'Registered', count: totalRegistered, pct: 100 },
      { stage: 'Applied', count: totalApplied, pct: Math.round((totalApplied / base) * 100) },
      { stage: 'Offer Received', count: totalOffers, pct: Math.round((totalOffers / base) * 100) },
      { stage: 'Enrolled', count: totalEnrolled, pct: Math.round((totalEnrolled / base) * 100) },
    ];

    // Counselor performance
    const counselorPerformance = counselors.map(c => {
      const assigned = students.filter(s => s.counselorId?.toString() === c._id.toString());
      const appCount = assigned.reduce((n, s) => n + (s.applications?.length || 0), 0);
      const offerCount = assigned.reduce((n, s) => n + (s.applications || []).filter(a => approvedStatuses.includes(a.status)).length, 0);
      const score = assigned.length ? Math.min(100, Math.round(((offerCount / Math.max(appCount, 1)) * 60) + (Math.min(assigned.length, 10) / 10 * 40))) : 0;
      const workload = assigned.length >= 8 ? 'High' : assigned.length >= 4 ? 'Medium' : 'Low';
      return { name: c.name, students: assigned.length, applications: appCount, offers: offerCount, workload, score };
    });

    // Top universities by number of applications
    const uniCount = {};
    students.forEach(s => (s.applications || []).forEach(a => {
      if (!a.universityName) return;
      uniCount[a.universityName] = (uniCount[a.universityName] || 0) + 1;
    }));
    const topUniversities = Object.entries(uniCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name: name.length > 28 ? name.slice(0, 26) + '…' : name, count }));

    // Application status breakdown
    const statusMap = {};
    allApps.forEach(a => { statusMap[a.status] = (statusMap[a.status] || 0) + 1; });
    const STATUS_LABELS = {
      submitted: 'Submitted', under_review: 'Under Review', offer_received: 'Offer Received',
      accepted: 'Accepted', rejected: 'Rejected', enrolled: 'Enrolled', draft: 'Draft',
    };
    const applicationsByStatus = Object.entries(statusMap)
      .map(([status, count]) => ({ status: STATUS_LABELS[status] || status, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ newStudents, visaApprovalRate, conversionRate, revenue, monthlyRegistrations, applicationsByCountry, conversionFunnel, counselorPerformance, topUniversities, applicationsByStatus });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Email subscribers
router.get('/subscribers', authMiddleware, adminOnly, async (req, res) => {
  try {
    const subscribers = await Subscriber.find().sort({ subscribedAt: -1 });
    res.json(subscribers);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
