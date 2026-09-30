const mongoose = require("mongoose");

const requestLogSchema = new mongoose.Schema(
  {
    method: { type: String, required: true },
    path: { type: String, required: true },
    status: { type: Number, required: true },
    latencyMs: { type: Number, default: 0 },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    role: { type: String, default: "" },
  },
  { timestamps: true },
);

// Efficient queries: latest-first by default, filterable by status/ip
requestLogSchema.index({ createdAt: -1 });
requestLogSchema.index({ status: 1, createdAt: -1 });
requestLogSchema.index({ ip: 1, createdAt: -1 });
// High-volume operational log: auto-expire after 14 days
requestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });

module.exports = mongoose.model("RequestLog", requestLogSchema);
