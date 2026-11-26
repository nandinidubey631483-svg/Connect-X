/**
 * ConnectX Authentication Controller & Coordination Engine
 * 
 * Implements:
 * - Register, Login, Refresh, Logout, Logout-All, CSRF-Token, and Me endpoints
 * - Strict 4-step Refresh Coordination Protocol:
 *   - Step 0: Pre-lock validation & DB-derived familyId resolution (token reuse detection)
 *   - Step 0.5: Durable Cluster-Visible Intent Anchor in ActiveRotations (majority write)
 *   - Step 1: Family Lock on SessionFamily (ACTIVE -> ROTATING)
 *   - Step 2 & 3: Transactional rotation with atomic ActiveRotations deletion & strict deletedCount === 1 assertion
 * - Brute-force lockout & credential sanitization
 * - Fail-closed error handling and cleanup
 */
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const User = require("../models/userModel");
const SessionFamily = require("../models/sessionFamilyModel");
const ActiveRotations = require("../models/activeRotationsModel");
const RefreshSession = require("../models/refreshSessionModel");
const Counter = require("../models/counterModel");
const Otp = require("../models/otpModel");

const { signAccessToken } = require("../utils/jwtUtils");
const {
  hashToken,
  generateRefreshToken,
  generateSignedCsrfToken,
} = require("../utils/cryptoUtils");
const { getNextFencingToken } = require("../utils/fencingSequence");
const {
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
  getCookieOptions,
} = require("../middleware/cookieConfig");
const AppError = require("../utils/appError");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Register: Creates User, SessionFamily, initial RefreshSession, and sets auth cookies.
 */
