const mongoose = require('mongoose');

// One row per user interaction reported by the dashboard's activity tracker:
// which page (and source file) it happened on, and what was clicked, submitted,
// selected or downloaded. Only metadata is stored — never what a user typed
// into a field, and never file contents (file *names* and sizes only).
const uiActivitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, default: '' },
    name: { type: String, default: '' },
    role: { type: String, default: '' },
    // Random id per browser tab load, so one visit's actions can be grouped.
    sessionKey: { type: String, default: '' },
    // 'login' / 'logout' rows are written by the server at sign-in/out; the rest are reported by the browser tracker.
    kind: { type: String, enum: ['page_view', 'click', 'file_select', 'download', 'form_submit', 'login', 'logout'], required: true },
    page: { type: String, default: '' },        // URL path, e.g. /admin/students/123
    routePattern: { type: String, default: '' }, // e.g. /admin/students/*
    file: { type: String, default: '' },         // source file of the page, e.g. src/pages/admin/AdminStudents.tsx
    context: { type: String, default: '' },      // enclosing dialog/section, if any
    element: {
      tag: { type: String, default: '' },
      type: { type: String, default: '' },
      label: { type: String, default: '' },      // button/link text or aria-label
      id: { type: String, default: '' },
      testId: { type: String, default: '' },
      href: { type: String, default: '' },
    },
    // `type` must be declared as { type: String } — a bare `type: String` inside a nested
    // object is read by Mongoose as the schema type of the whole object.
    files: [{ _id: false, name: String, size: Number, type: { type: String } }],
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    // The device behind the action (see server/lib/device.js for what is and isn't knowable from a browser).
    device: {
      label: { type: String, default: '' },        // e.g. "SM-S918B · Android 14 · Chrome 120 · Mobile · 412×915"
      browser: { type: String, default: '' },
      os: { type: String, default: '' },
      deviceType: { type: String, default: '' },
      model: { type: String, default: '' },
      architecture: { type: String, default: '' },
      screen: { type: String, default: '' },
      language: { type: String, default: '' },
      timezone: { type: String, default: '' },
      cores: { type: Number, default: null },
      memoryGb: { type: Number, default: null },
      clientReported: { type: Boolean, default: false },
    },
    clientTime: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

uiActivitySchema.index({ userId: 1, createdAt: -1 });
uiActivitySchema.index({ createdAt: -1 });
uiActivitySchema.index({ kind: 1, createdAt: -1 });
// Retention: 90 days.
uiActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

uiActivitySchema.plugin(require('../lib/encryptedFields'), { fields: ['email','name','ip','userAgent','element.label','element.href','context','device.label','device.model'] });

module.exports = mongoose.model('UiActivity', uiActivitySchema);
