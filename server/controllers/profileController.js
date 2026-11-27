/**
 * ConnectX Profile Controller
 * 
 * Provides:
 * - getMyProfile: Fetches authenticated user's profile details
 * - updateMyProfile: Updates authenticated user's name, bio, phoneNumber, statusMessage
 * - updateAvatar: Updates authenticated user's avatar image (base64 string or svg)
 * - getUserPublicProfile: Fetches any user's public profile (omitting private/sensitive attributes)
 * 
 * Invariants:
 * - Strict ownership enforcement: Users can only modify their own profile data (req.user.userId)
 * - Safe sanitization: Passwords, salt details, failed attempts, and lock dates are strictly omitted
 */
const User = require("../models/userModel");
const AppError = require("../utils/appError");
const {
  validateUsername,
  validateProfileFields,
  sanitizeString,
} = require("../utils/validators");

function sanitizeProfile(userDoc) {
  const obj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  delete obj.failedAttempts;
  delete obj.lockUntil;
  delete obj.passwordChangedAt;
  return obj;
}

/**
 * GET /api/v1/profile/me
 * Retrieves authenticated user's full profile details.
 */
async function getMyProfile(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
    }

    return res.status(200).json({
      success: true,
      profile: sanitizeProfile(user),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/profile/me
 * Updates authenticated user's profile fields (displayName, bio, phoneNumber, statusMessage).
 * Username updates validate uniqueness if modified.
 */
async function updateMyProfile(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { displayName, bio, phoneNumber, statusMessage, username } = req.body || {};

    const profileVal = validateProfileFields({ displayName, bio, phoneNumber, statusMessage });
    if (!profileVal.isValid) {
      return next(new AppError(profileVal.errors[0] || "Invalid profile data", 400, "VALIDATION_ERROR"));
    }

    const updates = { ...profileVal.cleaned };

    // Optional username update with uniqueness check
    if (username !== undefined) {
      const usernameVal = validateUsername(username);
      if (!usernameVal.isValid) {
        return next(new AppError(usernameVal.error, 400, "VALIDATION_ERROR"));
      }

      const cleanUsername = usernameVal.sanitized;
      // Check if username is taken by another user
      const existing = await User.findOne({ username: cleanUsername, _id: { $ne: userId } });
      if (existing) {
        return next(new AppError("Username is already in use", 409, "USER_ALREADY_EXISTS"));
      }
      updates.username = cleanUsername;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
    }

    return res.status(200).json({
      success: true,
      profile: sanitizeProfile(updatedUser),
      message: "Profile updated successfully",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/profile/avatar
 * Updates authenticated user's avatar image.
 */
async function updateAvatar(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { image } = req.body || {};
    if (!image || typeof image !== "string") {
      return next(new AppError("Avatar image data is required", 400, "VALIDATION_ERROR"));
    }

    // Validate image payload size (prevent huge payloads)
    if (image.length > 500000) { // 500KB base64 max
      return next(new AppError("Avatar image is too large (max 500KB)", 400, "PAYLOAD_TOO_LARGE"));
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isAvatarImageSet: true,
          avatarImage: image,
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
    }

    return res.status(200).json({
      success: true,
      isSet: updatedUser.isAvatarImageSet,
      avatarImage: updatedUser.avatarImage,
      message: "Avatar updated successfully",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/profile/:id
 * Fetches public profile details for another user.
 */
async function getUserPublicProfile(req, res, next) {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select([
      "_id",
      "username",
      "displayName",
      "avatarImage",
      "isAvatarImageSet",
      "bio",
      "statusMessage",
      "createdAt",
    ]);

    if (!user) {
      return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
    }

    return res.status(200).json({
      success: true,
      profile: user,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  updateAvatar,
  getUserPublicProfile,
  sanitizeProfile,
};
