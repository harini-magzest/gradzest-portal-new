const crypto = require('crypto');
const { sendServerError } = require('../lib/httpError');
const express = require('express');
const { logError } = require('../lib/logError');
const router = express.Router();
const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { recordStaffActivity } = require('../lib/staffActivity');
const { can } = require('../lib/access');
const mongoose = require('mongoose');
const User = require('../models/User');
const { computeSlots } = require('../lib/meetingSlots');
const { buildIcs } = require('../lib/ics');
const { normalizeHttpUrl } = require('../lib/safeUrl');

// Free group room on the public Jitsi server — anyone with the link can join, so the
// room name must be unguessable.
function generateJitsiLink() {
  return `https://meet.jit.si/Gradzest-${crypto.randomBytes(12).toString('hex')}`;
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Admin: list all meetings
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const meetings = await Meeting.find().sort({ scheduledDate: 1, scheduledTime: 1 });
      return res.json(meetings);
    }
    // Students and counselors see only their meetings
    const meetings = await Meeting.find({
      'participants.userId': req.user.id,
    }).sort({ scheduledDate: 1, scheduledTime: 1 });
    res.json(meetings);
  } catch (err) {
    sendServerError(res, err);
  }
});

const ACTIVE_STATUSES = ['scheduled', 'ongoing'];

// Whose calendar the caller may look at: a student's own counselor, a counselor themself, or (admin) any counselor.
async function counselorIdFor(req) {
  if (req.user.role === 'student') {
    const me = await User.findById(req.user.id).select('counselorId').lean();
    return me?.counselorId ? String(me.counselorId) : null;
  }
  if (req.user.role === 'counselor') return String(req.user.id);
  return mongoose.isValidObjectId(req.query.counselorId) ? String(req.query.counselorId) : null;
}

const busyOn = (counselorId, date) =>
  Meeting.find({ 'participants.userId': counselorId, scheduledDate: date, status: { $in: ACTIVE_STATUSES } }).select('scheduledTime duration').lean();

// Free hourly slots on a day. Only availability is returned, never what the counselor is busy with.
router.get('/availability', auth, async (req, res) => {
  try {
    const counselorId = await counselorIdFor(req);
    if (!counselorId) return res.status(400).json({ message: req.user.role === 'student' ? 'No counselor is assigned to you yet' : 'counselorId is required' });
    const date = String(req.query.date || '');
    const result = computeSlots(date, /^\d{4}-\d{2}-\d{2}$/.test(date) ? await busyOn(counselorId, date) : []);
    res.json({ date, counselorId, ...result });
  } catch (err) {
    sendServerError(res, err);
  }
});

// A student books a call with their own counselor in one of the free slots.
router.post('/book', auth, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Forbidden' });
  try {
    const { date, time } = req.body || {};
    const student = await User.findById(req.user.id).select('name email counselorId').lean();
    const counselor = student?.counselorId ? await User.findOne({ _id: student.counselorId, role: 'counselor' }).select('name email').lean() : null;
    if (!counselor) return res.status(400).json({ message: 'No counselor is assigned to you yet' });

    const slots = computeSlots(String(date || ''), /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? await busyOn(String(counselor._id), date) : []);
    const slot = slots.slots.find((x) => x.time === time);
    if (!slot || !slot.available) return res.status(409).json({ message: 'That time is no longer available. Please pick another.' });

    const meeting = await Meeting.create({
      title: `Call with ${student.name}`, scheduledDate: date, scheduledTime: time, duration: 60,
      platform: 'jitsi', meetingLink: generateJitsiLink(),
      participants: [
        { userId: String(counselor._id), name: counselor.name, role: 'counselor', email: counselor.email },
        { userId: String(student._id), name: student.name, role: 'student', email: student.email },
      ],
      notes: typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 500) : '',
      createdBy: String(student._id), createdByName: student.name,
    });

    await Notification.create({
      userId: counselor._id, type: 'meeting', priority: 'normal',
      title: `New call booked: ${student.name}`, message: `${date} at ${time}`, link: meeting.meetingLink,
    });
    const io = req.app.get('io');
    const sids = req.app.get('userSockets')?.get(String(counselor._id));
    if (io && sids) sids.forEach((sid) => io.to(sid).emit('meeting:scheduled', {
      _id: meeting._id, title: meeting.title, scheduledDate: date, scheduledTime: time, platform: 'jitsi',
      meetingLink: meeting.meetingLink, duration: 60, createdByName: student.name,
    }));

    res.status(201).json(meeting);
  } catch (err) {
    sendServerError(res, err);
  }
});

function sendIcs(res, filename, meetings) {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buildIcs(meetings));
}

// Every upcoming meeting of the caller, to import into a calendar in one go.
router.get('/ics', auth, async (req, res) => {
  try {
    const since = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const meetings = await Meeting.find({
      ...(req.user.role === 'admin' ? {} : { 'participants.userId': req.user.id }),
      scheduledDate: { $gte: since }, status: { $ne: 'cancelled' },
    }).sort({ scheduledDate: 1, scheduledTime: 1 }).limit(500).lean();
    sendIcs(res, 'gradzest-meetings.ics', meetings);
  } catch (err) {
    sendServerError(res, err);
  }
});

