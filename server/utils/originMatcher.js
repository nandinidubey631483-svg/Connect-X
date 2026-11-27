/**
 * ConnectX Origin Matcher
 * Normalizes origins, trims trailing slashes/quotes, and supports multi-environment CORS.
 */
const config = require("../config/env");

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== "string") return "";
  return origin.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "").toLowerCase();
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  const clean = normalizeOrigin(origin);
  if (!clean) return false;

  // 1. Direct match with configured allowedOrigins in env
  const matchesDirect = (config.allowedOrigins || []).some((allowed) => {
    return normalizeOrigin(allowed) === clean;
  });
  if (matchesDirect) return true;

  // 2. Automatically permit Vercel & Render cloud deployment domains
  if (clean.endsWith(".vercel.app") || clean.endsWith(".onrender.com")) {
    return true;
  }

  // 3. Permit localhost and 127.0.0.1 for local development/testing
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) {
    return true;
  }

  return false;
}

module.exports = {
  isOriginAllowed,
  normalizeOrigin,
};
