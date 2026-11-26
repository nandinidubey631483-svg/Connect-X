const mongoose = require("mongoose");

const MessageSchema = mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      index: true,
    },
    messageType: {
      type: String,
      enum: ["TEXT", "IMAGE", "FILE"],
      default: "TEXT",
    },
    message: {
      text: { type: String, trim: true, default: "" },
    },
    media: {
      url: { type: String, default: null },
      filename: { type: String, default: null },
      originalName: { type: String, default: null },
      mimeType: { type: String, default: null },
      size: { type: Number, default: 0 },
      data: { type: String, default: null },
    },
    users: Array,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["SENT", "DELIVERED", "READ"],
      default: "SENT",
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ users: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, status: 1 });

module.exports = mongoose.models.Messages || mongoose.model("Messages", MessageSchema);
