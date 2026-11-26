const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      min: 3,
      max: 20,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      max: 50,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      min: 8,
      select: false,
    },
    isAvatarImageSet: {
      type: Boolean,
      default: false,
    },
    avatarImage: {
      type: String,
      default: "",
    },
    // Phase 5 Profile Extensions
    displayName: {
      type: String,
      max: 50,
      trim: true,
      default: "",
    },
    bio: {
      type: String,
      max: 250,
      trim: true,
      default: "",
    },
    phoneNumber: {
      type: String,
      max: 20,
      trim: true,
      default: "",
    },
    statusMessage: {
      type: String,
      max: 100,
      trim: true,
      default: "Hey there! I am using ConnectX.",
    },
    // Phase 5 Presence Extensions
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    // Phase 4 Security Extensions
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    failedAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);

module.exports = mongoose.models.Users || mongoose.model("Users", userSchema);