async function register(req, res, next) {
  try {
    const { username, email, password, otpVerificationToken } = req.body || {};

    if (!username || !email || !password) {
      return next(new AppError("Username, email, and password are required.", 400, "VALIDATION_ERROR"));
    }

    if (password.length < 8) {
      return next(new AppError("Password must be at least 8 characters long.", 400, "VALIDATION_ERROR"));
    }

    // Verify OTP token if provided
    if (otpVerificationToken) {
      const validOtp = await Otp.findOne({
        email: email.toLowerCase().trim(),
        verificationToken: otpVerificationToken,
        consumed: true,
      });

      if (!validOtp) {
        return next(new AppError("Invalid or unverified email verification token.", 400, "INVALID_OTP_TOKEN"));
      }
    }

    // Check existing username or email
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      const field = existingUser.username === username ? "Username" : "Email";
      return next(new AppError(`${field} already in use.`, 409, "USER_ALREADY_EXISTS"));
    }

    // Hash password with salt rounds 12
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    // Create primary SessionFamily
    const familyId = `fam_${crypto.randomBytes(16).toString("hex")}`;
    const sessionFamily = await SessionFamily.create({
      familyId,
      userId: user._id,
      familyStatus: "ACTIVE",
      isRevoked: false,
    });

    // Create initial RefreshSession
    const { rawToken, tokenHash } = generateRefreshToken();
    await RefreshSession.create({
      tokenHash,
      familyId,
      userId: user._id,
      rotationState: "ACTIVE",
      isRevoked: false,
      expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
    });

    // Issue tokens
    const accessToken = signAccessToken({ userId: user._id, familyId });
    const { csrfToken, signedCookieValue } = generateSignedCsrfToken();

    // Set secure HttpOnly cookies
    setAuthCookies(res, { refreshToken: rawToken, csrfSignedCookie: signedCookieValue });

    return res.status(201).json({
      success: true,
      accessToken,
      csrfToken,
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        email: user.email,
        isAvatarImageSet: user.isAvatarImageSet,
        avatarImage: user.avatarImage,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Login: Verifies credentials, enforces lockout, creates new SessionFamily, and sets auth cookies.
 */
async function login(req, res, next) {
  try {
    const { username, email, password } = req.body || {};
    const identifier = username || email;

    if (!identifier || !password) {
      return next(new AppError("Username/email and password are required.", 400, "VALIDATION_ERROR"));
    }

    // Select password explicitly (select: false)
    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }],
    }).select("+password");

    if (!user) {
      return next(new AppError("Incorrect username or password.", 401, "INVALID_CREDENTIALS"));
    }

    // Lockout verification
    if (user.lockUntil && user.lockUntil > new Date()) {
      const waitMinutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return next(
        new AppError(
          `Account is temporarily locked due to failed attempts. Try again in ${waitMinutes} minutes.`,
          423,
          "ACCOUNT_LOCKED",
          { lockUntil: user.lockUntil }
        )
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const failedAttempts = (user.failedAttempts || 0) + 1;
      const updates = { failedAttempts };

      if (failedAttempts >= 5) {
        updates.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-minute lockout
      }

      await User.updateOne({ _id: user._id }, { $set: updates });
      return next(new AppError("Incorrect username or password.", 401, "INVALID_CREDENTIALS"));
    }

    // Reset failed attempts on success
    if (user.failedAttempts > 0 || user.lockUntil) {
      await User.updateOne({ _id: user._id }, { $set: { failedAttempts: 0, lockUntil: null } });
    }

    // Create fresh SessionFamily
    const familyId = `fam_${crypto.randomBytes(16).toString("hex")}`;
    await SessionFamily.create({
      familyId,
      userId: user._id,
      familyStatus: "ACTIVE",
      isRevoked: false,
    });

    // Create initial RefreshSession
    const { rawToken, tokenHash } = generateRefreshToken();
    await RefreshSession.create({
      tokenHash,
      familyId,
      userId: user._id,
      rotationState: "ACTIVE",
      isRevoked: false,
      expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
    });

    // Issue tokens
    const accessToken = signAccessToken({ userId: user._id, familyId });
    const { csrfToken, signedCookieValue } = generateSignedCsrfToken();

    setAuthCookies(res, { refreshToken: rawToken, csrfSignedCookie: signedCookieValue });

    return res.status(200).json({
      success: true,
      accessToken,
      csrfToken,
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        email: user.email,
        isAvatarImageSet: user.isAvatarImageSet,
        avatarImage: user.avatarImage,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Refresh: Executes the strict 4-step rotation engine with ActiveRotations intent anchoring.
 */
async function refresh(req, res, next) {
  let declaredOperationId = null;
  let declaredFamilyId = null;

  try {
    // Extract raw refresh token from cookie or request body
    const rawToken = (req.cookies && req.cookies[REFRESH_TOKEN_COOKIE]) || (req.body && req.body.refreshToken);

    if (!rawToken || typeof rawToken !== "string") {
      return next(new AppError("Refresh token required", 401, "TOKEN_MISSING"));
    }

    const tokenHash = hashToken(rawToken);

    // -------------------------------------------------------------------------
    // Step 0: Pre-Lock Token Validation & Authoritative DB-Derived FamilyId
    // -------------------------------------------------------------------------
    const sessionDoc = await RefreshSession.findOne({ tokenHash });

    if (!sessionDoc) {
      return next(new AppError("Invalid refresh session", 401, "TOKEN_INVALID"));
    }

    // TOKEN REUSE ATTACK DETECTION:
    // If presented token is already revoked, an attacker or compromised party
    // has presented an old rotated token -> IMMEDIATELY REVOKE entire family!
    if (sessionDoc.isRevoked) {
      await SessionFamily.updateOne(
        { familyId: sessionDoc.familyId },
        {
          $set: {
            isRevoked: true,
            familyStatus: "REVOKED",
            revocationReason: "TOKEN_REUSE_DETECTED",
            revokedAt: new Date(),
          },
        }
      );
      clearAuthCookies(res);
      return next(
        new AppError(
          "Security alert: Refresh token reuse detected. Session terminated.",
          401,
          "TOKEN_REUSE_DETECTED"
        )
      );
    }

    // Expiry check
    if (sessionDoc.expiresAt && sessionDoc.expiresAt < new Date()) {
      return next(new AppError("Refresh token expired. Please login again.", 401, "TOKEN_EXPIRED"));
    }

    if (sessionDoc.rotationState !== "ACTIVE") {
      return next(new AppError("Refresh session is in an inactive state", 401, "TOKEN_INACTIVE"));
    }

    // Authoritative database-derived familyId
    const familyId = sessionDoc.familyId;
    declaredFamilyId = familyId;

    // Verify SessionFamily active status
    const family = await SessionFamily.findOne({ familyId });
    if (!family || family.isRevoked) {
      clearAuthCookies(res);
      return next(new AppError("Session family has been revoked.", 401, "SESSION_REVOKED"));
    }

    if (family.familyStatus === "QUARANTINED") {
      return next(new AppError("Session family is quarantined.", 401, "FAMILY_QUARANTINED"));
    }

    // -------------------------------------------------------------------------
    // Step 0.5: Durable Cluster-Visible Intent Anchor in ActiveRotations
    // -------------------------------------------------------------------------
    const operationId = `op_${crypto.randomUUID()}`;
    declaredOperationId = operationId;

    const fencingToken = await getNextFencingToken({ counterModel: Counter });

    let activeIntentExisting = null;
    try {
      activeIntentExisting = await ActiveRotations.findOneAndUpdate(
        { _id: familyId },
        {
          $setOnInsert: {
            operationId,
            tokenHash,
            fencingToken,
            workerId: process.env.WORKER_ID || "worker_default",
            intentStatus: "INTENT_DECLARED",
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "before" }
      );
    } catch (upsertErr) {
      // E11000 duplicate key on _id confirms intent already exists
      return next(new AppError("Rotation already in progress for this session.", 409, "REFRESH_IN_PROGRESS"));
    }

    if (activeIntentExisting !== null) {
      // Intent was already active
      return next(new AppError("Rotation already in progress for this session.", 409, "REFRESH_IN_PROGRESS"));
    }

    // -------------------------------------------------------------------------
    // Step 1: Family Lock on SessionFamily (ACTIVE -> ROTATING)
    // -------------------------------------------------------------------------
    let step1Result;
    try {
      step1Result = await SessionFamily.updateOne(
        { familyId, familyStatus: "ACTIVE", isRevoked: false },
        {
          $set: {
            familyStatus: "ROTATING",
            activeOperationId: operationId,
            lastRotatedAt: new Date(),
          },
        }
      );
    } catch (step1Err) {
      // Step 1 write ambiguity or timeout
      await ActiveRotations.updateOne(
        { _id: familyId, operationId },
        { $set: { intentStatus: "AMBIGUOUS_STEP1" } }
      );
      return next(
        new AppError(
          "Transaction ambiguous during family lock. Intent quarantined.",
          503,
          "AUTH_TRANSACTION_UNCERTAIN"
        )
      );
    }

    if (step1Result.matchedCount !== 1) {
      // Race or family revoked concurrently -> roll back Step 0.5 intent cleanly
      await ActiveRotations.deleteOne({ _id: familyId, operationId });
      return next(new AppError("Session family lock race conflict.", 409, "REFRESH_CONCURRENCY_CONFLICT"));
    }

    // -------------------------------------------------------------------------
    // Step 2 & 3: Transactional Successor Creation & Atomic ActiveRotations Deletion
    // -------------------------------------------------------------------------
    const { rawToken: nextRawToken, tokenHash: successorHash } = generateRefreshToken();

    const clientSession = mongoose.connection.readyState === 1 ? await mongoose.startSession() : null;

    const executeRotationCommit = async (session) => {
      const opts = session ? { session } : {};

      // 1. Mark old RefreshSession rotated and committed
      await RefreshSession.updateOne(
        { tokenHash, isRevoked: false, rotationState: "ACTIVE" },
        {
          $set: {
            isRevoked: true,
            rotationState: "COMMITTED",
            revocationReason: "ROTATED",
            replacedByTokenHash: successorHash,
            rotatedAt: new Date(),
          },
        },
        opts
      );

      // 2. Insert successor RefreshSession
      await RefreshSession.create(
        [
          {
            tokenHash: successorHash,
            familyId,
            userId: sessionDoc.userId,
            rotationState: "ACTIVE",
            isRevoked: false,
            expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
          },
        ],
        opts
      );

      // 3. Update SessionFamily back to ACTIVE with monotonic fencing tracking
      await SessionFamily.updateOne(
        { familyId, activeOperationId: operationId, familyStatus: "ROTATING" },
        {
          $set: {
            familyStatus: "ACTIVE",
            activeOperationId: null,
            lastFencingToken: fencingToken,
            lastFencingOperationId: operationId,
            lastRotatedAt: new Date(),
          },
        },
        opts
      );

      // 4. Atomically delete intent from ActiveRotations asserting deletedCount === 1
      const deleteResult = await ActiveRotations.deleteOne(
        { _id: familyId, operationId },
        opts
      );

      if (deleteResult.deletedCount !== 1) {
        throw new AppError("Intent deletion failed during rotation commit", 409, "CONCURRENCY_FENCE_ERROR");
      }
    };

    try {
      if (clientSession && typeof clientSession.withTransaction === "function") {
        try {
          await clientSession.withTransaction(async () => {
            await executeRotationCommit(clientSession);
          });
        } catch (txErr) {
          if (txErr && txErr.message && txErr.message.includes("Transaction numbers are only allowed")) {
            await executeRotationCommit(null);
          } else {
            throw txErr;
          }
        }
      } else {
        await executeRotationCommit(null);
      }
    } finally {
      if (clientSession) {
        await clientSession.endSession();
      }
    }

    // Issue refreshed tokens
    const accessToken = signAccessToken({ userId: sessionDoc.userId, familyId });
    const { csrfToken, signedCookieValue } = generateSignedCsrfToken();

    setAuthCookies(res, { refreshToken: nextRawToken, csrfSignedCookie: signedCookieValue });

    return res.status(200).json({
      success: true,
      accessToken,
      csrfToken,
    });
  } catch (err) {
    // Fenced safe rollback cleanup if step 0.5 was declared
    if (declaredFamilyId && declaredOperationId) {
      try {
        await SessionFamily.updateOne(
          { familyId: declaredFamilyId, activeOperationId: declaredOperationId, familyStatus: "ROTATING" },
          { $set: { familyStatus: "ACTIVE", activeOperationId: null } }
        );
        await ActiveRotations.deleteOne({ _id: declaredFamilyId, operationId: declaredOperationId });
      } catch (_) {}
    }
    next(err);
  }
}

/**
 * Logout: Revokes current session family and refresh token, cleans up active rotation intent.
 */
async function logout(req, res, next) {
  try {
    const rawToken = (req.cookies && req.cookies[REFRESH_TOKEN_COOKIE]) || (req.body && req.body.refreshToken);
    const familyIdFromUser = req.user && req.user.familyId;

    let targetFamilyId = familyIdFromUser || null;
    let targetTokenHash = null;

    if (rawToken && typeof rawToken === "string") {
      targetTokenHash = hashToken(rawToken);
      const sessionDoc = await RefreshSession.findOne({ tokenHash: targetTokenHash });
      if (sessionDoc) {
        targetFamilyId = sessionDoc.familyId;
      }
    }

    if (targetFamilyId) {
      await SessionFamily.updateOne(
        { familyId: targetFamilyId },
        {
          $set: {
            isRevoked: true,
            familyStatus: "REVOKED",
            revocationReason: "LOGOUT",
            revokedAt: new Date(),
            activeOperationId: null,
          },
        }
      );
      await ActiveRotations.deleteOne({ _id: targetFamilyId });
    }

    if (targetTokenHash) {
      await RefreshSession.updateOne(
        { tokenHash: targetTokenHash },
        { $set: { isRevoked: true, revocationReason: "LOGOUT" } }
      );
    }

    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Logout-All: Revokes all active session families and refresh tokens belonging to the authenticated user.
 */
async function logoutAll(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "AUTH_REQUIRED"));
    }

    await SessionFamily.updateMany(
      { userId, isRevoked: false },
      {
        $set: {
          isRevoked: true,
          familyStatus: "REVOKED",
          revocationReason: "LOGOUT_ALL",
          revokedAt: new Date(),
          activeOperationId: null,
        },
      }
    );

    await RefreshSession.updateMany(
      { userId, isRevoked: false },
      {
        $set: {
          isRevoked: true,
          revocationReason: "LOGOUT_ALL",
        },
      }
    );

    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "All sessions logged out successfully",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * CSRF-Token: Issues signed double-submit CSRF cookie and raw token.
 */
function getCsrfToken(req, res, next) {
  try {
    const { csrfToken, signedCookieValue } = generateSignedCsrfToken();
    const csrfOpts = getCookieOptions({ path: "/" });

    res.cookie(CSRF_TOKEN_COOKIE, signedCookieValue, csrfOpts);

    return res.status(200).json({
      success: true,
      csrfToken,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Me: Returns authenticated user profile and active session family context.
 */
async function getMe(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "AUTH_REQUIRED"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError("User not found", 404, "USER_NOT_FOUND"));
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        _id: user._id,
        username: user.username,
        email: user.email,
        isAvatarImageSet: user.isAvatarImageSet,
        avatarImage: user.avatarImage,
        createdAt: user.createdAt,
      },
      sessionFamily: req.sessionFamily || null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getCsrfToken,
  getMe,
};
