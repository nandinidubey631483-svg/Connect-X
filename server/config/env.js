/**
 * ConnectX Environment Configuration & Validation
 * Rule: Never use fallback JWT or cookie secrets.
 * Validates required configuration and fails safely upon invalid startup states.
 */
require("dotenv").config();

function validateEnv() {
  const errors = [];

  const port = process.env.PORT || 5000;
  const mongoUrl = process.env.MONGO_URL;
  const nodeEnv = process.env.NODE_ENV || "development";
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) 
    : ["http://localhost:3000"];

  if (!mongoUrl) {
    errors.push("MONGO_URL is required in environment variables.");
  }

  // Strict Secret Validation Rules: Never allow default/fallback secrets
  if (!process.env.JWT_ACCESS_SECRET) {
    errors.push("JWT_ACCESS_SECRET is required in environment variables.");
  } else if (process.env.JWT_ACCESS_SECRET.length < 32) {
    errors.push("JWT_ACCESS_SECRET must be at least 32 characters long for cryptographic security.");
  }

  if (process.env.JWT_REFRESH_SECRET) {
    if (process.env.JWT_REFRESH_SECRET.length < 32) {
      errors.push("JWT_REFRESH_SECRET must be at least 32 characters long for cryptographic security.");
    }
  }

  if (process.env.CSRF_SECRET) {
    if (process.env.CSRF_SECRET.length < 32) {
      errors.push("CSRF_SECRET must be at least 32 characters long for cryptographic security.");
    }
  }

  if (errors.length > 0) {
    console.error("❌ Fatal Configuration Error: Invalid environment settings detected:");
    errors.forEach((err) => console.error(`  - ${err}`));
    throw new Error(`Environment configuration failed: ${errors.join("; ")}`);
  }

  return Object.freeze({
    port: Number(port),
    mongoUrl,
    nodeEnv,
    allowedOrigins,
    isProduction: nodeEnv === "production",
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET || null,
      refreshSecret: process.env.JWT_REFRESH_SECRET || null,
    },
    cookieSecret: process.env.COOKIE_SECRET || null,
    csrfSecret: process.env.CSRF_SECRET || null,
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
    cookieTopology: process.env.COOKIE_TOPOLOGY || (nodeEnv === "production" ? "same-site" : "same-origin"),
    crossSiteCookies: process.env.CROSS_SITE_COOKIES === "true",
    trustProxy: process.env.TRUST_PROXY !== undefined ? (
      process.env.TRUST_PROXY === "true" ? true :
      process.env.TRUST_PROXY === "false" ? false :
      !isNaN(Number(process.env.TRUST_PROXY)) ? Number(process.env.TRUST_PROXY) :
      process.env.TRUST_PROXY
    ) : (nodeEnv === "production" ? 1 : false),
  });
}

const config = validateEnv();
module.exports = config;
