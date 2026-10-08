const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const router = express.Router();

const UiActivity = require('../models/UiActivity');
const authMiddleware = require('../middleware/auth');
const attachUserEmail = require('../middleware/attachUserEmail');
const { buildDevice } = require('../lib/device');
const { sendServerError } = require('../lib/httpError');

// Roles whose UI activity is recorded. Staff by default; student tracking is
// opt-in (SOC_UI_TRACK_ROLES=admin,counselor,student) because recording every
// click of members of the public needs a privacy notice / consent first.
function trackedRoles() {
  return (process.env.SOC_UI_TRACK_ROLES || 'admin,counselor').split(',').map((r) => r.trim()).filter(Boolean);
}

const KINDS = ['page_view', 'click', 'file_select', 'download', 'form_submit'];
const MAX_BATCH = 50;

const cut = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

function sanitizeEntry(raw, base) {
  if (!raw || typeof raw !== 'object' || !KINDS.includes(raw.kind)) return null;
  const el = raw.element && typeof raw.element === 'object' ? raw.element : {};
  const clientTime = new Date(raw.clientTime);
  const skew = Math.abs(clientTime.getTime() - Date.now());
  return {
    ...base,
    kind: raw.kind,
    page: cut(raw.page, 300),
    routePattern: cut(raw.routePattern, 200),
    file: cut(raw.file, 200),
    context: cut(raw.context, 120),
    element: {
      tag: cut(el.tag, 20), type: cut(el.type, 30), label: cut(el.label, 120),
      id: cut(el.id, 80), testId: cut(el.testId, 80), href: cut(el.href, 300),
    },
    files: Array.isArray(raw.files)
      ? raw.files.slice(0, 20).map((f) => ({ name: cut(f?.name, 200), size: Number(f?.size) || 0, type: cut(f?.type, 80) }))
      : [],
    // Trust the client clock only when it's plausible; createdAt is the server's own.
    clientTime: Number.isFinite(skew) && skew < 24 * 3600 * 1000 ? clientTime : null,
  };
}

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? String(req.user.id) : ipKeyGenerator(req.ip)),
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many activity reports.' },
});

// POST /api/ui-trail — body: { sessionKey, events: [...] }
// Responds { tracking: false } for roles that aren't tracked so the client can stop sending.
router.post('/', authMiddleware, limiter, attachUserEmail, async (req, res) => {
  if (!trackedRoles().includes(req.user.role)) return res.json({ tracking: false, accepted: 0 });
  const { sessionKey, events } = req.body || {};
  if (!Array.isArray(events)) return res.status(400).json({ message: 'events must be an array' });
  try {
    const base = {
      userId: req.user.id, email: req.user.email || '', name: req.user.name || '', role: req.user.role,
      sessionKey: cut(sessionKey, 40), ip: req.ip, userAgent: cut(req.headers['user-agent'], 300),
      device: buildDevice(req.headers['user-agent'], req.body?.device),
    };
    const docs = events.slice(0, MAX_BATCH).map((e) => sanitizeEntry(e, base)).filter(Boolean);
    if (docs.length) {
      const saved = await UiActivity.insertMany(docs);
      req.app.get('io')?.to('admin-room').emit('ui_activity', saved.map((d) => d.toObject()));
    }
    res.json({ tracking: true, accepted: docs.length });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

module.exports = router;
module.exports.trackedRoles = trackedRoles;
