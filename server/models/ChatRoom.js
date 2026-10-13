const mongoose = require("mongoose");

const ChatRoomSchema = new mongoose.Schema(
  {
    participants: [String],
    participantNames: [String],
    type: { type: String, default: "student-counselor" },
    // Group chats (type 'group'): a named counselling group for one student
    name: String,
    studentId: String,
    createdBy: String,
    // Messages live in their own collection (models/ChatMessage.js). Rooms written before then still carry this array
    // until scripts/migrateChatMessages.js removes it; it is never read.
    messages: { type: [mongoose.Schema.Types.Mixed], select: false, default: undefined },
  },
  { timestamps: true },
);

// "My chats, most recent first" is the query behind every chat list and unread badge
ChatRoomSchema.index({ participants: 1, updatedAt: -1 });

ChatRoomSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("ChatRoom", ChatRoomSchema);
