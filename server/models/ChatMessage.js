const mongoose = require("mongoose");

// One chat message. Messages used to live inside their room (ChatRoom.messages), so every read of a room carried its
// whole history; scripts/migrateChatMessages.js moves them here, keeping each message's _id. A message's JSON is the
// same as it was inside the room.
const ChatMessageSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
    senderId: String,
    senderName: String,
    senderRole: String,
    content: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }, // 1:1 chats only; groups track each reader in readBy
    readBy: { type: [String], default: undefined }, // user ids who have opened the chat since this arrived
    type: { type: String, default: "text" }, // 'text' | 'call' | 'file' | 'meeting' | 'system'
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
  },
  { versionKey: false },
);

// A room's newest messages, and the page before a given one
ChatMessageSchema.index({ roomId: 1, timestamp: -1, _id: -1 });
// Call history across every room (full admins)
ChatMessageSchema.index({ type: 1, timestamp: -1 });
// Who may open a chat file or call recording (lib/fileAccess.js)
ChatMessageSchema.index({ fileUrl: 1 }, { sparse: true });
ChatMessageSchema.index({ recordingUrl: 1 }, { sparse: true });

ChatMessageSchema.set("toJSON", {
  virtuals: true,
  // The room is known from the request; a message never carried it
  transform: (doc, ret) => { delete ret.roomId; return ret; },
});

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
