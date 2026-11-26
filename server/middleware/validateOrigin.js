/**
 * ConnectX Robust Origin & Referer Validation Middleware
 * 
 * Protects state-mutating requests from Cross-Origin Request Forgery (CSRF).
 * Safe URL parsing never throws on malformed or null headers.
 */
const config = require("../config/env");
const AppError = require("../utils/appError");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Safely extracts normalized origin (scheme://host:port) from raw header value.
 * Returns null on empty, "null", or malformed strings without throwing.
 */
function extractSafeOrigin(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return null;
  }
  const trimmed = headerValue.trim();
  if (trimmed === "null" || trimmed === "") {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    // Ignore non-http(s) origins (e.g. javascript:, data:, file:)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch (_) {
    return null;
  }
}

/**
 * Express middleware validating request Origin / Referer against whitelist.
 */
function validateOrigin(req, res, next) {
  // Safe read-only methods are exempt from strict cross-origin enforcement
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // Inspect Origin first; fall back to Referer
  const rawHeader = req.headers["origin"] || req.headers["referer"];
  const clientOrigin = extractSafeOrigin(rawHeader);

  // In production, reject any mutating request missing an origin or having an unlisted origin
  if (config.isProduction) {
    if (!clientOrigin) {
      return next(new AppError("Cross-Origin Protection: Missing or malformed origin header.", 403, "CORS_POLICY_VIOLATION"));
    }
    if (!config.allowedOrigins.includes(clientOrigin)) {
      return next(new AppError("Cross-Origin Protection: Request origin not permitted.", 403, "CORS_POLICY_VIOLATION"));
    }
  } else {
    // Development mode: validate origin if present
    if (clientOrigin && !config.allowedOrigins.includes(clientOrigin)) {
      return next(new AppError("Cross-Origin Protection: Request origin not permitted.", 403, "CORS_POLICY_VIOLATION"));
    }
  }

  next();
}

module.exports = {
  validateOrigin,
  extractSafeOrigin,
};
