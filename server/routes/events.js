const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const User = require('../models/User');
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/auth');
const { sendServerError } = require('../lib/httpError');
const { buildIcs } = require('../lib/ics');
const { sendCsv } = require('../lib/csv');

const router = express.Router();

const isStaff = (req) => req.user.role === 'admin' || req.user.role === 'counselor';
const validId = (req, res, next) => (mongoose.isValidObjectId(req.params.id) ? next() : res.status(404).json({ message: 'Event not found' }));

// Staff may manage events they created; admins may manage any.
const canManage = (req, event) => req.user.role === 'admin' || String(event.createdBy) === String(req.user.id);

// What a viewer is shown. Other people's registrations are never included, only how many there are.
function present(event, req) {
  const mine = (event.registrations || []).some((r) => String(r.userId) === String(req.user.id));
  const count = (event.registrations || []).length;
  return {
    id: String(event._id),
    title: event.title, description: event.description, startsAt: event.startsAt, durationMin: event.durationMin,
    link: mine || isStaff(req) ? event.link : '', // the join link is for people who registered
    capacity: event.capacity, status: event.status,
    recordingUrl: mine || isStaff(req) ? event.recordingUrl : '',
    registeredCount: count,
    spotsLeft: event.capacity ? Math.max(0, event.capacity - count) : null,
    registered: mine,
    createdByName: event.createdByName,
    canManage: isStaff(req) && canManage(req, event),
  };
}

// Upcoming events plus the last 30 days, so a recording can still be found.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const events = await Event.find({ startsAt: { $gte: since }, ...(isStaff(req) ? {} : { status: 'scheduled' }) }).sort({ startsAt: 1 }).limit(200).lean();
    res.json(events.map((e) => present(e, req)));
  } catch (err) {
    sendServerError(res, err);
  }
});

function readFields(body, { partial }) {
  const out = {};
  const errors = [];
  if (!partial || body.title !== undefined) {
    const t = String(body.title || '').trim();
    if (!t) errors.push('title is required'); else out.title = t.slice(0, 140);
  }
  if (!partial || body.startsAt !== undefined) {
    const d = new Date(body.startsAt);
    if (isNaN(d.getTime())) errors.push('startsAt must be a valid date and time'); else out.startsAt = d;
  }
  if (body.description !== undefined) out.description = String(body.description).slice(0, 2000);
  if (body.durationMin !== undefined) {
    const n = Number(body.durationMin);
    if (!Number.isFinite(n) || n < 5 || n > 600) errors.push('durationMin must be between 5 and 600'); else out.durationMin = Math.round(n);
  }
  if (body.capacity !== undefined) {
    const n = Number(body.capacity);
    if (!Number.isInteger(n) || n < 0) errors.push('capacity must be 0 (unlimited) or a positive whole number'); else out.capacity = n;
  }
  for (const key of ['link', 'recordingUrl']) {
    if (body[key] === undefined) continue;
    const v = String(body[key]).trim();
    if (v && !/^https?:\/\//i.test(v)) errors.push(`${key} must start with http:// or https://`); else out[key] = v;
  }
  return { out, errors };
}

router.post('/', authMiddleware, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ message: 'Forbidden' });
  const { out, errors } = readFields(req.body || {}, { partial: false });
  if (errors.length) return res.status(400).json({ message: errors.join('; ') });
  try {
    const me = await User.findById(req.user.id).select('name').lean();
    const event = await Event.create({ ...out, createdBy: String(req.user.id), createdByName: me?.name || '' });
    res.status(201).json(present(event.toObject(), req));
  } catch (err) {
    sendServerError(res, err);
  }
});

