/**
 * ConnectX Dual-Engine Rate Limiter & IP Governance Middleware
 * 
 * Supports:
 * - In-Memory Sliding-Window Engine (Development / Testing)
 * - Distributed Redis Sliding-Window Engine (Production)
 * - Safe IP resolution via Express trusted proxy (req.ip)
 * - Standard IETF RateLimit-* and Retry-After HTTP headers
 */
const AppError = require("../utils/appError");

/**
 * Creates an in-memory sliding-window rate limit store.
 */
function createMemoryStore() {
  const store = new Map();

  return {
    async increment(key, windowMs, maxHits) {
      const now = Date.now();
      const windowStart = now - windowMs;

      let timestamps = store.get(key) || [];
      // Purge entries outside sliding window
      timestamps = timestamps.filter((t) => t > windowStart);

      if (timestamps.length >= maxHits) {
        const oldestTimestamp = timestamps[0];
        const retryAfterMs = oldestTimestamp + windowMs - now;
        const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
        store.set(key, timestamps);
        return {
          allowed: false,
          remaining: 0,
          resetSec: retryAfterSec,
          retryAfterSec,
          total: timestamps.length,
        };
      }

      timestamps.push(now);
      store.set(key, timestamps);

      const oldestTimestamp = timestamps[0];
      const resetSec = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));

      return {
        allowed: true,
        remaining: maxHits - timestamps.length,
        resetSec,
        retryAfterSec: 0,
        total: timestamps.length,
      };
    },
    reset(key = null) {
      if (key) {
        store.delete(key);
      } else {
        store.clear();
      }
    },
  };
}

/**
 * Creates a distributed Redis sliding-window store using atomic Lua script.
 */
function createRedisStore(redisClient) {
  const LUA_SLIDING_WINDOW = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local windowMs = tonumber(ARGV[2])
  local maxHits = tonumber(ARGV[3])
  local clearBefore = now - windowMs

  redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
  local currentHits = redis.call('ZCARD', key)

  if currentHits >= maxHits then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local resetMs = (tonumber(oldest[2]) + windowMs) - now
    local resetSec = math.ceil(resetMs / 1000)
    if resetSec < 1 then resetSec = 1 end
    return {0, 0, resetSec}
  else
    redis.call('ZADD', key, now, now)
    redis.call('EXPIRE', key, math.ceil(windowMs / 1000) * 2)
    local remaining = maxHits - (currentHits + 1)
    return {1, remaining, math.ceil(windowMs / 1000)}
  end
  `;

  return {
    async increment(key, windowMs, maxHits) {
      const now = Date.now();
      const res = await redisClient.eval(LUA_SLIDING_WINDOW, 1, key, now, windowMs, maxHits);
      const allowed = res[0] === 1;
      const remaining = res[1];
      const resetSec = res[2];
      return {
        allowed,
        remaining,
        resetSec,
        retryAfterSec: allowed ? 0 : resetSec,
        total: maxHits - remaining,
      };
    },
  };
}

/**
 * Safely extracts client IP respecting Express trust proxy settings.
 */
function getClientIp(req) {
  if (req.ip) return req.ip;
  if (req.connection && req.connection.remoteAddress) return req.connection.remoteAddress;
  return "127.0.0.1";
}

/**
 * Rate Limiter Factory
 */
function createRateLimiter({
  windowMs,
  max,
  keyPrefix = "rl",
  keyGenerator = null,
  message = "Too many requests. Please try again later.",
  redisClient = null,
  customStore = null,
} = {}) {
  const store = customStore || (redisClient ? createRedisStore(redisClient) : createMemoryStore());

  const defaultKeyGen = (req) => `${keyPrefix}:${getClientIp(req)}`;
  const resolveKey = keyGenerator || defaultKeyGen;

  const middleware = async (req, res, next) => {
    try {
      const key = resolveKey(req);
      const result = await store.increment(key, windowMs, max);

      res.setHeader("RateLimit-Limit", max);
      res.setHeader("RateLimit-Remaining", result.remaining);
      res.setHeader("RateLimit-Reset", result.resetSec);

      if (!result.allowed) {
        res.setHeader("Retry-After", result.retryAfterSec);
        return next(
          new AppError(message, 429, "RATE_LIMIT_EXCEEDED", {
            retryAfter: result.retryAfterSec,
          })
        );
      }

      next();
    } catch (err) {
      // In fail-closed distributed governance: if rate limiter fails in production, fail closed
      next(err);
    }
  };

  // Expose store for test resets
  middleware.store = store;
  return middleware;
}

// -----------------------------------------------------------------------------
// Governance Matrix Pre-Configured Rate Limiters
// -----------------------------------------------------------------------------

// 1. Login: 5 attempts per 15 minutes by IP + Username
const authLoginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: "auth:login",
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const identifier = (req.body && (req.body.username || req.body.email)) || "anonymous";
    return `auth:login:${ip}:${identifier.toLowerCase()}`;
  },
  message: "Too many authentication attempts. Please try again after 15 minutes.",
});

// 2. Register: 3 accounts per hour by Client IP
const authRegisterRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyPrefix: "auth:register",
  keyGenerator: (req) => `auth:register:${getClientIp(req)}`,
  message: "Too many registration attempts from this address. Please try again after 1 hour.",
});

// 3. Refresh: 10 requests per minute by IP + Family ID
const authRefreshRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: "auth:refresh",
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const familyId = (req.body && req.body.familyId) || "no_family";
    return `auth:refresh:${ip}:${familyId}`;
  },
  message: "Refresh request rate limit reached. Please wait before refreshing tokens.",
});

// 4. CSRF Token Request: 30 requests per minute by Client IP
const csrfTokenRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "auth:csrf",
  keyGenerator: (req) => `auth:csrf:${getClientIp(req)}`,
  message: "Too many CSRF token requests. Please try again later.",
});

module.exports = {
  createRateLimiter,
  createMemoryStore,
  createRedisStore,
  getClientIp,
  authLoginRateLimiter,
  authRegisterRateLimiter,
  authRefreshRateLimiter,
  csrfTokenRateLimiter,
};
