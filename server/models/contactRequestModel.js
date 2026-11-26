/**
 * ConnectX Contact Request Model
 * 
 * Tracks friend / contact requests between users.
 * States:
 * - PENDING: Waiting for recipient action
 * - ACCEPTED: Mutual connection established
 * - REJECTED: Declined by recipient
 * - CANCELLED: Retracted by sender
 */
const mongoose = require("mongoose");

const contactRequestSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

contactRequestSchema.index({ requester: 1, recipient: 1 });
contactRequestSchema.index({ recipient: 1, status: 1 });
contactRequestSchema.index({ requester: 1, status: 1 });

module.exports = mongoose.models.ContactRequest || mongoose.model("ContactRequest", contactRequestSchema);
