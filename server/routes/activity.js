const express = require('express');
const router  = express.Router();
const ActivityLog  = require('../models/ActivityLog');
const authMiddleware = require('../middleware/auth');
const { logActivity } = require('../middleware/logActivity');
const mongoose = require('mongoose');
const User = require('../models/User');
const { loadAccess, studentFilter } = require('../lib/access');

// What this caller is allowed to read from the platform-wide activity log. Admins (including the
// Application Team) see everything; a counselor sees events for their own students; a student sees
// only events about themselves. Previously every signed-in user could read every student's events.
async function activityScope(req) {
  if (req.user.role === 'admin') return {};
  if (req.user.role === 'student') return { studentId: new mongoose.Types.ObjectId(req.user.id) };
  if (req.user.role === 'counselor') {
    const teamFilter = studentFilter(await loadAccess(req));
    const mine = await User.find({ role: 'student', ...(teamFilter || { counselorId: req.user.id }) }).select('_id').lean();
    return { $or: [{ counsellorId: new mongoose.Types.ObjectId(req.user.id) }, { studentId: { $in: mine.map((u) => u._id) } }] };
  }
  return { _id: null }; // any other role: nothing
}

// ── GET /api/activity ────────────────────────────────────────────────────────
// Query params:
//   limit  – max events to return (default 50, max 200)
//   since  – ISO timestamp; only return events newer than this
//   type   – filter by event type (omit or "all" for no filter)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { since, type } = req.query;

    const scope = await activityScope(req);
    const query = { ...scope };
    if (since) query.createdAt = { $gt: new Date(since) };
    if (type && type !== 'all') query.type = type;

    const events = await ActivityLog
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Per-type totals for the stats bar
    const rawCounts = await ActivityLog.aggregate([
      { $match: scope },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);
    const counts = rawCounts.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {});

    res.json({ events, counts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/activity/seed ──────────────────────────────────────────────────
// Dev-only: inserts sample events so the feed is not empty on first load.
router.post('/seed', authMiddleware, async (req, res) => {
  // Never reachable in production — this is a local/dev convenience only.
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ message: 'Not found' });
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ message: 'Not found' });

  const samples = [
    { type: 'enquiry',   action: 'submitted new enquiry',       detail: 'MS CS — University of Toronto, Canada',              studentName: 'Aryan Sharma' },
    { type: 'visa',      action: 'visa application approved',   detail: 'Student visa (F-1) — USA · Intake: September 2025',   studentName: 'Priya Patel' },
    { type: 'payment',   action: 'made payment',                detail: 'Application fee — ₹15,000 · Ref #PY9821',             studentName: 'Mohammed Al-Rashid' },
    { type: 'alert',     action: 'document deadline in 3 days', detail: 'SOP & LORs pending for Monash University',            studentName: 'System' },
    { type: 'offer',     action: 'received university offer',   detail: 'University of Melbourne — MBA · Conditional offer',   studentName: 'Nguyen Thi Lan' },
    { type: 'document',  action: 'uploaded documents',          detail: 'Passport, marksheet, IELTS scorecard',                studentName: 'Sara Ahmed' },
    { type: 'interview', action: 'visa interview scheduled',    detail: 'VFS Global, Hyderabad — 12 June, 10:30 AM',           studentName: 'Aryan Sharma' },
  ];

  try {
    const created = [];
    for (const s of samples) {
      const entry = await logActivity(s.type, s.action, s.detail, null, { studentName: s.studentName });
      if (entry) created.push(entry);
    }
    res.json({ seeded: created.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
