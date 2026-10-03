const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    studentName: { type: String, required: true, default: "System" },
    initials: { type: String, required: true, default: "SY" },
    type: {
      type: String,
      enum: [
        "enquiry",
        "visa",
        "document",
        "payment",
        "offer",
        "interview",
        "alert",
      ],
      required: true,
    },
    action: { type: String, required: true },
    detail: { type: String, default: "" },
    counsellorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    country: { type: String, default: "" },
    university: { type: String, default: "" },
  },
  { timestamps: true },
);

// Efficient queries: latest-first by default, filterable by type
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ type: 1, createdAt: -1 });
activityLogSchema.index({ studentId: 1, createdAt: -1 });

activityLogSchema.plugin(require('../lib/encryptedFields'), { fields: ['studentName','detail'] });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
