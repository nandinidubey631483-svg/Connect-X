/**
 * ConnectX Settings Controller & Preferences Engine
 * 
 * Provides:
 * - getSettings: Retrieves authenticated user's settings (creates defaults if none exist)
 * - updateSettings: Validates and partially or fully updates user settings
 * - resetSettings: Reverts settings to system defaults
 * 
 * Invariants:
 * - Strict authenticated user ownership (req.user.userId)
 * - Safe payload validation against defined schemas and allowed enum values
 */
const UserSettings = require("../models/userSettingsModel");
const AppError = require("../utils/appError");

const DEFAULT_SETTINGS = {
  notifications: {
    emailNotifications: true,
    pushNotifications: true,
    soundEnabled: true,
    desktopAlerts: true,
  },
  privacy: {
    lastSeenVisibility: "everyone",
    readReceiptsEnabled: true,
    typingIndicatorVisibility: true,
  },
  chat: {
    enterToSend: true,
    fontSize: "medium",
    mediaAutoDownload: true,
    soundTheme: "default",
  },
};

const ALLOWED_LAST_SEEN = new Set(["everyone", "contacts", "nobody"]);
const ALLOWED_FONT_SIZES = new Set(["small", "medium", "large"]);
const ALLOWED_SOUND_THEMES = new Set(["default", "subtle", "none"]);

/**
 * GET /api/v1/settings
 * Retrieves authenticated user's settings.
 */
async function getSettings(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    let settings = await UserSettings.findOne({ userId });
    if (!settings) {
      settings = await UserSettings.create({
        userId,
        ...DEFAULT_SETTINGS,
      });
    }

    return res.status(200).json({
      success: true,
      settings: {
        notifications: settings.notifications,
        privacy: settings.privacy,
        chat: settings.chat,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/settings
 * Partially or completely updates user settings categories.
 */
async function updateSettings(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { notifications, privacy, chat } = req.body || {};
    const updates = {};

    // Validate and build notifications updates
    if (notifications && typeof notifications === "object") {
      if (notifications.emailNotifications !== undefined) {
        if (typeof notifications.emailNotifications !== "boolean") {
          return next(new AppError("emailNotifications must be boolean", 400, "VALIDATION_ERROR"));
        }
        updates["notifications.emailNotifications"] = notifications.emailNotifications;
      }
      if (notifications.pushNotifications !== undefined) {
        if (typeof notifications.pushNotifications !== "boolean") {
          return next(new AppError("pushNotifications must be boolean", 400, "VALIDATION_ERROR"));
        }
        updates["notifications.pushNotifications"] = notifications.pushNotifications;
      }
      if (notifications.soundEnabled !== undefined) {
        if (typeof notifications.soundEnabled !== "boolean") {
          return next(new AppError("soundEnabled must be boolean", 400, "VALIDATION_ERROR"));
        }
        updates["notifications.soundEnabled"] = notifications.soundEnabled;
      }
      if (notifications.desktopAlerts !== undefined) {
        if (typeof notifications.desktopAlerts !== "boolean") {
          return next(new AppError("desktopAlerts must be boolean", 400, "VALIDATION_ERROR"));
        }
        updates["notifications.desktopAlerts"] = notifications.desktopAlerts;
      }
    }

    // Validate and build privacy updates
    if (privacy && typeof privacy === "object") {
      if (privacy.lastSeenVisibility !== undefined) {
        if (!ALLOWED_LAST_SEEN.has(privacy.lastSeenVisibility)) {
          return next(new AppError("Invalid lastSeenVisibility value", 400, "VALIDATION_ERROR"));
        }
        updates["privacy.lastSeenVisibility"] = privacy.lastSeenVisibility;
      }
      if (privacy.readReceiptsEnabled !== undefined) {
        if (typeof privacy.readReceiptsEnabled !== "boolean") {
          return next(new AppError("readReceiptsEnabled must be boolean", 400, "VALIDATION_ERROR"));
        }
        updates["privacy.readReceiptsEnabled"] = privacy.readReceiptsEnabled;
      }
      if (privacy.typingIndicatorVisibility !== undefined) {
        if (typeof privacy.typingIndicatorVisibility !== "boolean") {
          return next(new AppError("typingIndicatorVisibility must be boolean", 400, "VALIDATION_ERROR"));
        }
        updates["privacy.typingIndicatorVisibility"] = privacy.typingIndicatorVisibility;
      }
    }

    // Validate and build chat updates
    if (chat && typeof chat === "object") {
      if (chat.enterToSend !== undefined) {
        if (typeof chat.enterToSend !== "boolean") {
          return next(new AppError("enterToSend must be boolean", 400, "VALIDATION_ERROR"));
        }
        updates["chat.enterToSend"] = chat.enterToSend;
      }
      if (chat.fontSize !== undefined) {
        if (!ALLOWED_FONT_SIZES.has(chat.fontSize)) {
          return next(new AppError("Invalid fontSize value", 400, "VALIDATION_ERROR"));
        }
        updates["chat.fontSize"] = chat.fontSize;
      }
      if (chat.mediaAutoDownload !== undefined) {
        if (typeof chat.mediaAutoDownload !== "boolean") {
          return next(new AppError("mediaAutoDownload must be boolean", 400, "VALIDATION_ERROR"));
        }
        updates["chat.mediaAutoDownload"] = chat.mediaAutoDownload;
      }
      if (chat.soundTheme !== undefined) {
        if (!ALLOWED_SOUND_THEMES.has(chat.soundTheme)) {
          return next(new AppError("Invalid soundTheme value", 400, "VALIDATION_ERROR"));
        }
        updates["chat.soundTheme"] = chat.soundTheme;
      }
    }

    if (Object.keys(updates).length === 0) {
      return next(new AppError("No valid setting updates provided", 400, "VALIDATION_ERROR"));
    }

    const updated = await UserSettings.findOneAndUpdate(
      { userId },
      { $set: updates },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      settings: {
        notifications: updated.notifications,
        privacy: updated.privacy,
        chat: updated.chat,
        updatedAt: updated.updatedAt,
      },
      message: "Settings updated successfully",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/settings/reset
 * Resets user settings to system defaults.
 */
async function resetSettings(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const reset = await UserSettings.findOneAndUpdate(
      { userId },
      { $set: DEFAULT_SETTINGS },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      settings: {
        notifications: reset.notifications,
        privacy: reset.privacy,
        chat: reset.chat,
        updatedAt: reset.updatedAt,
      },
      message: "Settings reset to defaults successfully",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  resetSettings,
  DEFAULT_SETTINGS,
};
