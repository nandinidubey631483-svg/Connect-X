/**
 * ConnectX Distributed Governance & Fencing Enforcement Middleware
 * 
 * Provides:
 * - Transaction Uncertainty Quarantine Barrier (checks Redis uncertainty registry)
 * - Distributed Monotonic Fencing Barrier
 * - Fail-Closed Dependency Gate
 */
const AppError = require("../utils/appError");

/**
 * Middleware checking if an in-flight or previous transaction for the target token/session
 * was marked uncertain due to an ambiguous commit result.
 * 
 * If uncertain, returns HTTP 503 (TOKEN_TRANSACTION_UNCERTAIN) with Retry-After: 5.
 */
function createUncertaintyBarrier({ redisClient = null, tokenHashResolver = null } = {}) {
  return async function checkTransactionUncertainty(req, res, next) {
    if (!redisClient) {
      return next(); // Degraded/standalone mode without Redis
    }

    try {
      const tokenHash = tokenHashResolver ? tokenHashResolver(req) : (req.body && req.body.tokenHash);
      if (!tokenHash) {
        return next();
      }

      const uncertaintyKey = `uncertainty:token:${tokenHash}`;
      const isUncertain = await redisClient.get(uncertaintyKey);

      if (isUncertain) {
        res.setHeader("Retry-After", 5);
        return next(
          new AppError(
            "Authentication token transaction is quarantined due to ambiguous commit. Please re-authenticate.",
            503,
            "TOKEN_TRANSACTION_UNCERTAIN",
            { retryAfter: 5 }
          )
        );
      }

      next();
    } catch (err) {
      // Fail-closed rule: if uncertainty check throws, do not bypass
      return next(new AppError("Distributed governance check failed", 503, "GOVERNANCE_ERROR"));
    }
  };
}

/**
 * Fencing barrier asserting that incoming operation's fencingToken strictly exceeds
 * the target entity's persisted lastFencingToken.
 */
function assertFencingOrder(incomingToken, persistedToken) {
  const inc = Number(incomingToken);
  const per = Number(persistedToken || 0);

  if (isNaN(inc) || inc <= per) {
    throw new AppError(
      `Fencing assertion failed: incoming token (${inc}) is not strictly greater than persisted token (${per})`,
      409,
      "CONCURRENCY_FENCE_ERROR",
      { incomingToken: inc, persistedToken: per }
    );
  }
  return true;
}

/**
 * Fail-closed wrapper for distributed operations: asserts all critical dependencies exist.
 */
function failClosedGate(requiredDependencies = []) {
  return function (req, res, next) {
    for (const dep of requiredDependencies) {
      if (!dep.check()) {
        return next(
          new AppError(
            `Security dependency unavailable: ${dep.name}`,
            503,
            "DEPENDENCY_UNAVAILABLE"
          )
        );
      }
    }
    next();
  };
}

module.exports = {
  createUncertaintyBarrier,
  assertFencingOrder,
  failClosedGate,
};
