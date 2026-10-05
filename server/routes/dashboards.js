const express = require('express');
const User = require('../models/User');
const Task = require('../models/Task');
const LeadAlert = require('../models/LeadAlert');
const authMiddleware = require('../middleware/auth');
const { LEAD_STAGES } = require('../lib/automation');
const { daysSinceStageChange } = require('../lib/leadRisk');
const { scoreLead } = require('../lib/leadScore');
const Meeting = require('../models/Meeting');
const University = require('../models/University');
const { buildConversion } = require('../lib/conversionReport');
const { sendCsv } = require('../lib/csv');

const router = express.Router();

const STALE_DAYS = Number(process.env.ZEST_STALE_DAYS) || 5;
const NON_STALE_STATUSES = ['enrolled', 'dropped_plans'];
const STUCK_APP_STATUSES = ['draft', 'submitted', 'under_review'];
const STUCK_APP_DAYS = 10;
const OFFER_STATUSES = ['offer_received', 'accepted', 'enrolled'];

function requireRole(role) {
  return (req, res, next) => (req.user.role === role ? next() : res.status(403).json({ message: 'Forbidden' }));
}

function daysBetween(dateLike) {
  return dateLike ? Math.floor((Date.now() - new Date(dateLike).getTime()) / 86400000) : null;
}

/* ── Counselor: follow-up queue for their own students ───────────────────── */

