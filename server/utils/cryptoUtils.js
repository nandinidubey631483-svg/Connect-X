/**
 * ConnectX Cryptographic Primitives
 * 
 * - SHA-256 Token Hashing (Refresh Tokens)
 * - Cryptographically Secure Random Token Generation
 * - HMAC-SHA256 Signed Double-Submit CSRF Verification with Timing-Safe Comparison
 */
const crypto = require("crypto");
const config = require("../config/env");
const AppError = require("./appError");

/**
 * Computes a SHA-256 hash of a raw token string.
 */
function hashToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    throw new AppError("Cannot hash empty or invalid token", 400, "CRYPTO_ERROR");
  }
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generates a high-entropy 32-byte hexadecimal bearer refresh token and its SHA-256 hash.
 */
function generateRefreshToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

function getCsrfSecret(secretOverride = null) {
  if (secretOverride) return secretOverride;
  if (config.csrfSecret) return config.csrfSecret;
  if (config.jwt && config.jwt.accessSecret) {
    return crypto.createHmac("sha256", config.jwt.accessSecret).update("connectx_csrf_derived_secret").digest("hex");
  }
  throw new AppError("CSRF secret key is not configured", 500, "CONFIG_ERROR");
}

/**
 * Constant-time string equality comparison immune to timing attacks and length-mismatch RangeError.
 * Pre-hashes inputs using SHA-256 to ensure timingSafeEqual always receives matching 32-byte buffers.
 */
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  const hashesMatch = crypto.timingSafeEqual(hashA, hashB);
  return hashesMatch && a.length === b.length;
}

/**
 * Generates a signed double-submit CSRF token.
 * Output:
 * - csrfToken: raw token T sent in JSON response / X-CSRF-Token header
 * - signedCookieValue: T.S where S = HMAC-SHA256(T, secret)
 */
function generateSignedCsrfToken(secretOverride = null) {
  const secret = getCsrfSecret(secretOverride);
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(csrfToken).digest("hex");
  const signedCookieValue = `${csrfToken}.${signature}`;
  return { csrfToken, signedCookieValue };
}

/**
 * Verifies a signed double-submit CSRF token against request header and cookie.
 * Defenses:
 * - Enforces correct T.S format
 * - Constant-time signature verification (prevents forged / cookie-injected tokens)
 * - Constant-time comparison with header token
 * - Immune to length-dependent timing side channels via SHA-256 pre-hashing
 */
function verifySignedCsrfToken(headerToken, signedCookieValue, secretOverride = null) {
  if (!headerToken || typeof headerToken !== "string") {
    throw new AppError("CSRF token missing from request headers", 403, "CSRF_MISSING");
  }
  if (!signedCookieValue || typeof signedCookieValue !== "string") {
    throw new AppError("CSRF cookie missing from request", 403, "CSRF_MISSING");
  }

  const parts = signedCookieValue.split(".");
  if (parts.length !== 2) {
    throw new AppError("Malformed CSRF cookie format", 403, "CSRF_INVALID_FORMAT");
  }

  const [cookieToken, cookieSignature] = parts;

  const secret = getCsrfSecret(secretOverride);
  const expectedSignature = crypto.createHmac("sha256", secret).update(cookieToken).digest("hex");

  // Constant-time signature verification with length-safety
  if (!constantTimeEqual(cookieSignature, expectedSignature)) {
    throw new AppError("CSRF cookie signature verification failed", 403, "CSRF_SIGNATURE_INVALID");
  }

  // Constant-time header vs cookie token verification with length-safety
  if (!constantTimeEqual(headerToken, cookieToken)) {
    throw new AppError("CSRF header token does not match signed cookie token", 403, "CSRF_MISMATCH");
  }

  return true;
}

module.exports = {
  hashToken,
  generateRefreshToken,
  generateSignedCsrfToken,
  verifySignedCsrfToken,
  getCsrfSecret,
  constantTimeEqual,
};
