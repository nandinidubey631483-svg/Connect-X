/**
 * ConnectX User Settings Model
 * 
 * Persists user-specific settings across 3 core categories:
 * 1. Notifications: emailNotifications, pushNotifications, soundEnabled, desktopAlerts
 * 2. Privacy: lastSeenVisibility ("everyone" | "contacts" | "nobody"), readReceiptsEnabled, typingIndicatorVisibility
 * 3. Chat: enterToSend, fontSize ("small" | "medium" | "large"), mediaAutoDownload, soundTheme ("default" | "subtle" | "none")
 */
const mongoose = require("mongoose");

const userSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      unique: true,
      index: true,
    },
    notifications: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      pushNotifications: {
        type: Boolean,
        default: true,
      },
      soundEnabled: {
        type: Boolean,
        default: true,
      },
      desktopAlerts: {
        type: Boolean,
        default: true,
      },
    },
    privacy: {
      lastSeenVisibility: {
        type: String,
        enum: ["everyone", "contacts", "nobody"],
        default: "everyone",
      },
      readReceiptsEnabled: {
        type: Boolean,
        default: true,
      },
      typingIndicatorVisibility: {
        type: Boolean,
        default: true,
      },
    },
    chat: {
      enterToSend: {
        type: Boolean,
        default: true,
      },
      fontSize: {
        type: String,
        enum: ["small", "medium", "large"],
        default: "medium",
      },
      mediaAutoDownload: {
        type: Boolean,
        default: true,
      },
      soundTheme: {
        type: String,
        enum: ["default", "subtle", "none"],
        default: "default",
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.UserSettings ||
  mongoose.model("UserSettings", userSettingsSchema);
