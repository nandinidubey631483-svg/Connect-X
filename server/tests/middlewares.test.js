/**
 * ConnectX Module 3: Security Middlewares & Distributed Governance Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");

const {
  getCookieOptions,
  parseCookies,
  cookieMiddleware,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
  DEFAULT_AUTH_PATH,
} = require("../middleware/cookieConfig");

const {
  validateOrigin,
  extractSafeOrigin,
} = require("../middleware/validateOrigin");

const {
  csrfProtection,
  createCsrfProtection,
} = require("../middleware/csrfMiddleware");

const {
  createRateLimiter,
  createMemoryStore,
  getClientIp,
  authLoginRateLimiter,
} = require("../middleware/rateLimiter");

const {
  authenticateToken,
  createAuthenticateToken,
  requireAuth,
  extractBearerToken,
} = require("../middleware/authMiddleware");

const {
  createUncertaintyBarrier,
  assertFencingOrder,
  failClosedGate,
} = require("../middleware/governanceMiddleware");

const { signAccessToken } = require("../utils/jwtUtils");
const { generateSignedCsrfToken } = require("../utils/cryptoUtils");
const AppError = require("../utils/appError");

const TEST_SECRET = "test_super_secret_key_at_least_32_characters_long_123456789";
const TEST_CSRF_SECRET = "test_csrf_secret_key_at_least_32_characters_long_987654321";

describe("ConnectX Module 3: Security Middlewares & Distributed Governance", () => {
  // ---------------------------------------------------------------------------
  // 1. Production Cookie Topology Handler
  // ---------------------------------------------------------------------------
  describe("1. Production Cookie Topology Handler", () => {
    test("same-origin topology configures Strict, scoped path, and development/production flags", () => {
      const devOpts = getCookieOptions({ topology: "same-origin", isProduction: false });
      assert.strictEqual(devOpts.sameSite, "Strict");
      assert.strictEqual(devOpts.secure, false);
      assert.strictEqual(devOpts.httpOnly, true);
      assert.strictEqual(devOpts.path, DEFAULT_AUTH_PATH);

      const prodOpts = getCookieOptions({ topology: "same-origin", isProduction: true });
      assert.strictEqual(prodOpts.sameSite, "Strict");
      assert.strictEqual(prodOpts.secure, true);
      assert.strictEqual(prodOpts.httpOnly, true);
    });

    test("same-site topology configures Lax and custom domain", () => {
      const opts = getCookieOptions({
        topology: "same-site",
        isProduction: true,
        domain: ".connectx.com",
      });
      assert.strictEqual(opts.sameSite, "Lax");
      assert.strictEqual(opts.secure, true);
      assert.strictEqual(opts.domain, ".connectx.com");
      assert.strictEqual(opts.httpOnly, true);
    });

    test("cross-site topology configures None, mandatory Secure, and Partitioned attributes", () => {
      const opts = getCookieOptions({ topology: "cross-site", isProduction: false });
      assert.strictEqual(opts.sameSite, "None");
      assert.strictEqual(opts.secure, true); // Mandatory true for SameSite: None
      assert.strictEqual(opts.partitioned, true);
      assert.strictEqual(opts.httpOnly, true);
    });

    test("parseCookies safely handles valid, quoted, URI-encoded, and malformed cookies", () => {
      const header = 'connectx_rt="token_123"; connectx_csrf=token_456%2Esignature; empty=; invalid';
      const parsed = parseCookies(header);

      assert.strictEqual(parsed.connectx_rt, "token_123");
      assert.strictEqual(parsed.connectx_csrf, "token_456.signature");
      assert.strictEqual(parsed.empty, "");

      // Malformed / null inputs never throw
      assert.deepStrictEqual(parseCookies(null), {});
      assert.deepStrictEqual(parseCookies(""), {});
      assert.deepStrictEqual(parseCookies(undefined), {});
    });

    test("cookieMiddleware populates req.cookies from req.headers.cookie", () => {
      const req = { headers: { cookie: "connectx_rt=abc123xyz" } };
      const res = {};
      let nextCalled = false;

      cookieMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.cookies.connectx_rt, "abc123xyz");
    });

    test("setAuthCookies and clearAuthCookies set and clear expected cookie names with options", () => {
      const cookiesSet = {};
      const cookiesCleared = {};

      const mockRes = {
        cookie(name, val, opts) {
          cookiesSet[name] = { val, opts };
        },
        clearCookie(name, opts) {
          cookiesCleared[name] = opts;
        },
      };

      setAuthCookies(mockRes, {
        refreshToken: "rt_token_abc",
        csrfSignedCookie: "csrf_raw.sig",
        topology: "same-origin",
      });

      assert.strictEqual(cookiesSet[REFRESH_TOKEN_COOKIE].val, "rt_token_abc");
      assert.strictEqual(cookiesSet[REFRESH_TOKEN_COOKIE].opts.path, DEFAULT_AUTH_PATH);
      assert.strictEqual(cookiesSet[CSRF_TOKEN_COOKIE].val, "csrf_raw.sig");
      assert.strictEqual(cookiesSet[CSRF_TOKEN_COOKIE].opts.path, "/");

      clearAuthCookies(mockRes, { topology: "same-origin" });
      assert.ok(cookiesCleared[REFRESH_TOKEN_COOKIE]);
      assert.ok(cookiesCleared[CSRF_TOKEN_COOKIE]);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Safe Origin & Referer Validation Middleware
  // ---------------------------------------------------------------------------
  describe("2. Safe Origin & Referer Validation", () => {
    test("extractSafeOrigin extracts normalized origin from valid URL strings", () => {
      assert.strictEqual(extractSafeOrigin("http://localhost:3000/chat"), "http://localhost:3000");
      assert.strictEqual(extractSafeOrigin("https://app.connectx.com/auth?query=1"), "https://app.connectx.com");
      assert.strictEqual(extractSafeOrigin("http://127.0.0.1:5000"), "http://127.0.0.1:5000");
    });

    test("extractSafeOrigin safely returns null on malformed, null, or javascript URIs without throwing", () => {
      assert.strictEqual(extractSafeOrigin(null), null);
      assert.strictEqual(extractSafeOrigin(""), null);
      assert.strictEqual(extractSafeOrigin("null"), null);
      assert.strictEqual(extractSafeOrigin("javascript:alert(1)"), null);
      assert.strictEqual(extractSafeOrigin("file:///C:/passwords.txt"), null);
      assert.strictEqual(extractSafeOrigin("not-a-valid-url"), null);
    });

    test("validateOrigin allows safe read-only methods (GET, HEAD, OPTIONS) without origin check", () => {
      const safeMethods = ["GET", "HEAD", "OPTIONS"];
      for (const method of safeMethods) {
        const req = { method, headers: {} };
        let nextErr = null;
        validateOrigin(req, {}, (err) => {
          nextErr = err;
        });
        assert.strictEqual(nextErr, undefined);
      }
    });

    test("validateOrigin rejects mutating methods with unlisted origin in development", () => {
      const req = {
        method: "POST",
        headers: { origin: "https://malicious-attacker.com" },
      };
      let capturedErr = null;
      validateOrigin(req, {}, (err) => {
        capturedErr = err;
      });

      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 403);
      assert.strictEqual(capturedErr.code, "CORS_POLICY_VIOLATION");
    });

    test("validateOrigin permits mutating request with whitelisted origin (http://localhost:3000)", () => {
      const req = {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      };
      let nextCalled = false;
      validateOrigin(req, {}, (err) => {
        assert.strictEqual(err, undefined);
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true);
    });

    test("validateOrigin falls back to Referer header when Origin header is absent", () => {
      const req = {
        method: "POST",
        headers: { referer: "http://localhost:3000/login" },
      };
      let nextCalled = false;
      validateOrigin(req, {}, (err) => {
        assert.strictEqual(err, undefined);
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Signed Double-Submit CSRF Middleware
  // ---------------------------------------------------------------------------
  describe("3. Signed Double-Submit CSRF Middleware", () => {
    test("csrfProtection bypasses safe read-only methods", () => {
      const req = { method: "GET", headers: {} };
      let nextCalled = false;
      csrfProtection(req, {}, (err) => {
        assert.strictEqual(err, undefined);
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true);
    });

    test("csrfProtection permits configured exempt routes without CSRF headers", () => {
      const customCsrf = createCsrfProtection({
        exemptPaths: ["/api/v1/auth/login", "/api/v1/auth/register"],
        secretOverride: TEST_CSRF_SECRET,
      });

      const req = {
        method: "POST",
        path: "/api/v1/auth/login",
        headers: {},
      };
      let nextCalled = false;
      customCsrf(req, {}, (err) => {
        assert.strictEqual(err, undefined);
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true);
    });

    test("csrfProtection rejects mutating request missing X-CSRF-Token header with 403 CSRF_MISSING", () => {
      const customCsrf = createCsrfProtection({ secretOverride: TEST_CSRF_SECRET });
      const req = {
        method: "POST",
        path: "/api/v1/auth/logout",
        headers: { cookie: "connectx_csrf=valid.token" },
        cookies: { connectx_csrf: "valid.token" },
      };
      let capturedErr = null;
      customCsrf(req, {}, (err) => {
        capturedErr = err;
      });

      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 403);
      assert.strictEqual(capturedErr.code, "CSRF_MISSING");
    });

    test("csrfProtection rejects mutating request missing connectx_csrf cookie with 403 CSRF_MISSING", () => {
      const customCsrf = createCsrfProtection({ secretOverride: TEST_CSRF_SECRET });
      const req = {
        method: "POST",
        path: "/api/v1/auth/logout",
        headers: { "x-csrf-token": "some_token" },
        cookies: {},
      };
      let capturedErr = null;
      customCsrf(req, {}, (err) => {
        capturedErr = err;
      });

      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 403);
      assert.strictEqual(capturedErr.code, "CSRF_MISSING");
    });

    test("csrfProtection rejects forged or tampered cookie signature with 403 CSRF_SIGNATURE_INVALID", () => {
      const customCsrf = createCsrfProtection({ secretOverride: TEST_CSRF_SECRET });
      const { csrfToken } = generateSignedCsrfToken(TEST_CSRF_SECRET);
      // Forged signature
      const forgedCookie = `${csrfToken}.0000000000000000000000000000000000000000000000000000000000000000`;

      const req = {
        method: "POST",
        path: "/api/v1/messages",
        headers: { "x-csrf-token": csrfToken },
        cookies: { connectx_csrf: forgedCookie },
      };
      let capturedErr = null;
      customCsrf(req, {}, (err) => {
        capturedErr = err;
      });

      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 403);
      assert.strictEqual(capturedErr.code, "CSRF_SIGNATURE_INVALID");
    });

    test("csrfProtection rejects mismatched header token vs valid cookie with 403 CSRF_MISMATCH", () => {
      const customCsrf = createCsrfProtection({ secretOverride: TEST_CSRF_SECRET });
      const pair1 = generateSignedCsrfToken(TEST_CSRF_SECRET);
      const pair2 = generateSignedCsrfToken(TEST_CSRF_SECRET);

      const req = {
        method: "POST",
        path: "/api/v1/messages",
        headers: { "x-csrf-token": pair1.csrfToken }, // Token from pair 1
        cookies: { connectx_csrf: pair2.signedCookieValue }, // Cookie from pair 2
      };
      let capturedErr = null;
      customCsrf(req, {}, (err) => {
        capturedErr = err;
      });

      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 403);
      assert.strictEqual(capturedErr.code, "CSRF_MISMATCH");
    });

    test("csrfProtection allows valid matching CSRF token and signed cookie", () => {
      const customCsrf = createCsrfProtection({ secretOverride: TEST_CSRF_SECRET });
      const { csrfToken, signedCookieValue } = generateSignedCsrfToken(TEST_CSRF_SECRET);

      const req = {
        method: "POST",
        path: "/api/v1/messages",
        headers: { "x-csrf-token": csrfToken },
        cookies: { connectx_csrf: signedCookieValue },
      };
      let nextCalled = false;
      customCsrf(req, {}, (err) => {
        assert.strictEqual(err, undefined);
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Rate Limiting & Proxy IP Governance
  // ---------------------------------------------------------------------------
  describe("4. Rate Limiting & Proxy IP Governance", () => {
    test("getClientIp extracts req.ip from trusted proxy, falls back to remoteAddress", () => {
      assert.strictEqual(getClientIp({ ip: "198.51.100.1" }), "198.51.100.1");
      assert.strictEqual(
        getClientIp({ connection: { remoteAddress: "203.0.113.5" } }),
        "203.0.113.5"
      );
      assert.strictEqual(getClientIp({}), "127.0.0.1");
    });

    test("in-memory sliding window rate limiter permits hits under max and enforces RateLimit headers", async () => {
      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 3,
        keyPrefix: "test:rl",
      });

      const headers = {};
      const mockRes = {
        setHeader(name, val) {
          headers[name] = val;
        },
      };

      const req = { ip: "10.0.0.1" };

      // Hit 1
      let err1 = null;
      await limiter(req, mockRes, (err) => { err1 = err; });
      assert.strictEqual(err1, undefined);
      assert.strictEqual(headers["RateLimit-Remaining"], 2);

      // Hit 2
      let err2 = null;
      await limiter(req, mockRes, (err) => { err2 = err; });
      assert.strictEqual(err2, undefined);
      assert.strictEqual(headers["RateLimit-Remaining"], 1);

      // Hit 3
      let err3 = null;
      await limiter(req, mockRes, (err) => { err3 = err; });
      assert.strictEqual(err3, undefined);
      assert.strictEqual(headers["RateLimit-Remaining"], 0);

      // Hit 4: Exceeds limit -> HTTP 429 RATE_LIMIT_EXCEEDED
      let err4 = null;
      await limiter(req, mockRes, (err) => { err4 = err; });
      assert.ok(err4 instanceof AppError);
      assert.strictEqual(err4.statusCode, 429);
      assert.strictEqual(err4.code, "RATE_LIMIT_EXCEEDED");
      assert.ok(headers["Retry-After"] >= 1);
    });

    test("authLoginRateLimiter partitions limits by IP and lowercase Username", async () => {
      const limiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 2,
        keyGenerator: (req) => `test:login:${req.ip}:${req.body.username.toLowerCase()}`,
      });

      const mockRes = { setHeader() {} };

      // User Alice from IP 1.2.3.4
      const reqAlice = { ip: "1.2.3.4", body: { username: "Alice" } };
      await limiter(reqAlice, mockRes, () => {});
      await limiter(reqAlice, mockRes, () => {});

      // 3rd attempt for Alice is blocked
      let aliceBlockedErr = null;
      await limiter(reqAlice, mockRes, (err) => { aliceBlockedErr = err; });
      assert.strictEqual(aliceBlockedErr.statusCode, 429);

      // User Bob from IP 1.2.3.4 is NOT blocked (distinct partitioned key)
      const reqBob = { ip: "1.2.3.4", body: { username: "Bob" } };
      let bobErr = null;
      await limiter(reqBob, mockRes, (err) => { bobErr = err; });
      assert.strictEqual(bobErr, undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Authentication & Authorization Middleware
  // ---------------------------------------------------------------------------
  describe("5. Authentication & Authorization Middleware", () => {
    test("extractBearerToken correctly parses Authorization header", () => {
      assert.strictEqual(extractBearerToken({ headers: { authorization: "Bearer my_token_123" } }), "my_token_123");
      assert.strictEqual(extractBearerToken({ headers: { authorization: "bearer   spaced_token " } }), "spaced_token");
      assert.strictEqual(extractBearerToken({ headers: { authorization: "Basic dXNlcjpwYXNz" } }), null);
      assert.strictEqual(extractBearerToken({ headers: {} }), null);
    });

    test("authenticateToken rejects request missing Authorization header with 401 TOKEN_MISSING", async () => {
      const middleware = createAuthenticateToken({ secretOverride: TEST_SECRET });
      const req = { headers: {} };
      let capturedErr = null;

      await middleware(req, {}, (err) => { capturedErr = err; });
      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 401);
      assert.strictEqual(capturedErr.code, "TOKEN_MISSING");
    });

    test("authenticateToken rejects invalid / tampered JWT with 401 TOKEN_INVALID", async () => {
      const middleware = createAuthenticateToken({ secretOverride: TEST_SECRET });
      const req = { headers: { authorization: "Bearer invalid.jwt.signature" } };
      let capturedErr = null;

      await middleware(req, {}, (err) => { capturedErr = err; });
      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 401);
      assert.strictEqual(capturedErr.code, "TOKEN_INVALID");
    });

    test("authenticateToken binds req.user and verifies active SessionFamily", async () => {
      const token = signAccessToken({
        userId: "user_active_123",
        familyId: "fam_active_456",
        secretOverride: TEST_SECRET,
      });

      const mockFamily = {
        familyId: "fam_active_456",
        userId: "user_active_123",
        familyStatus: "ACTIVE",
        isRevoked: false,
      };

      const mockFamilyModel = {
        async findOne({ familyId }) {
          if (familyId === "fam_active_456") return mockFamily;
          return null;
        },
      };

      const middleware = createAuthenticateToken({
        sessionFamilyModel: mockFamilyModel,
        secretOverride: TEST_SECRET,
      });

      const req = { headers: { authorization: `Bearer ${token}` } };
      let nextCalled = false;

      await middleware(req, {}, (err) => {
        assert.strictEqual(err, undefined);
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.user.userId, "user_active_123");
      assert.strictEqual(req.user.familyId, "fam_active_456");
      assert.strictEqual(req.sessionFamily, mockFamily);
    });

    test("authenticateToken fails closed if SessionFamily is missing (401 SESSION_INVALID)", async () => {
      const token = signAccessToken({
        userId: "user_missing",
        familyId: "fam_missing",
        secretOverride: TEST_SECRET,
      });

      const mockFamilyModel = {
        async findOne() { return null; },
      };

      const middleware = createAuthenticateToken({
        sessionFamilyModel: mockFamilyModel,
        secretOverride: TEST_SECRET,
      });

      const req = { headers: { authorization: `Bearer ${token}` } };
      let capturedErr = null;

      await middleware(req, {}, (err) => { capturedErr = err; });
      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 401);
      assert.strictEqual(capturedErr.code, "SESSION_INVALID");
    });

    test("authenticateToken fails closed if SessionFamily is revoked (401 SESSION_REVOKED)", async () => {
      const token = signAccessToken({
        userId: "user_revoked",
        familyId: "fam_revoked",
        secretOverride: TEST_SECRET,
      });

      const mockFamilyModel = {
        async findOne() {
          return {
            familyId: "fam_revoked",
            isRevoked: true,
            revocationReason: "LOGOUT",
          };
        },
      };

      const middleware = createAuthenticateToken({
        sessionFamilyModel: mockFamilyModel,
        secretOverride: TEST_SECRET,
      });

      const req = { headers: { authorization: `Bearer ${token}` } };
      let capturedErr = null;

      await middleware(req, {}, (err) => { capturedErr = err; });
      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 401);
      assert.strictEqual(capturedErr.code, "SESSION_REVOKED");
    });

    test("authenticateToken fails closed if SessionFamily is quarantined (401 FAMILY_QUARANTINED)", async () => {
      const token = signAccessToken({
        userId: "user_quarantined",
        familyId: "fam_quarantined",
        secretOverride: TEST_SECRET,
      });

      const mockFamilyModel = {
        async findOne() {
          return {
            familyId: "fam_quarantined",
            familyStatus: "QUARANTINED",
            isRevoked: false,
          };
        },
      };

      const middleware = createAuthenticateToken({
        sessionFamilyModel: mockFamilyModel,
        secretOverride: TEST_SECRET,
      });

      const req = { headers: { authorization: `Bearer ${token}` } };
      let capturedErr = null;

      await middleware(req, {}, (err) => { capturedErr = err; });
      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 401);
      assert.strictEqual(capturedErr.code, "FAMILY_QUARANTINED");
    });

    test("requireAuth permits request with valid req.user, rejects unauthenticated request", () => {
      let nextCalled = false;
      requireAuth({ user: { userId: "123" } }, {}, (err) => {
        assert.strictEqual(err, undefined);
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true);

      let capturedErr = null;
      requireAuth({}, {}, (err) => { capturedErr = err; });
      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 401);
      assert.strictEqual(capturedErr.code, "AUTH_REQUIRED");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Distributed Governance & Fencing Enforcement
  // ---------------------------------------------------------------------------
  describe("6. Distributed Governance & Fencing Enforcement", () => {
    test("checkTransactionUncertainty blocks request with 503 when token is quarantined in Redis", async () => {
      const mockRedis = {
        async get(key) {
          if (key === "uncertainty:token:hash_ambiguous_123") {
            return "worker_1:UNCERTAIN";
          }
          return null;
        },
      };

      const uncertaintyBarrier = createUncertaintyBarrier({ redisClient: mockRedis });

      const headers = {};
      const mockRes = {
        setHeader(name, val) {
          headers[name] = val;
        },
      };

      const req = { body: { tokenHash: "hash_ambiguous_123" } };
      let capturedErr = null;

      await uncertaintyBarrier(req, mockRes, (err) => {
        capturedErr = err;
      });

      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 503);
      assert.strictEqual(capturedErr.code, "TOKEN_TRANSACTION_UNCERTAIN");
      assert.strictEqual(headers["Retry-After"], 5);
    });

    test("checkTransactionUncertainty allows request when token is NOT in uncertainty registry", async () => {
      const mockRedis = {
        async get() { return null; },
      };

      const uncertaintyBarrier = createUncertaintyBarrier({ redisClient: mockRedis });
      const req = { body: { tokenHash: "hash_clean_456" } };
      let nextCalled = false;

      await uncertaintyBarrier(req, {}, (err) => {
        assert.strictEqual(err, undefined);
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    test("assertFencingOrder permits strictly higher tokens, rejects lower or equal tokens", () => {
      // Monotonic progression: 10 > 5 -> permitted
      assert.strictEqual(assertFencingOrder(10, 5), true);
      assert.strictEqual(assertFencingOrder(1, 0), true);

      // Stale / replay attempts: 5 <= 10 -> rejected with CONCURRENCY_FENCE_ERROR
      assert.throws(
        () => assertFencingOrder(5, 10),
        (err) => {
          assert.strictEqual(err.statusCode, 409);
          assert.strictEqual(err.code, "CONCURRENCY_FENCE_ERROR");
          return true;
        }
      );

      // Duplicate attempt: 10 <= 10 -> rejected
      assert.throws(
        () => assertFencingOrder(10, 10),
        (err) => {
          assert.strictEqual(err.statusCode, 409);
          assert.strictEqual(err.code, "CONCURRENCY_FENCE_ERROR");
          return true;
        }
      );
    });

    test("failClosedGate denies request with 503 if a critical dependency check fails", () => {
      const healthyGate = failClosedGate([{ name: "mongo", check: () => true }]);
      let healthyPassed = false;
      healthyGate({}, {}, (err) => {
        assert.strictEqual(err, undefined);
        healthyPassed = true;
      });
      assert.strictEqual(healthyPassed, true);

      const unhealthyGate = failClosedGate([
        { name: "mongo", check: () => true },
        { name: "redis", check: () => false },
      ]);
      let capturedErr = null;
      unhealthyGate({}, {}, (err) => {
        capturedErr = err;
      });

      assert.ok(capturedErr instanceof AppError);
      assert.strictEqual(capturedErr.statusCode, 503);
      assert.strictEqual(capturedErr.code, "DEPENDENCY_UNAVAILABLE");
    });
  });
});