router.get('/counselor/followups', authMiddleware, requireRole('counselor'), async (req, res) => {
  const me = String(req.user.id);
  const students = await User.find({ role: 'student', counselorId: me })
    .select('name email leadStageChangedAt createdAt joinedDate status applications').lean();
  const studentById = new Map(students.map(s => [String(s._id), s]));

  const stale = students
    .filter(s => !NON_STALE_STATUSES.includes(s.status))
    .map(s => ({ student: s, days: daysSinceStageChange(s) }))
    .filter(x => x.days !== null && x.days >= STALE_DAYS)
    .map(x => ({ studentId: String(x.student._id), name: x.student.name, days: x.days }))
    .sort((a, b) => b.days - a.days);

  const stuck = [];
  for (const s of students) {
    const app = (s.applications || []).find(a => STUCK_APP_STATUSES.includes(a.status) && daysBetween(a.statusChangedAt || a.submittedDate) >= STUCK_APP_DAYS);
    if (app) stuck.push({ studentId: String(s._id), name: s.name, universityName: app.universityName || '', status: app.status, days: daysBetween(app.statusChangedAt || app.submittedDate) });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const tasks = await Task.find({
    assignedTo: req.user.id, status: { $in: ['pending', 'in_progress'] }, dueDate: { $ne: '', $lt: todayStr },
  }).select('title dueDate studentId studentName').lean();
  const overdueTasks = tasks.map(t => ({
    id: String(t._id), title: t.title, dueDate: t.dueDate,
    studentId: t.studentId ? String(t.studentId) : '',
    studentName: studentById.get(String(t.studentId))?.name || t.studentName || '',
  }));

  res.json({ stale, stuck, overdueTasks, staleDays: STALE_DAYS });
});

/* ── Admin: per-counselor workload ───────────────────────────────────────── */

router.get('/admin/team-workload', authMiddleware, requireRole('admin'), async (req, res) => {
  const counselors = await User.find({ role: 'counselor' }).select('name').lean();
  const students = await User.find({ role: 'student', counselorId: { $ne: null } })
    .select('counselorId leadStageChangedAt createdAt joinedDate status').lean();
  const alerts = await LeadAlert.find({ resolved: false }).select('counselorId').lean();
  const overdue = await Task.find({
    status: { $in: ['pending', 'in_progress'] }, dueDate: { $ne: '', $lt: new Date().toISOString().slice(0, 10) },
  }).select('assignedTo').lean();

  const rows = counselors.map(c => {
    const id = String(c._id);
    const mine = students.filter(s => String(s.counselorId) === id);
    return {
      counselorId: id,
      name: c.name,
      leads: mine.length,
      staleLeads: mine.filter(s => !NON_STALE_STATUSES.includes(s.status) && (daysSinceStageChange(s) ?? -1) >= STALE_DAYS).length,
      openAlerts: alerts.filter(a => String(a.counselorId) === id).length,
      overdueTasks: overdue.filter(t => String(t.assignedTo) === id).length,
    };
  }).sort((a, b) => b.staleLeads - a.staleLeads || b.leads - a.leads);

  res.json({ rows });
});

/* ── Admin: lead-stage funnel ────────────────────────────────────────────── */

router.get('/admin/funnel', authMiddleware, requireRole('admin'), async (req, res) => {
  const counts = await User.aggregate([
    { $match: { role: 'student' } },
    { $group: { _id: { $ifNull: ['$leadStage', 'new_enquiry'] }, count: { $sum: 1 } } },
  ]);
  const byStage = new Map(counts.map(c => [c._id, c.count]));
  const stages = Object.entries(LEAD_STAGES).map(([key, label]) => ({ key, label, count: byStage.get(key) || 0 }));
  res.json({ stages, total: stages.reduce((n, s) => n + s.count, 0) });
});

/* ── Admin: conversion report (lead -> application -> offer -> enrolled), optionally as CSV ─────── */

router.get('/admin/conversion', authMiddleware, requireRole('admin'), async (req, res) => {
  const groupBy = ['counselor', 'country', 'source'].includes(req.query.groupBy) ? req.query.groupBy : 'counselor';
  const parseDate = (v, endOfDay) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return null;
    const d = new Date(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00'}Z`);
    return isNaN(d.getTime()) ? null : d;
  };
  const from = parseDate(req.query.from, false);
  const to = parseDate(req.query.to, true);

  const [students, counselors] = await Promise.all([
    User.find({ role: 'student' }).select('counselorId source preferredCountries applications.status createdAt').lean(),
    User.find({ role: 'counselor' }).select('name').lean(),
  ]);
  const counselorNames = new Map(counselors.map(c => [String(c._id), c.name]));
  const report = buildConversion(students, groupBy, { counselorNames, from, to });

  if (req.query.format === 'csv') {
    const label = { counselor: 'Counselor', country: 'Country', source: 'Lead source' }[groupBy];
    const rows = [...report.rows, { ...report.totals, group: 'Total' }];
    return sendCsv(res, `conversion-by-${groupBy}-${new Date().toISOString().slice(0, 10)}.csv`, [
      { label, key: 'group' }, { label: 'Leads', key: 'leads' }, { label: 'Applied', key: 'applied' },
      { label: 'Offers', key: 'offers' }, { label: 'Enrolled', key: 'enrolled' },
      { label: 'Lead to applied %', key: 'leadToApplied' }, { label: 'Applied to offer %', key: 'appliedToOffer' },
      { label: 'Lead to enrolled %', key: 'leadToEnrolled' },
    ], rows);
  }
  res.json(report);
});

/* ── Admin / App Team / Board: weekly trends ─────────────────────────────── */

router.get('/trends', authMiddleware, requireRole('admin'), async (req, res) => {
  const weeks = 8;
  const since = new Date(Date.now() - weeks * 7 * 86400000);

  const newLeads = await User.aggregate([
    { $match: { role: 'student', createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%G-W%V', date: '$createdAt' } }, count: { $sum: 1 } } },
  ]);
  const offers = await User.aggregate([
    { $match: { role: 'student' } },
    { $unwind: '$applications' },
    { $match: { 'applications.status': { $in: OFFER_STATUSES }, 'applications.statusChangedAt': { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%G-W%V', date: '$applications.statusChangedAt' } }, count: { $sum: 1 } } },
  ]);

  const keys = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 7 * 86400000);
    const isoKey = (() => {
      const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
      return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    })();
    keys.push(isoKey);
  }
  const toMap = arr => new Map(arr.map(r => [r._id, r.count]));
  const newMap = toMap(newLeads), offerMap = toMap(offers);
  res.json({ weeks: keys.map(k => ({ week: k, newLeads: newMap.get(k) || 0, offers: offerMap.get(k) || 0 })) });
});

/* ── Global search (admin: everyone; counselor: their own students; all staff: universities and courses) ── */

router.get('/search', authMiddleware, async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.json({ students: [] });
  if (req.user.role !== 'admin' && req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = {
    role: 'student',
    $or: [{ name: new RegExp(escaped, 'i') }, { email: new RegExp(escaped, 'i') }, { phone: new RegExp(escaped, 'i') }],
    ...(req.user.role === 'counselor' ? { counselorId: String(req.user.id) } : {}),
  };
  const students = await User.find(filter).select('name email phone leadStage').limit(10).lean();
  const body = { students: students.map(s => ({ id: String(s._id), name: s.name, email: s.email || '', phone: s.phone || '', leadStage: s.leadStage || 'new_enquiry' })) };

  // Team: admins find counselors and Application Team members, Application Team finds counselors, counselors nobody
  const re = new RegExp(escaped, 'i');
  const teamRoles = req.user.role === 'counselor' ? null
    : req.user.isAppTeam ? [{ role: 'counselor' }]
    : [{ role: 'counselor' }, { role: 'admin', isAppTeam: true }];
  const [team, unis, courseUnis] = await Promise.all([
    teamRoles ? User.find({ $or: teamRoles, $and: [{ $or: [{ name: re }, { email: re }, { phone: re }] }] })
      .select('name email role isAppTeam').limit(8).lean() : [],
    University.find({ $or: [{ name: re }, { city: re }, { country: re }] }).select('id name city country').limit(8).lean(),
    University.find({ 'courses.name': re }).select('id name courses._id courses.id courses.name courses.level').limit(20).lean(),
  ]);
  body.team = team.map(u => ({ id: String(u._id), name: u.name, email: u.email || '', kind: u.role === 'counselor' ? 'counselor' : 'appteam' }));
  body.universities = unis.map(u => ({ id: u.id || String(u._id), name: u.name, city: u.city || '', country: u.country || '' }));
  body.courses = courseUnis
    .flatMap(u => (u.courses || []).filter(c => re.test(c.name || '')).map(c => ({
      id: String(c._id || c.id), name: c.name, level: c.level || '', universityId: u.id || String(u._id), universityName: u.name,
    })))
    .slice(0, 8);
  res.json(body);
});

/* ── Lead scores: who to call first (admin: everyone; counselor: their own students) ─────────── */

router.get('/leads/scores', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'counselor') return res.status(403).json({ message: 'Forbidden' });
  const filter = { role: 'student', ...(req.user.role === 'counselor' ? { counselorId: String(req.user.id) } : {}) };
  const students = await User.find(filter)
    .select('name email phone leadStage leadStageChangedAt createdAt applications documents preferredCountries budget educationLevel gpa englishScore sessions counselorId')
    .lean();

  const ids = students.map(s => String(s._id));
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const meetings = ids.length
    ? await Meeting.find({ 'participants.userId': { $in: ids }, scheduledDate: { $gte: since }, status: { $ne: 'cancelled' } }).select('participants').lean()
    : [];
  const idSet = new Set(ids);
  const meetingCount = new Map();
  for (const m of meetings) {
    for (const p of m.participants || []) {
      if (idSet.has(String(p.userId))) meetingCount.set(String(p.userId), (meetingCount.get(String(p.userId)) || 0) + 1);
    }
  }

  const scored = students
    .map(s => ({ s, result: scoreLead(s, { meetingsLast30d: meetingCount.get(String(s._id)) || 0 }) }))
    .filter(x => x.result.band !== 'closed');
  const bands = { hot: 0, warm: 0, cool: 0, cold: 0 };
  scored.forEach(x => { bands[x.result.band]++; });

  const leads = scored
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, 25)
    .map(({ s, result }) => ({
      studentId: String(s._id), name: s.name, email: s.email || '', leadStage: s.leadStage || 'new_enquiry',
      score: result.score, band: result.band, reasons: result.reasons,
    }));

  res.json({ leads, bands, total: scored.length });
});

module.exports = router;
