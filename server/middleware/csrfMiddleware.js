/**
 * ConnectX Signed Double-Submit CSRF Verification Middleware
 * 
 * Verifies that mutating requests present both:
 * 1. X-CSRF-Token header containing raw token T
 * 2. connectx_csrf cookie containing signed token T.S (HMAC-SHA256)
 * 
 * Cryptographically verifies signature S and checks constant-time equality T === T.
 */
const { verifySignedCsrfToken } = require("../utils/cryptoUtils");
const { parseCookies, CSRF_TOKEN_COOKIE } = require("./cookieConfig");
const AppError = require("../utils/appError");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Creates or exports a CSRF protection middleware with optional route exemptions.
 */
function createCsrfProtection({ exemptPaths = [], secretOverride = null } = {}) {
  return function csrfProtection(req, res, next) {
    // Skip safe, idempotent HTTP methods
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return next();
    }

    // Check path exemptions (e.g. initial login/register before session is established)
    if (exemptPaths.some((p) => req.path === p || req.originalUrl === p)) {
      return next();
    }

    // Extract header token
    const headerToken = req.headers["x-csrf-token"] || req.headers["csrf-token"];

    // Extract signed cookie value
    let signedCookie = null;
    if (req.cookies && req.cookies[CSRF_TOKEN_COOKIE]) {
      signedCookie = req.cookies[CSRF_TOKEN_COOKIE];
    } else if (req.headers.cookie) {
      const parsed = parseCookies(req.headers.cookie);
      signedCookie = parsed[CSRF_TOKEN_COOKIE];
    }

    try {
      verifySignedCsrfToken(headerToken, signedCookie, secretOverride);
      next();
    } catch (err) {
      if (err instanceof AppError) {
        return next(err);
      }
      return next(new AppError("CSRF verification failed", 403, "CSRF_ERROR"));
    }
  };
}

const csrfProtection = createCsrfProtection();

module.exports = {
  csrfProtection,
  createCsrfProtection,
};
