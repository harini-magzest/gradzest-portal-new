const mongoose = require("mongoose");

// Mirrors server/models/Task.js's CommentSchema exactly — same shape for
// analyst notes as the rest of the app already uses for task comments.
const NoteSchema = new mongoose.Schema(
  {
    author: { type: String, required: true },
    authorRole: { type: String, default: "" },
    text: { type: String, required: true },
  },
  { timestamps: true },
);

const securityIncidentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["brute_force", "suspicious_ip", "payment_anomaly", "account_lockout", "pii_bulk_access", "malware_upload", "waf_block", "skyload_bot_activity", "impossible_travel", "manual"],
      required: true,
    },
    severity: {
      type: String,
      enum: ["info", "low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "investigating", "resolved", "false_positive"],
      default: "open",
    },
    title: { type: String, required: true },
    relatedIp: { type: String, default: "" },
    relatedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    relatedEmail: { type: String, default: "" },
    sourceEventIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "SecurityEvent" }],
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: [NoteSchema],
    // Auto-set by the daily security-digest job when an open/investigating
    // incident has had no update (note, status change, new source event) in
    // 14+ days — a triage-fatigue signal, not an analyst-driven outcome, so
    // it's separate from `status` and never changes it.
    stale: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// No TTL — incidents are the permanent audit record of what the SOC caught
// and how it was handled.
securityIncidentSchema.index({ createdAt: -1 });
securityIncidentSchema.index({ status: 1, createdAt: -1 });
securityIncidentSchema.index({ severity: 1, createdAt: -1 });

module.exports = mongoose.model("SecurityIncident", securityIncidentSchema);
