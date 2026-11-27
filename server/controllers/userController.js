const crypto = require("crypto");
const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const SessionFamily = require("../models/sessionFamilyModel");
const RefreshSession = require("../models/refreshSessionModel");
const { generateRefreshToken, generateSignedCsrfToken } = require("../utils/cryptoUtils");
const { signAccessToken } = require("../utils/jwtUtils");
const { setAuthCookies, clearAuthCookies } = require("../middleware/cookieConfig");

const {
  validateUsername,
  validateEmail,
  validatePassword,
} = require("../utils/validators");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_SALT_ROUNDS = 12;

function sanitizeUser(userDoc) {
  const obj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  return obj;
}

module.exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.json({ msg: "Incorrect Username or Password", status: false });
    }

    const user = await User.findOne({ username }).select("+password");
    if (!user) {
      return res.json({ msg: "Incorrect Username or Password", status: false });
    }

    // Account lockout enforcement
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.json({
        msg: "Account is temporarily locked due to multiple failed attempts. Please try again later.",
        status: false,
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const failed = (user.failedAttempts || 0) + 1;
      const updates = { failedAttempts: failed };
      if (failed >= 5) {
        updates.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-minute lock
      }
      await User.updateOne({ _id: user._id }, { $set: updates });
      return res.json({ msg: "Incorrect Username or Password", status: false });
    }

    // Reset failed attempts on success
    if (user.failedAttempts > 0 || user.lockUntil) {
      await User.updateOne({ _id: user._id }, { $set: { failedAttempts: 0, lockUntil: null } });
    }

    // Establish Phase 4 Session Family and RefreshSession
    const familyId = `fam_${crypto.randomBytes(16).toString("hex")}`;
    await SessionFamily.create({
      familyId,
      userId: user._id,
      familyStatus: "ACTIVE",
      isRevoked: false,
    });

    const { rawToken, tokenHash } = generateRefreshToken();
    await RefreshSession.create({
      tokenHash,
      familyId,
      userId: user._id,
      rotationState: "ACTIVE",
      isRevoked: false,
      expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
    });

    const { signedCookieValue } = generateSignedCsrfToken();
    setAuthCookies(res, { refreshToken: rawToken, csrfSignedCookie: signedCookieValue });

    const safeUser = sanitizeUser(user);
    const accessToken = signAccessToken({ userId: user._id, familyId });
    return res.json({ status: true, user: safeUser, accessToken });
  } catch (ex) {
    next(ex);
  }
};

module.exports.register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.json({ msg: "All fields are required", status: false });
    }

    const usernameVal = validateUsername(username);
    if (!usernameVal.isValid) {
      return res.json({ msg: usernameVal.error, status: false });
    }

    const emailVal = validateEmail(email);
    if (!emailVal.isValid) {
      return res.json({ msg: emailVal.error, status: false });
    }

    const passwordVal = validatePassword(password);
    if (!passwordVal.isValid) {
      return res.json({ msg: passwordVal.error, status: false });
    }

    const cleanUsername = usernameVal.sanitized;
    const cleanEmail = emailVal.sanitized;

    const usernameCheck = await User.findOne({ username: cleanUsername });
    if (usernameCheck) {
      return res.json({ msg: "Username already used", status: false });
    }
    const emailCheck = await User.findOne({ email: cleanEmail });
    if (emailCheck) {
      return res.json({ msg: "Email already used", status: false });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = await User.create({
      email: cleanEmail,
      username: cleanUsername,
      password: hashedPassword,
    });

    // Establish Phase 4 Session Family and RefreshSession
    const familyId = `fam_${crypto.randomBytes(16).toString("hex")}`;
    await SessionFamily.create({
      familyId,
      userId: user._id,
      familyStatus: "ACTIVE",
      isRevoked: false,
    });

    const { rawToken, tokenHash } = generateRefreshToken();
    await RefreshSession.create({
      tokenHash,
      familyId,
      userId: user._id,
      rotationState: "ACTIVE",
      isRevoked: false,
      expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
    });

    const { signedCookieValue } = generateSignedCsrfToken();
    setAuthCookies(res, { refreshToken: rawToken, csrfSignedCookie: signedCookieValue });

    const safeUser = sanitizeUser(user);
    const accessToken = signAccessToken({ userId: user._id, familyId });
    return res.json({ status: true, user: safeUser, accessToken });
  } catch (ex) {
    next(ex);
  }
};

module.exports.getAllUsers = async (req, res, next) => {
  try {
    const filter = req.params.id && req.params.id !== "undefined" ? { _id: { $ne: req.params.id } } : {};
    const users = await User.find(filter).select([
      "email",
      "username",
      "avatarImage",
      "isOnline",
      "lastSeen",
      "_id",
    ]);
    return res.json(users);
  } catch (ex) {
    next(ex);
  }
};

module.exports.setAvatar = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const avatarImage = req.body.image;
    const userData = await User.findByIdAndUpdate(
      userId,
      {
        isAvatarImageSet: true,
        avatarImage,
      },
      { new: true }
    );
    return res.json({
      isSet: userData.isAvatarImageSet,
      image: userData.avatarImage,
    });
  } catch (ex) {
    next(ex);
  }
};

module.exports.logOut = async (req, res, next) => {
  try {
    if (!req.params.id) return res.json({ msg: "User id is required " });
    
    // Revoke any active session families for this user
    try {
      await SessionFamily.updateMany(
        { userId: req.params.id, isRevoked: false },
        { $set: { isRevoked: true, familyStatus: "REVOKED", revocationReason: "LEGACY_LOGOUT" } }
      );
    } catch (_) {}

    clearAuthCookies(res);

    if (typeof onlineUsers !== "undefined" && onlineUsers && typeof onlineUsers.delete === "function") {
      onlineUsers.delete(req.params.id);
    }
    return res.status(200).send();
  } catch (ex) {
    next(ex);
  }
};
