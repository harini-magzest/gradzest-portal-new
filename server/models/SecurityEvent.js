const mongoose = require("mongoose");

const securityEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "login_success",
        "login_failure",
        "login_lockout",
        "logout",
        "token_invalid",
        "token_expired",
        "password_reset",
        "malware_upload",
        "waf_block",
        "skyload_bot_flag",
        "skyload_throttle",
        "password_reset_request",
        "privilege_change",
        "data_export",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["info", "low", "medium", "high", "critical"],
      default: "info",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    email: { type: String, default: "" },
    role: { type: String, default: "" },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    message: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Efficient queries: latest-first by default, filterable by type/ip/user
securityEventSchema.index({ createdAt: -1 });
securityEventSchema.index({ type: 1, createdAt: -1 });
securityEventSchema.index({ ip: 1, createdAt: -1 });
securityEventSchema.index({ userId: 1, createdAt: -1 });
// Audit-grade retention: auto-expire after ~6 months
securityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

securityEventSchema.plugin(require('../lib/encryptedFields'), { fields: ['email','ip','userAgent','message'] });

module.exports = mongoose.model("SecurityEvent", securityEventSchema);
