/**
 * ConnectX Authentication & Authorization Middleware
 * 
 * Enforces:
 * - RFC 7519 JWT Bearer access token verification (sub, familyId, iss, aud, exp)
 * - SessionFamily authoritative status check (fail-closed if revoked or quarantined)
 * - req.user and req.sessionFamily context binding
 */
const { verifyAccessToken } = require("../utils/jwtUtils");
const SessionFamily = require("../models/sessionFamilyModel");
const AppError = require("../utils/appError");

/**
 * Extracts raw Bearer token from Authorization request header.
 */
function extractBearerToken(req) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }
  // Allow bearer token in query parameter for direct browser downloads or media streaming
  if (req.query && (req.query.token || req.query.access_token)) {
    return req.query.token || req.query.access_token;
  }
  return null;
}

/**
 * Factory creating authenticateToken middleware with configurable SessionFamily model override (for testing).
 */
function createAuthenticateToken({ sessionFamilyModel = SessionFamily, secretOverride = null } = {}) {
  return async function authenticateToken(req, res, next) {
    const rawToken = extractBearerToken(req);
    if (!rawToken) {
      return next(new AppError("Authorization token required", 401, "TOKEN_MISSING"));
    }

    let decoded;
    try {
      decoded = verifyAccessToken(rawToken, secretOverride);
    } catch (err) {
      return next(err);
    }

    // Bind authenticated claims
    req.user = {
      userId: decoded.sub,
      familyId: decoded.familyId,
    };

    // Authoritative SessionFamily Validation (Fail-Closed Governance)
    try {
      const family = await sessionFamilyModel.findOne({ familyId: decoded.familyId });

      if (!family) {
        return next(new AppError("Session family not found", 401, "SESSION_INVALID"));
      }

      if (family.isRevoked) {
        return next(
          new AppError(
            `Session family has been revoked: ${family.revocationReason || "REVOKED"}`,
            401,
            "SESSION_REVOKED"
          )
        );
      }

      if (family.familyStatus === "QUARANTINED") {
        return next(new AppError("Session family is quarantined", 401, "FAMILY_QUARANTINED"));
      }

      if (family.familyStatus !== "ACTIVE") {
        return next(new AppError("Session family is inactive", 401, "SESSION_INACTIVE"));
      }

      // Check user binding integrity
      if (family.userId && String(family.userId) !== String(decoded.sub)) {
        return next(new AppError("Token subject does not match session family", 401, "TOKEN_MISMATCH"));
      }

      req.sessionFamily = family;
      next();
    } catch (dbErr) {
      // In fail-closed distributed governance: if session verification fails, deny access
      return next(new AppError("Failed to verify session family status", 500, "SESSION_VERIFY_ERROR"));
    }
  };
}

const authenticateToken = createAuthenticateToken();

/**
 * Simple assertion middleware ensuring req.user was attached by authenticateToken.
 */
function requireAuth(req, res, next) {
  if (!req.user || !req.user.userId) {
    return next(new AppError("Authentication required", 401, "AUTH_REQUIRED"));
  }
  next();
}

module.exports = {
  authenticateToken,
  createAuthenticateToken,
  requireAuth,
  extractBearerToken,
};
