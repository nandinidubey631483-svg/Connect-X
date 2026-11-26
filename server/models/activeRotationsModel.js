const mongoose = require("mongoose");

/**
 * ActiveRotations Model
 * 
 * Invariant: ZERO TTL INDEX.
 * In accordance with Phase 4 v4.18+, this collection must never automatically expire records
 * via MongoDB background TTL threads. Removal occurs exclusively through in-transaction atomic deletion
 * upon successful rotation or operation-fenced sweeper quarantine.
 */
const activeRotationsSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true, // familyId
    },
    operationId: {
      type: String,
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    fencingToken: {
      type: Number,
      required: true,
      index: true,
    },
    workerId: {
      type: String,
      required: true,
    },
    intentStatus: {
      type: String,
      enum: ["INTENT_DECLARED", "AMBIGUOUS_STEP1"],
      default: "INTENT_DECLARED",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true, // Scanned by sweeper; explicitly NO TTL index
    },
  },
  {
    timestamps: false,
    _id: false, // _id is explicitly defined as String (familyId)
  }
);

module.exports =
  mongoose.models.ActiveRotations ||
  mongoose.model("ActiveRotations", activeRotationsSchema);
