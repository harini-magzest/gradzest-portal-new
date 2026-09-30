const mongoose = require("mongoose");

const blockedIpSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, unique: true },
    reason: { type: String, default: "" },
    // Optional auto-expiry; rows without it are permanent. Mongo's TTL monitor
    // deletes expired rows (about once a minute) and ipBlock ignores them
    // on its own refresh even before that.
    expiresAt: { type: Date, default: null },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

blockedIpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("BlockedIp", blockedIpSchema);
