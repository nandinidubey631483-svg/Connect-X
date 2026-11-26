/**
 * ConnectX RFC 7519 JWT Utilities
 * 
 * Enforces strict RFC 7519 compliant claims:
 * - sub: User ObjectId string
 * - familyId: Associated RefreshSession SessionFamily UUID
 * - iss: "connectx-api"
 * - aud: "connectx-client"
 * - exp: 15-minute default access-token lifespan
 */
const jwt = require("jsonwebtoken");
const config = require("../config/env");
const AppError = require("./appError");

const ISSUER = "connectx-api";
const AUDIENCE = "connectx-client";
const DEFAULT_EXPIRATION = "15m";

function getSecretKey() {
  const secret = config.jwt && config.jwt.accessSecret;
  if (!secret || secret.length < 32) {
    throw new AppError("Cryptographic configuration error: JWT_ACCESS_SECRET invalid or missing", 500, "CONFIG_ERROR");
  }
  return secret;
}

/**
 * Signs an access token conforming strictly to ConnectX RFC 7519 requirements.
 */
function signAccessToken({ userId, familyId, expiresIn = DEFAULT_EXPIRATION, secretOverride = null }) {
  if (!userId) {
    throw new AppError("Cannot sign access token without userId (sub)", 400, "TOKEN_SIGN_ERROR");
  }
  if (!familyId) {
    throw new AppError("Cannot sign access token without familyId", 400, "TOKEN_SIGN_ERROR");
  }

  const payload = {
    sub: String(userId),
    familyId: String(familyId),
  };

  const secret = secretOverride || getSecretKey();

  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn,
  });
}

/**
 * Verifies an access token asserting correct issuer, audience, and active validity.
 */
function verifyAccessToken(token, secretOverride = null) {
  if (!token || typeof token !== "string") {
    throw new AppError("Access token is required", 401, "TOKEN_MISSING");
  }

  const secret = secretOverride || getSecretKey();

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"], // Strict algorithm allowlisting; blocks 'none' or asymmetric confusion attacks
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (!decoded.sub || !decoded.familyId) {
      throw new AppError("Token payload missing mandatory claims", 401, "TOKEN_MALFORMED");
    }

    return decoded;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    if (err.name === "TokenExpiredError") {
      throw new AppError("Access token expired", 401, "AUTH_EXPIRED");
    }
    if (err.name === "JsonWebTokenError" || err.name === "SyntaxError") {
      throw new AppError(`Invalid access token: ${err.message}`, 401, "TOKEN_INVALID");
    }
    throw new AppError("Authentication token verification failed", 401, "AUTH_FAILED");
  }
}

/**
 * Safely decodes a token without verifying signature (for debugging or expiration pre-check).
 */
function decodeToken(token) {
  return jwt.decode(token);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  decodeToken,
  ISSUER,
  AUDIENCE,
  DEFAULT_EXPIRATION,
};
