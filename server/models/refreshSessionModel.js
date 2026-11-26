const mongoose = require("mongoose");

const refreshSessionSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    familyId: {
      type: String,
      required: true,
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      required: true,
      index: true,
    },
    revocationReason: {
      type: String,
      enum: [
        "ROTATED",
        "REUSE_DETECTED",
        "LOGOUT",
        "LOGOUT_ALL",
        "TRANSACTION_UNCERTAIN",
        "ORPHANED_TRANSACTION_QUARANTINED",
        null,
      ],
      default: null,
    },
    replacedByTokenHash: {
      type: String,
      default: null,
    },
    highestIssuedFencingToken: {
      type: Number,
      default: 0,
      index: true,
    },
    activeOperationId: {
      type: String,
      default: null,
    },
    rotationState: {
      type: String,
      enum: ["ACTIVE", "IN_FLIGHT", "UNCERTAIN", "COMMITTED"],
      default: "ACTIVE",
      required: true,
      index: true,
    },
    rotatedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
refreshSessionSchema.index({ familyId: 1, isRevoked: 1 });
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL for expired token cleanup

module.exports =
  mongoose.models.RefreshSession ||
  mongoose.model("RefreshSession", refreshSessionSchema);
