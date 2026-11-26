/**
 * ConnectX Contact Model
 * 
 * Represents an accepted bidirectional relationship between two users.
 * Kept in pairs (user -> contact) for O(1) indexed lookups without requiring $or queries.
 */
const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

contactSchema.index({ user: 1, contact: 1 }, { unique: true });
contactSchema.index({ contact: 1 });

module.exports = mongoose.models.Contact || mongoose.model("Contact", contactSchema);
