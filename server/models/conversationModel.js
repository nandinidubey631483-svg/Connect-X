/**
 * ConnectX Conversation Model
 * 
 * Represents one-to-one (DIRECT) and group conversations.
 * Implements deterministic participantHash for idempotent one-to-one deduplication.
 */
const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
        required: true,
      },
    ],
    participantHash: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["DIRECT", "GROUP"],
      default: "DIRECT",
    },
    lastMessage: {
      text: { type: String, default: "" },
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
        default: null,
      },
      createdAt: { type: Date, default: Date.now },
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ participants: 1, updatedAt: -1 });

module.exports =
  mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