router.get('/:id/ics', auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Meeting not found' });
    const meeting = await Meeting.findById(req.params.id).lean();
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    const isParticipant = (meeting.participants || []).some((p) => String(p.userId) === String(req.user.id));
    if (req.user.role !== 'admin' && !isParticipant) return res.status(403).json({ message: 'Forbidden' });
    sendIcs(res, 'gradzest-meeting.ics', [meeting]);
  } catch (err) {
    sendServerError(res, err);
  }
});

// Admin or Counselor: create meeting
router.post('/', auth, can('meetings.create'), async (req, res) => {
  if (!['admin', 'counselor'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  try {
    const { title, scheduledDate, scheduledTime, duration, platform, participants, notes } = req.body;
    if (!title || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ message: 'Title, date, and time are required' });
    }
    // A meeting link is shown to students and opened from the page and from emails, so only http(s) is accepted
    let suppliedLink = req.body.meetingLink;
    if (suppliedLink != null && suppliedLink !== '') {
      suppliedLink = normalizeHttpUrl(suppliedLink);
      if (!suppliedLink) return res.status(400).json({ message: 'meetingLink must be a valid http(s) URL' });
    }
    const meetingLink = platform === 'jitsi' && !suppliedLink ? generateJitsiLink() : suppliedLink;
    let allParticipants = participants || [];
    let creatorName = req.user.name || '';
    // Auto-add counselor as participant and fetch their name
    if (req.user.role === 'counselor') {
      const alreadyIn = allParticipants.some(p => p.userId?.toString() === req.user.id?.toString());
      const User = require('../models/User');
      const self = await User.findById(req.user.id).select('name');
      creatorName = self?.name || req.user.name || '';
      if (!alreadyIn) {
        allParticipants = [{ userId: req.user.id, name: creatorName, role: 'counselor' }, ...allParticipants];
      }
    }
    const meeting = await Meeting.create({
      title, scheduledDate, scheduledTime,
      duration: duration || 60,
      platform: platform || 'other',
      meetingLink: meetingLink || '',
      participants: allParticipants,
      notes: notes || '',
      createdBy: req.user.id,
      createdByName: creatorName,
    });

    const firstStudent = allParticipants.find(p => p.role === 'student');
    recordStaffActivity(req, {
      kind: 'meeting', title: `Meeting scheduled: ${title}`,
      detail: `${scheduledDate} at ${scheduledTime} · ${allParticipants.length} participant${allParticipants.length === 1 ? '' : 's'}`,
      studentId: firstStudent?.userId, studentName: firstStudent?.name,
    });

    const isCallType = title.includes('📞');
    const callType = title.toLowerCase().includes('audio') ? 'audio' : 'video';

    // Notify each student participant via socket in real-time
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    if (io && userSockets) {
      allParticipants
        .filter(p => p.role === 'student')
        .forEach(p => {
          const sids = userSockets.get(String(p.userId));
          if (sids) {
            sids.forEach(sid => {
              // Always send meeting:scheduled
              io.to(sid).emit('meeting:scheduled', {
                _id: meeting._id,
                title,
                scheduledDate,
                scheduledTime,
                platform: platform || 'other',
                meetingLink: meetingLink || '',
                duration: meeting.duration,
                createdByName: creatorName,
              });
              // For call-type meetings also send call:scheduled with richer data
              if (isCallType) {
                io.to(sid).emit('call:scheduled', {
                  _id: meeting._id,
                  scheduledDate,
                  scheduledTime,
                  callType,
                  schedulerName: creatorName,
                  scheduledForName: p.name,
                });
              }
            });
          }
        });
    }

    // Email fallback to student participants
    const mailer = req.app.get('mailer');
    if (mailer) {
      const studentParticipants = allParticipants.filter(p => p.role === 'student');
      for (const p of studentParticipants) {
        const studentUser = await require('../models/User').findById(p.userId).select('email name');
        if (studentUser?.email) {
          mailer.sendMail({
            from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: studentUser.email,
            subject: `New Meeting Scheduled: ${title}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
                <div style="background:#3b0764;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
                  <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
                </div>
                <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                  <p style="font-size:16px;">Hi ${studentUser.name},</p>
                  <p style="font-size:15px;">A meeting has been scheduled for you:</p>
                  <div style="margin:20px 0;padding:16px 20px;background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:4px;">
                    <p style="margin:0 0 6px;font-size:16px;font-weight:bold;">${title}</p>
                    <p style="margin:0;font-size:14px;color:#4b5563;">📅 ${scheduledDate} at ${scheduledTime} · via ${platform || 'other'}</p>
                  </div>
                  ${meetingLink ? `<p style="text-align:center;margin:24px 0;"><a href="${escapeHtml(meetingLink)}" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">Join Meeting</a></p>` : ''}
                  <p style="font-size:14px;color:#6b7280;">Log in to your Gradzest portal to view details.</p>
                </div>
              </div>`,
          }).catch(() => {});
        }
      }
    }

    // Staff invitees (admins, application team, counselors): saved notification + live push
    // + email, each carrying the join link. The creator is skipped.
    const staffInvitees = allParticipants.filter(p =>
      p.role !== 'student' && p.userId && String(p.userId) !== String(req.user.id));
    if (staffInvitees.length) {
      const studentNames = allParticipants.filter(p => p.role === 'student').map(p => p.name).filter(Boolean);
      const nTitle = `📅 Meeting Invite: ${title}`;
      const nMessage = `${creatorName || 'Admin'} invited you to a group meeting${studentNames.length ? ` with ${studentNames.join(', ')}` : ''} on ${scheduledDate} at ${scheduledTime}.`;
      try {
        const saved = await Notification.insertMany(staffInvitees.map(p => ({
          userId: p.userId, type: 'meeting', priority: 'urgent', title: nTitle, message: nMessage, link: meetingLink || '',
        })));
        if (io && userSockets) {
          saved.forEach(n => {
            const sids = userSockets.get(String(n.userId));
            if (sids) sids.forEach(sid => io.to(sid).emit('meeting:invited', {
              notificationId: String(n._id), title: nTitle, message: nMessage, link: n.link, meetingId: String(meeting._id),
            }));
          });
        }
      } catch (err) {
        logError('meetings', err);
      }

      if (mailer) {
        const staffUsers = await require('../models/User')
          .find({ _id: { $in: staffInvitees.map(p => p.userId) } }).select('email name');
        staffUsers.forEach(u => {
          if (!u.email) return;
          mailer.sendMail({
            from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: u.email,
            subject: `Meeting Invite: ${title}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
                <div style="background:#3b0764;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
                  <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
                </div>
                <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                  <p style="font-size:16px;">Hi ${escapeHtml(u.name)},</p>
                  <p style="font-size:15px;">${escapeHtml(nMessage)}</p>
                  <div style="margin:20px 0;padding:16px 20px;background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:4px;">
                    <p style="margin:0 0 6px;font-size:16px;font-weight:bold;">${escapeHtml(title)}</p>
                    <p style="margin:0;font-size:14px;color:#4b5563;">📅 ${escapeHtml(scheduledDate)} at ${escapeHtml(scheduledTime)} · ${meeting.duration} min</p>
                  </div>
                  ${meetingLink ? `<p style="text-align:center;margin:24px 0;"><a href="${escapeHtml(meetingLink)}" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">Join Meeting</a></p>` : ''}
                </div>
              </div>`,
          }).catch(() => {});
        });
      }
    }

    res.status(201).json(meeting);
  } catch (err) {
    sendServerError(res, err);
  }
});

// Admin or meeting creator: update meeting
// Only these fields may be changed through the API. Passing req.body straight
// through would let the caller rewrite createdBy, remindersSent, etc.
const MEETING_EDITABLE = ['title', 'scheduledDate', 'scheduledTime', 'duration', 'platform', 'meetingLink', 'participants', 'status', 'notes'];

router.put('/:id', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (req.user.role !== 'admin' && meeting.createdBy?.toString() !== req.user.id?.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const changes = Object.fromEntries(MEETING_EDITABLE.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]));
    if (changes.meetingLink != null && changes.meetingLink !== '') {
      changes.meetingLink = normalizeHttpUrl(changes.meetingLink);
      if (!changes.meetingLink) return res.status(400).json({ message: 'meetingLink must be a valid http(s) URL' });
    }
    const updated = await Meeting.findByIdAndUpdate(req.params.id, changes, { new: true, runValidators: true });

    // Notify all participants (except the person making the update)
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    if (io && userSockets && updated) {
      updated.participants
        .filter(p => p.userId?.toString() !== req.user.id?.toString())
        .forEach(p => {
          const sids = userSockets.get(String(p.userId));
          if (sids) {
            sids.forEach(sid => io.to(sid).emit('meeting:updated', {
              _id:           updated._id,
              title:         updated.title,
              scheduledDate: updated.scheduledDate,
              scheduledTime: updated.scheduledTime,
              platform:      updated.platform,
              meetingLink:   updated.meetingLink,
              duration:      updated.duration,
            }));
          }
        });
    }

    res.json(updated);
  } catch (err) {
    sendServerError(res, err);
  }
});

// Admin or meeting creator: delete meeting
router.delete('/:id', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (req.user.role !== 'admin' && meeting.createdBy?.toString() !== req.user.id?.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await Meeting.findByIdAndDelete(req.params.id);

    // Notify all participants except the one who deleted it
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    if (io && userSockets) {
      meeting.participants
        .filter(p => p.userId?.toString() !== req.user.id?.toString())
        .forEach(p => {
          const sids = userSockets.get(String(p.userId));
          if (sids) sids.forEach(sid => io.to(sid).emit('meeting:cancelled', {
            _id: meeting._id,
            title: meeting.title,
            scheduledDate: meeting.scheduledDate,
            scheduledTime: meeting.scheduledTime,
          }));
        });
    }

    res.json({ message: 'Deleted' });
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
