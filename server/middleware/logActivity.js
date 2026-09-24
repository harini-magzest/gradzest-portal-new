const ActivityLog = require('../models/ActivityLog');

// Holds the Socket.io server instance — set once at startup via initActivityLogger()
let _io = null;

/**
 * Call once from server/index.js after the io instance is created.
 * This gives every logActivity() call access to the socket server
 * without needing to pass io around manually.
 */
function initActivityLogger(io) {
  _io = io;
}

/**
 * Log an activity event to MongoDB and broadcast it via Socket.io.
 *
 * @param {string} type        - One of: enquiry | visa | document | payment | offer | interview | alert
 * @param {string} action      - Short verb phrase, e.g. "made payment"
 * @param {string} detail      - Supporting detail line shown in the feed
 * @param {ObjectId|null} studentId   - MongoDB _id of the student (optional)
 * @param {object} options
 *   @param {string}     options.studentName   - Display name (default: 'System')
 *   @param {ObjectId}   options.counsellorId  - Assigned counsellor (optional)
 *   @param {string}     options.country       - Country string (optional)
 *   @param {string}     options.university    - University name (optional)
 *
 * Returns the saved ActivityLog document, or null if logging fails.
 * Logging failures are intentionally swallowed so they never crash other routes.
 */
async function logActivity(type, action, detail, studentId = null, options = {}) {
  try {
    const { studentName = 'System', counsellorId, country, university } = options;

    // Build two-letter initials from the student name
    const initials = studentName
      .trim()
      .split(/\s+/)
      .map(n => n[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'SY';

    const entry = await ActivityLog.create({
      studentId:   studentId || null,
      studentName,
      initials,
      type,
      action,
      detail:      detail || '',
      counsellorId: counsellorId || null,
      country:     country || '',
      university:  university || '',
    });

    // Broadcast to every connected dashboard client
    if (_io) {
      _io.emit('new_activity', entry.toObject());
    }

    return entry;
  } catch (err) {
    // Never let a logging failure break the calling route
    console.error('[logActivity] Failed:', err.message);
    return null;
  }
}

module.exports = { logActivity, initActivityLogger };
