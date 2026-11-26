/**
 * ConnectX Notification Model (Phase 5 Module 9)
 * 
 * Persists user notifications with deduplication, read tracking, and user-scoped authorization.
 * 
 * Notification Types:
 * - MESSAGE_RECEIVED: New incoming direct message
 * - CONTACT_REQUEST_RECEIVED: Incoming contact/friend request
 * - CONTACT_REQUEST_ACCEPTED: Contact request was accepted
 */
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      default: null,
    },
    type: {
      type: String,
      enum: [
        "MESSAGE_RECEIVED",
        "CONTACT_REQUEST_RECEIVED",
        "CONTACT_REQUEST_ACCEPTED",
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Messages",
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    dedupKey: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index for strict duplicate notification prevention per recipient
notificationSchema.index({ recipient: 1, dedupKey: 1 }, { unique: true });

// Compound index for fast paginated queries and unread counting
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
