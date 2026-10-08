const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const DeletionRequest = require('../models/DeletionRequest');
const authMiddleware = require('../middleware/auth');
const { sendServerError } = require('../lib/httpError');
const { exportStudentData, eraseStudent } = require('../lib/studentData');

const router = express.Router();

const studentOnly = (req, res, next) => (req.user.role === 'student' ? next() : res.status(403).json({ message: 'Forbidden' }));
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Forbidden' }));
const present = (r) => ({
  id: String(r._id), name: r.name, email: r.email, reason: r.reason, status: r.status,
  requestedAt: r.createdAt, handledAt: r.handledAt || null, handledByName: r.handledByName || '', adminNote: r.adminNote || '',
});

// Download everything held about the signed-in student.
router.get('/export', authMiddleware, studentOnly, async (req, res) => {
  try {
    const data = await exportStudentData(req.user.id);
    if (!data) return res.status(404).json({ message: 'Account not found' });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="my-gradzest-data-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    sendServerError(res, err);
  }
});

router.get('/deletion-request', authMiddleware, studentOnly, async (req, res) => {
  try {
    const [latest, me] = await Promise.all([
      DeletionRequest.findOne({ userId: String(req.user.id) }).sort({ createdAt: -1 }).lean(),
      User.findById(req.user.id).select('password').lean(),
    ]);
    // hasPassword tells the form whether to ask for the password or for the email typed out
    res.json({ request: latest ? present(latest) : null, hasPassword: !!me?.password });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Ask for erasure. Asking is deliberate: it needs the account password (or, for an account that has none, the account
// email typed out), so a hijacked session cannot start it.
router.post('/deletion-request', authMiddleware, studentOnly, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('name email password').lean();
    if (!me) return res.status(404).json({ message: 'Account not found' });

    const { password, confirmEmail } = req.body || {};
    const hasPassword = !!me.password; // students added by staff from a phone call may have none
    const confirmed = hasPassword
      ? typeof password === 'string' && password.length > 0 && await bcrypt.compare(password, me.password)
      : typeof confirmEmail === 'string' && !!me.email && confirmEmail.trim().toLowerCase() === me.email.toLowerCase();
    if (!confirmed) return res.status(401).json({ message: hasPassword ? 'Your password is not correct' : 'Type your account email exactly to confirm' });

    const open = await DeletionRequest.findOne({ userId: String(req.user.id), status: 'pending' }).lean();
    if (open) return res.status(200).json(present(open)); // already asked: idempotent

    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    const request = await DeletionRequest.create({ userId: String(req.user.id), name: me.name || '', email: me.email || '', reason });

    const admins = await User.find({ role: 'admin', active: { $ne: false } }).select('_id').lean();
    if (admins.length) {
      await Notification.insertMany(admins.map((a) => ({
        userId: a._id, type: 'privacy', priority: 'urgent',
        title: 'Data deletion request', message: `${me.name || 'A student'} asked for their personal data to be erased.`, link: '/admin/privacy',
      })));
    }
    res.status(201).json(present(request.toObject()));
  } catch (err) {
    sendServerError(res, err);
  }
});

router.delete('/deletion-request', authMiddleware, studentOnly, async (req, res) => {
  try {
    const r = await DeletionRequest.findOneAndUpdate({ userId: String(req.user.id), status: 'pending' }, { $set: { status: 'cancelled', handledAt: new Date() } }, { new: true }).lean();
    if (!r) return res.status(404).json({ message: 'No pending request' });
    res.json(present(r));
  } catch (err) {
    sendServerError(res, err);
  }
});

/* ── Admin ───────────────────────────────────────────────────────────────── */

router.get('/deletion-requests', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await DeletionRequest.find().sort({ status: 1, createdAt: -1 }).limit(200).lean();
    res.json(rows.map(present));
  } catch (err) {
    sendServerError(res, err);
  }
});

async function loadPending(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ message: 'Request not found' }); return null; }
  const r = await DeletionRequest.findById(req.params.id);
  if (!r) { res.status(404).json({ message: 'Request not found' }); return null; }
  if (r.status !== 'pending') { res.status(409).json({ message: `This request is already ${r.status}` }); return null; }
  return r;
}

const stamp = async (r, req, status, note) => {
  const me = await User.findById(req.user.id).select('name').lean();
  r.status = status;
  r.handledBy = String(req.user.id);
  r.handledByName = me?.name || '';
  r.handledAt = new Date();
  r.adminNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  await r.save();
};

// Carry out the erasure. Irreversible, so the admin must send `confirm: true`.
router.post('/deletion-requests/:id/complete', authMiddleware, adminOnly, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ message: 'Confirm that you want to permanently erase this data' });
  try {
    const r = await loadPending(req, res);
    if (!r) return;
    const result = await eraseStudent(r.userId);
    if (!result.erased) return res.status(409).json({ message: 'That account is not a student account, so nothing was erased' });
    await stamp(r, req, 'completed', req.body.note);
    res.json(present(r.toObject()));
  } catch (err) {
    sendServerError(res, err);
  }
});

router.post('/deletion-requests/:id/decline', authMiddleware, adminOnly, async (req, res) => {
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!note) return res.status(400).json({ message: 'Give a reason so the student knows why' });
  try {
    const r = await loadPending(req, res);
    if (!r) return;
    await stamp(r, req, 'declined', note);
    await Notification.create({ userId: r.userId, type: 'privacy', priority: 'normal', title: 'About your data deletion request', message: note, link: '/student/profile' });
    res.json(present(r.toObject()));
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
