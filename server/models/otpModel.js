const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ["SIGNUP", "LOGIN", "SENSITIVE_ACTION"],
      default: "SIGNUP",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: "15m" }, // Automatic MongoDB TTL cleanup
    },
    consumed: {
      type: Boolean,
      default: false,
      index: true,
    },
    resendAvailableAt: {
      type: Date,
      default: Date.now,
    },
    verificationToken: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

otpSchema.index({ email: 1, purpose: 1, consumed: 1, createdAt: -1 });

module.exports = mongoose.model("Otp", otpSchema);
