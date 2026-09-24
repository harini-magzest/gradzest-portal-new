const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  senderId: String,
  senderName: String,
  senderRole: String,
  content: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
  type: { type: String, default: "text" }, // 'text' | 'call' | 'file' | 'meeting'
  callStatus: String, // 'answered' | 'no_answer' | 'declined'
  callDuration: { type: Number, default: 0 }, // seconds
  // file message fields
  fileUrl: String,
  fileName: String,
  fileSize: { type: Number, default: 0 },
  isOfferLetter: { type: Boolean, default: false },
  // meeting message fields
  meetingDate: String,
  meetingTime: String,
  meetingNotes: String,
});

MessageSchema.set("toJSON", { virtuals: true });

const ChatRoomSchema = new mongoose.Schema(
  {
    participants: [String],
    participantNames: [String],
    type: { type: String, default: "student-counselor" },
    messages: [MessageSchema],
  },
  { timestamps: true },
);

ChatRoomSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("ChatRoom", ChatRoomSchema);
