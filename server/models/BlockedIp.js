const mongoose = require("mongoose");

const blockedIpSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, unique: true },
    reason: { type: String, default: "" },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("BlockedIp", blockedIpSchema);