router.put('/:id', authMiddleware, validId, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ message: 'Forbidden' });
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!canManage(req, event)) return res.status(403).json({ message: 'Forbidden' });
    const { out, errors } = readFields(req.body || {}, { partial: true });
    if (req.body.status !== undefined) {
      if (!['scheduled', 'cancelled'].includes(req.body.status)) errors.push("status must be 'scheduled' or 'cancelled'"); else out.status = req.body.status;
    }
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });
    // Moving the start means reminders must fire again for the new time
    if (out.startsAt && out.startsAt.getTime() !== event.startsAt.getTime()) out.remindersSent = [];
    Object.assign(event, out);
    await event.save();

    if (out.status === 'cancelled' || out.startsAt) {
      const verb = out.status === 'cancelled' ? 'was cancelled' : 'has a new time';
      await Notification.insertMany(event.registrations.map((r) => ({
        userId: r.userId, type: 'event', priority: 'normal', title: `Event ${verb}: ${event.title}`,
        message: out.status === 'cancelled' ? 'This event will no longer take place.' : `It now starts ${event.startsAt.toISOString()}.`, link: '/student/events',
      })));
    }
    res.json(present(event.toObject(), req));
  } catch (err) {
    sendServerError(res, err);
  }
});

router.delete('/:id', authMiddleware, validId, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ message: 'Forbidden' });
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!canManage(req, event)) return res.status(403).json({ message: 'Forbidden' });
    await event.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    sendServerError(res, err);
  }
});

// A student registers. Capacity and duplicates are enforced inside one atomic update, so two people taking the last
// spot at the same moment cannot both get it.
router.post('/:id/register', authMiddleware, validId, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can register for events' });
  try {
    const me = await User.findById(req.user.id).select('name email').lean();
    const userId = String(req.user.id);
    const updated = await Event.findOneAndUpdate(
      {
        _id: req.params.id, status: 'scheduled', startsAt: { $gt: new Date() },
        'registrations.userId': { $ne: userId },
        $or: [{ capacity: 0 }, { $expr: { $lt: [{ $size: '$registrations' }, '$capacity'] } }],
      },
      { $push: { registrations: { userId, name: me?.name || '', email: me?.email || '', registeredAt: new Date() } } },
      { new: true },
    ).lean();
    if (updated) {
      await Notification.create({ userId, type: 'event', priority: 'info', title: `You're registered: ${updated.title}`, message: `Starts ${updated.startsAt.toISOString()}.`, link: '/student/events' });
      return res.status(201).json(present(updated, req));
    }

    // Say why it failed
    const event = await Event.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.status !== 'scheduled') return res.status(409).json({ message: 'This event was cancelled' });
    if (event.startsAt <= new Date()) return res.status(409).json({ message: 'This event has already started' });
    if (event.registrations.some((r) => String(r.userId) === userId)) return res.status(200).json(present(event, req)); // already in: idempotent
    return res.status(409).json({ message: 'This event is full' });
  } catch (err) {
    sendServerError(res, err);
  }
});

router.delete('/:id/register', authMiddleware, validId, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, { $pull: { registrations: { userId: String(req.user.id) } } }, { new: true }).lean();
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(present(event, req));
  } catch (err) {
    sendServerError(res, err);
  }
});

// Who registered, for the organiser (and admins)
router.get('/:id/registrations', authMiddleware, validId, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ message: 'Forbidden' });
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!canManage(req, event)) return res.status(403).json({ message: 'Forbidden' });
    const rows = (event.registrations || []).map((r) => ({ name: r.name || '', email: r.email || '', registeredAt: r.registeredAt }));
    if (req.query.format === 'csv') {
      return sendCsv(res, 'event-registrations.csv', [
        { label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Registered at', key: 'registeredAt' },
      ], rows);
    }
    res.json(rows);
  } catch (err) {
    sendServerError(res, err);
  }
});

router.get('/:id/ics', authMiddleware, validId, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const view = present(event, req);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="gradzest-event.ics"');
    res.send(buildIcs([{
      _id: event._id, title: event.title, start: event.startsAt, duration: event.durationMin,
      meetingLink: view.link, notes: event.description, status: event.status,
    }]));
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
