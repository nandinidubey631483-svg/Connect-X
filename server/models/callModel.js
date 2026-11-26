/**
 * ConnectX Call Model (Module 11: Real-Time Voice & Video Calling)
 * 
 * Persists one-to-one call session metadata, call state progression,
 * duration tracking, and termination attribution without storing
 * raw audio/video media streams.
 */
const mongoose = require("mongoose");

const CALL_TYPES = ["VOICE", "VIDEO"];
const CALL_STATUSES = [
  "OUTGOING_CALL",
  "RINGING",
  "ACCEPTED",
  "CONNECTING",
  "CONNECTED",
  "ENDED",
  "REJECTED",
  "CANCELLED",
  "MISSED",
  "BUSY",
  "FAILED",
];

const TERMINATION_REASONS = [
  "NORMAL",
  "CALLER_CANCELLED",
  "RECEIVER_REJECTED",
  "RECEIVER_BUSY",
  "NO_ANSWER_TIMEOUT",
  "MEDIA_FAILURE",
  "NETWORK_DISCONNECTED",
  "PEER_CONNECTION_FAILED",
  "UNKNOWN",
];

const callSchema = new mongoose.Schema(
  {
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },
    callType: {
      type: String,
      enum: CALL_TYPES,
      required: true,
      default: "VOICE",
      index: true,
    },
    status: {
      type: String,
      enum: CALL_STATUSES,
      required: true,
      default: "RINGING",
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
    connectedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number, // In seconds
      default: 0,
      min: 0,
    },
    terminationReason: {
      type: String,
      enum: [...TERMINATION_REASONS, null],
      default: null,
    },
    metadata: {
      iceRestartCount: { type: Number, default: 0 },
      clientBrowser: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal call history pagination and active call checks
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ receiver: 1, createdAt: -1 });
callSchema.index({ caller: 1, receiver: 1, status: 1 });

module.exports = mongoose.model("Call", callSchema);
module.exports.CALL_TYPES = CALL_TYPES;
module.exports.CALL_STATUSES = CALL_STATUSES;
module.exports.TERMINATION_REASONS = TERMINATION_REASONS;
