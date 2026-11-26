const mongoose = require("mongoose");

const sessionFamilySchema = new mongoose.Schema(
  {
    familyId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    familyStatus: {
      type: String,
      enum: ["ACTIVE", "ROTATING", "QUARANTINED", "REVOKED"],
      default: "ACTIVE",
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
        "ACTIVE",
        "ROTATED",
        "REUSE_DETECTED",
        "LOGOUT",
        "LOGOUT_ALL",
        "TRANSACTION_UNCERTAIN",
        "ORPHAN_STEP1_ROTATING_RECONCILED",
        "ORPHAN_STEP1_UNCOMMITTED_RECONCILED",
        "ORPHAN_STEP1_COMMITTED_ACTIVE_RECONCILED",
        "CORRUPT_STATE_FAIL_CLOSED",
        "ORPHANED_TRANSACTION_QUARANTINED",
        null,
      ],
      default: null,
    },
    activeOperationId: {
      type: String,
      default: null,
    },
    lastFencingToken: {
      type: Number,
      default: 0,
      index: true,
    },
    lastFencingOperationId: {
      type: String,
      default: null,
    },
    lastRotatedAt: {
      type: Date,
      default: Date.now,
    },
    userAgent: {
      type: String,
      default: "",
    },
    ipAddress: {
      type: String,
      default: "",
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for authorization queries & sweeper scans
sessionFamilySchema.index({ userId: 1, isRevoked: 1 });
sessionFamilySchema.index({ familyId: 1, isRevoked: 1 });
sessionFamilySchema.index({ familyStatus: 1, lastRotatedAt: 1 });

module.exports =
  mongoose.models.SessionFamily ||
  mongoose.model("SessionFamily", sessionFamilySchema);
