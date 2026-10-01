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
    kind: { type: String, enum: ['page_view', 'click', 'file_select', 'download', 'form_submit'], required: true },
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
    clientTime: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

uiActivitySchema.index({ userId: 1, createdAt: -1 });
uiActivitySchema.index({ createdAt: -1 });
uiActivitySchema.index({ kind: 1, createdAt: -1 });
// Retention: 90 days.
uiActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('UiActivity', uiActivitySchema);
