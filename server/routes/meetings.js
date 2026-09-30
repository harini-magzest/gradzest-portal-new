const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { recordStaffActivity } = require('../lib/staffActivity');
const { can } = require('../lib/access');

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
    res.status(500).json({ message: err.message });
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
    const meetingLink = platform === 'jitsi' && !req.body.meetingLink ? generateJitsiLink() : req.body.meetingLink;
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
      } catch {}

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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
