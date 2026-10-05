const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const ParentLink = require('../models/ParentLink');
const authMiddleware = require('../middleware/auth');
const { sendServerError } = require('../lib/httpError');
const { checklistFor, timelineFor } = require('../lib/studentProgress');

// Two routers: the student manages links behind sign-in; the parent opens one without any account.
const manage = express.Router();
const view = express.Router();

const DAY = 86400000;
const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;
const MAX_ACTIVE = 5;

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';
const isActive = (l, now = Date.now()) => !l.revokedAt && new Date(l.expiresAt).getTime() > now;

const studentOnly = (req, res, next) => (req.user.role === 'student' ? next() : res.status(403).json({ message: 'Forbidden' }));

const present = (l) => ({
  id: String(l._id), label: l.label, createdAt: l.createdAt, expiresAt: l.expiresAt,
  lastViewedAt: l.lastViewedAt || null, viewCount: l.viewCount || 0, active: isActive(l),
});

manage.get('/', authMiddleware, studentOnly, async (req, res) => {
  try {
    const links = await ParentLink.find({ studentId: String(req.user.id) }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(links.map(present));
  } catch (err) {
    sendServerError(res, err);
  }
});

// Creates a link. The secret is returned here and never again.
manage.post('/', authMiddleware, studentOnly, async (req, res) => {
  try {
    const studentId = String(req.user.id);
    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 60) : '';
    const days = Math.min(Math.max(Math.round(Number(req.body?.days)) || DEFAULT_DAYS, 1), MAX_DAYS);

    const active = await ParentLink.countDocuments({ studentId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
    if (active >= MAX_ACTIVE) return res.status(409).json({ message: `You can have up to ${MAX_ACTIVE} active links. Remove one first.` });

    const token = crypto.randomBytes(32).toString('base64url');
    const link = await ParentLink.create({ studentId, tokenHash: hash(token), label, expiresAt: new Date(Date.now() + days * DAY) });
    res.status(201).json({ ...present(link.toObject()), url: `${frontendUrl()}/parent/${token}` });
  } catch (err) {
    sendServerError(res, err);
  }
});

manage.delete('/:id', authMiddleware, studentOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Link not found' });
  try {
    const link = await ParentLink.findOneAndUpdate(
      { _id: req.params.id, studentId: String(req.user.id), revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }, { new: true },
    ).lean();
    if (!link) return res.status(404).json({ message: 'Link not found' });
    res.json(present(link));
  } catch (err) {
    sendServerError(res, err);
  }
});

// Public. Tokens are 256 random bits so guessing is hopeless, but the endpoint is limited anyway (skipped in tests).
const viewLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many requests. Please slow down.' },
});

// What a parent may see: progress, never personal records. No email, phone, passport, address, documents or their
// files, notes, chats, or meeting links.
view.get('/:token', viewLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return res.status(404).json({ message: 'This link is not valid.' });
  try {
    const link = await ParentLink.findOne({ tokenHash: hash(token) });
    if (!link || !isActive(link)) return res.status(404).json({ message: 'This link is not valid. Ask the student for a new one.' });

    const student = await User.findOne({ _id: link.studentId, role: 'student' }).select('name counselorId').lean();
    if (!student) return res.status(404).json({ message: 'This link is not valid.' });

    const today = new Date().toISOString().slice(0, 10);
    const [timeline, checklist, meetings, counselor] = await Promise.all([
      timelineFor(link.studentId),
      checklistFor(link.studentId),
      Meeting.find({ 'participants.userId': link.studentId, scheduledDate: { $gte: today }, status: 'scheduled' }).sort({ scheduledDate: 1, scheduledTime: 1 }).limit(5).select('title scheduledDate scheduledTime duration').lean(),
      student.counselorId ? User.findOne({ _id: student.counselorId, role: 'counselor' }).select('name').lean() : null,
    ]);

    link.lastViewedAt = new Date();
    link.viewCount = (link.viewCount || 0) + 1;
    await link.save();

    res.json({
      studentName: String(student.name || '').trim().split(/\s+/)[0] || 'Your child',
      counselorName: counselor?.name || '',
      applications: (timeline?.applications || []).map((a) => ({
        universityName: a.universityName, courseName: a.courseName, intake: a.intake, status: a.status, rejected: a.rejected,
        steps: a.steps.map((s) => ({ label: s.label, state: s.state })), daysInStage: a.daysInStage, daysToIntake: a.daysToIntake, intakePassed: a.intakePassed, next: a.next,
      })),
      documents: checklist ? { ...checklist.summary, stillNeeded: checklist.items.filter((i) => ['missing', 'requested', 'rejected'].includes(i.status)).map((i) => i.label) } : null,
      upcomingMeetings: meetings.map((m) => ({ title: m.title, date: m.scheduledDate, time: m.scheduledTime, durationMin: m.duration })),
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = { manage, view };
