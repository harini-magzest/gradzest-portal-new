const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  senderId: String,
  senderName: String,
  senderRole: String,
  content: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }, // 1:1 chats only; groups track each reader in readBy
  readBy: { type: [String], default: undefined }, // user ids who have opened the chat since this arrived
  type: { type: String, default: "text" }, // 'text' | 'call' | 'file' | 'meeting'
  callStatus: String, // 'answered' | 'no_answer' | 'declined'
  callDuration: { type: Number, default: 0 }, // seconds
  recordingUrl: String, // in-app call recording (uploaded by the caller's browser)
  // Group chats: emoji reactions and quote-replies
  reactions: [{ _id: false, emoji: String, userId: String, userName: String }],
  replyTo: { _id: false, messageId: String, senderName: String, content: String },
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
    // Group chats (type 'group'): a named counselling group for one student
    name: String,
    studentId: String,
    createdBy: String,
    messages: [MessageSchema],
  },
  { timestamps: true },
);

ChatRoomSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("ChatRoom", ChatRoomSchema);
