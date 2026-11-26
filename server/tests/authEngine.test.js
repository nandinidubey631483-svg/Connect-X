/**
 * ConnectX Module 4: Authentication Controller & Coordination Engine Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const User = require("../models/userModel");
const SessionFamily = require("../models/sessionFamilyModel");
const ActiveRotations = require("../models/activeRotationsModel");
const RefreshSession = require("../models/refreshSessionModel");
const Counter = require("../models/counterModel");

const authController = require("../controllers/authController");
const userController = require("../controllers/userController");
const {
  reconcileOrphanIntent,
  runOrphanSweeper,
  SweeperYieldError,
} = require("../utils/orphanSweeper");
const {
  hashToken,
  generateRefreshToken,
  generateSignedCsrfToken,
} = require("../utils/cryptoUtils");
const { signAccessToken } = require("../utils/jwtUtils");
const {
  REFRESH_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
} = require("../middleware/cookieConfig");
const AppError = require("../utils/appError");
const authV1Routes = require("../routes/authV1");

// Helper to create mock req, res, next
function createMockHttp({ body = {}, headers = {}, cookies = {}, user = null, sessionFamily = null } = {}) {
  const req = {
    body,
    headers,
    cookies: { ...cookies },
    user,
    sessionFamily,
    ip: "127.0.0.1",
    method: "POST",
    path: "/test",
    originalUrl: "/test",
  };

  const res = {
    statusCode: 200,
    headersSent: false,
    headers: {},
    cookies: {},
    clearedCookies: [],
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    cookie(name, val, opts) {
      this.cookies[name] = { val, opts };
      return this;
    },
    clearCookie(name, opts) {
      this.clearedCookies.push({ name, opts });
      delete this.cookies[name];
      return this;
    },
    setHeader(name, val) {
      this.headers[name] = val;
    },
  };

  let nextCalledWith = null;
  const next = (err) => {
    nextCalledWith = err || null;
  };

  return { req, res, next: (err) => next(err), getNextError: () => nextCalledWith };
}

describe("ConnectX Module 4: Authentication Controller & Coordination Engine Tests", () => {
  let origCounterFindOneAndUpdate;
  let testFencingCounter = 10000;

  beforeEach(() => {
    origCounterFindOneAndUpdate = Counter.findOneAndUpdate;
    Counter.findOneAndUpdate = async () => ({
      _id: "auth_fencing_sequence",
      seq: (testFencingCounter += 10000),
    });
  });
  // ---------------------------------------------------------------------------
  // 1. Registration Flow
  // ---------------------------------------------------------------------------
  describe("1. Registration Controller", () => {
    let origFindOne, origCreate;

    beforeEach(() => {
      origFindOne = User.findOne;
      origCreate = User.create;
    });

    test("register succeeds with valid input, hashes password (salt 12), sets cookies, and omits password", async () => {
      User.findOne = async () => null;
      let createdUserDoc = null;
      User.create = async (doc) => {
        createdUserDoc = {
          _id: "65b9e1234567890abcdef123",
          username: doc.username,
          email: doc.email,
          password: doc.password,
          isAvatarImageSet: false,
          avatarImage: "",
        };
        return createdUserDoc;
      };

      const origFamilyCreate = SessionFamily.create;
      const origSessionCreate = RefreshSession.create;
      SessionFamily.create = async (doc) => doc;
      RefreshSession.create = async (doc) => doc;

      try {
        const { req, res, next, getNextError } = createMockHttp({
          body: { username: "alice", email: "alice@connectx.com", password: "Password123!" },
        });

        await authController.register(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.accessToken);
        assert.ok(res.body.csrfToken);
        assert.strictEqual(res.body.user.username, "alice");
        assert.strictEqual(res.body.user.email, "alice@connectx.com");
        assert.strictEqual(res.body.user.password, undefined);

        // Verify password hash is bcrypt salt 12
        assert.ok(createdUserDoc.password.startsWith("$2b$12$") || createdUserDoc.password.startsWith("$2a$12$"));

        // Verify cookies were set
        assert.ok(res.cookies[REFRESH_TOKEN_COOKIE]);
        assert.ok(res.cookies[CSRF_TOKEN_COOKIE]);
      } finally {
        User.findOne = origFindOne;
        User.create = origCreate;
        SessionFamily.create = origFamilyCreate;
        RefreshSession.create = origSessionCreate;
      }
    });

    test("register rejects missing fields with 400 VALIDATION_ERROR", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        body: { username: "alice", email: "" },
      });

      await authController.register(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });

    test("register rejects short password (< 8 chars) with 400 VALIDATION_ERROR", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        body: { username: "alice", email: "alice@test.com", password: "short" },
      });

      await authController.register(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });

    test("register rejects duplicate username with 409 USER_ALREADY_EXISTS", async () => {
      User.findOne = async () => ({ username: "alice", email: "other@test.com" });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          body: { username: "alice", email: "alice@test.com", password: "Password123!" },
        });

        await authController.register(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, "USER_ALREADY_EXISTS");
      } finally {
        User.findOne = origFindOne;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Login Flow & Brute-Force Lockout
  // ---------------------------------------------------------------------------
  describe("2. Login Controller & Account Lockout", () => {
    let origFindOne, origUpdateOne;

    beforeEach(() => {
      origFindOne = User.findOne;
      origUpdateOne = User.updateOne;
    });

    test("login succeeds with valid credentials, sets cookies, and resets failed attempts", async () => {
      const hashedPassword = await bcrypt.hash("Password123!", 10);
      let updatedDoc = null;

      User.findOne = () => ({
        select: async () => ({
          _id: "65b9e1234567890abcdef123",
          username: "alice",
          email: "alice@connectx.com",
          password: hashedPassword,
          failedAttempts: 2,
          lockUntil: null,
          isAvatarImageSet: false,
          avatarImage: "",
        }),
      });

      User.updateOne = async (_query, update) => {
        updatedDoc = update;
        return { modifiedCount: 1 };
      };

      const origFamilyCreate = SessionFamily.create;
      const origSessionCreate = RefreshSession.create;
      SessionFamily.create = async (doc) => doc;
      RefreshSession.create = async (doc) => doc;

      try {
        const { req, res, next, getNextError } = createMockHttp({
          body: { username: "alice", password: "Password123!" },
        });

        await authController.login(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.accessToken);
        assert.ok(res.body.csrfToken);
        assert.strictEqual(res.body.user.username, "alice");
        assert.strictEqual(res.body.user.password, undefined);

        // Assert failedAttempts was reset to 0
        assert.deepStrictEqual(updatedDoc.$set, { failedAttempts: 0, lockUntil: null });

        // Assert cookies set
        assert.ok(res.cookies[REFRESH_TOKEN_COOKIE]);
        assert.ok(res.cookies[CSRF_TOKEN_COOKIE]);
      } finally {
        User.findOne = origFindOne;
        User.updateOne = origUpdateOne;
        SessionFamily.create = origFamilyCreate;
        RefreshSession.create = origSessionCreate;
      }
    });

    test("login rejects unknown user with 401 INVALID_CREDENTIALS", async () => {
      User.findOne = () => ({ select: async () => null });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          body: { username: "unknown", password: "Password123!" },
        });

        await authController.login(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.code, "INVALID_CREDENTIALS");
      } finally {
        User.findOne = origFindOne;
      }
    });

    test("login wrong password increments failedAttempts", async () => {
      const hashedPassword = await bcrypt.hash("CorrectPassword1!", 10);
      let updatedSet = null;

      User.findOne = () => ({
        select: async () => ({
          _id: "65b9e1234567890abcdef123",
          username: "alice",
          password: hashedPassword,
          failedAttempts: 2,
        }),
      });

      User.updateOne = async (_query, update) => {
        updatedSet = update.$set;
        return { modifiedCount: 1 };
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          body: { username: "alice", password: "WrongPassword1!" },
        });

        await authController.login(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(updatedSet.failedAttempts, 3);
        assert.strictEqual(updatedSet.lockUntil, undefined);
      } finally {
        User.findOne = origFindOne;
        User.updateOne = origUpdateOne;
      }
    });

    test("login 5th failed attempt activates 15-minute account lockout", async () => {
      const hashedPassword = await bcrypt.hash("CorrectPassword1!", 10);
      let updatedSet = null;

      User.findOne = () => ({
        select: async () => ({
          _id: "65b9e1234567890abcdef123",
          username: "alice",
          password: hashedPassword,
          failedAttempts: 4,
        }),
      });

      User.updateOne = async (_query, update) => {
        updatedSet = update.$set;
        return { modifiedCount: 1 };
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          body: { username: "alice", password: "WrongPassword1!" },
        });

        await authController.login(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(updatedSet.failedAttempts, 5);
        assert.ok(updatedSet.lockUntil instanceof Date);
        // Assert lockUntil is ~15 minutes in future
        const diffMs = updatedSet.lockUntil.getTime() - Date.now();
        assert.ok(diffMs > 14 * 60 * 1000 && diffMs <= 15 * 60 * 1000);
      } finally {
        User.findOne = origFindOne;
        User.updateOne = origUpdateOne;
      }
    });

    test("login during active lockout returns 423 ACCOUNT_LOCKED without checking password", async () => {
      const futureLock = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes left

      User.findOne = () => ({
        select: async () => ({
          _id: "65b9e1234567890abcdef123",
          username: "alice",
          lockUntil: futureLock,
          failedAttempts: 5,
        }),
      });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          body: { username: "alice", password: "AnyPassword!" },
        });

        await authController.login(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 423);
        assert.strictEqual(err.code, "ACCOUNT_LOCKED");
      } finally {
        User.findOne = origFindOne;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Strict 4-Step Refresh Coordination Engine
  // ---------------------------------------------------------------------------
  describe("3. Refresh Coordination Engine (4-Step Invariant Protocol)", () => {
    let origSessionFindOne, origSessionUpdateOne, origSessionCreate;
    let origFamilyFindOne, origFamilyUpdateOne;
    let origActiveUpsert, origActiveDeleteOne;

    beforeEach(() => {
      origSessionFindOne = RefreshSession.findOne;
      origSessionUpdateOne = RefreshSession.updateOne;
      origSessionCreate = RefreshSession.create;
      origFamilyFindOne = SessionFamily.findOne;
      origFamilyUpdateOne = SessionFamily.updateOne;
      origActiveUpsert = ActiveRotations.findOneAndUpdate;
      origActiveDeleteOne = ActiveRotations.deleteOne;
    });

    test("Step 0: Missing refresh token returns 401 TOKEN_MISSING", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        cookies: {},
        body: {},
      });

      await authController.refresh(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, "TOKEN_MISSING");
    });

    test("Step 0: Invalid / unknown refresh token returns 401 TOKEN_INVALID", async () => {
      RefreshSession.findOne = async () => null;

      try {
        const { req, res, next, getNextError } = createMockHttp({
          cookies: { [REFRESH_TOKEN_COOKIE]: "nonexistent_token_value" },
        });

        await authController.refresh(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.code, "TOKEN_INVALID");
      } finally {
        RefreshSession.findOne = origSessionFindOne;
      }
    });

    test("Step 0: Token reuse detection revokes entire SessionFamily immediately with TOKEN_REUSE_DETECTED", async () => {
      const rawToken = "reused_token_value_abc";
      const tokenHash = hashToken(rawToken);
      let familyUpdate = null;

      RefreshSession.findOne = async () => ({
        tokenHash,
        familyId: "fam_victim_123",
        userId: "user_123",
        isRevoked: true, // Already revoked token presented!
        rotationState: "COMMITTED",
      });

      SessionFamily.updateOne = async (query, update) => {
        familyUpdate = { query, update };
        return { modifiedCount: 1 };
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          cookies: { [REFRESH_TOKEN_COOKIE]: rawToken },
        });

        await authController.refresh(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.code, "TOKEN_REUSE_DETECTED");

        // Assert SessionFamily was revoked
        assert.strictEqual(familyUpdate.query.familyId, "fam_victim_123");
        assert.strictEqual(familyUpdate.update.$set.familyStatus, "REVOKED");
        assert.strictEqual(familyUpdate.update.$set.revocationReason, "TOKEN_REUSE_DETECTED");
        assert.strictEqual(familyUpdate.update.$set.isRevoked, true);

        // Assert cookies were cleared
        assert.ok(res.clearedCookies.some((c) => c.name === REFRESH_TOKEN_COOKIE));
        assert.ok(res.clearedCookies.some((c) => c.name === CSRF_TOKEN_COOKIE));
      } finally {
        RefreshSession.findOne = origSessionFindOne;
        SessionFamily.updateOne = origFamilyUpdateOne;
      }
    });

    test("Step 0: Expired refresh token returns 401 TOKEN_EXPIRED", async () => {
      const rawToken = "expired_token_123";
      RefreshSession.findOne = async () => ({
        tokenHash: hashToken(rawToken),
        familyId: "fam_123",
        userId: "user_123",
        isRevoked: false,
        rotationState: "ACTIVE",
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          cookies: { [REFRESH_TOKEN_COOKIE]: rawToken },
        });

        await authController.refresh(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.code, "TOKEN_EXPIRED");
      } finally {
        RefreshSession.findOne = origSessionFindOne;
      }
    });

    test("Step 0: Revoked session family returns 401 SESSION_REVOKED", async () => {
      const rawToken = "token_with_revoked_family";
      RefreshSession.findOne = async () => ({
        tokenHash: hashToken(rawToken),
        familyId: "fam_revoked",
        userId: "user_123",
        isRevoked: false,
        rotationState: "ACTIVE",
        expiresAt: new Date(Date.now() + 100000),
      });

      SessionFamily.findOne = async () => ({
        familyId: "fam_revoked",
        isRevoked: true,
        familyStatus: "REVOKED",
      });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          cookies: { [REFRESH_TOKEN_COOKIE]: rawToken },
        });

        await authController.refresh(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.code, "SESSION_REVOKED");
      } finally {
        RefreshSession.findOne = origSessionFindOne;
        SessionFamily.findOne = origFamilyFindOne;
      }
    });

    test("Step 0.5: Concurrency race when active rotation already exists returns 409 REFRESH_IN_PROGRESS", async () => {
      const rawToken = "token_racing";
      RefreshSession.findOne = async () => ({
        tokenHash: hashToken(rawToken),
        familyId: "fam_race",
        userId: "user_123",
        isRevoked: false,
        rotationState: "ACTIVE",
        expiresAt: new Date(Date.now() + 100000),
      });

      SessionFamily.findOne = async () => ({
        familyId: "fam_race",
        isRevoked: false,
        familyStatus: "ACTIVE",
      });

      // Simulate findOneAndUpdate returning existing doc
      ActiveRotations.findOneAndUpdate = async () => ({
        _id: "fam_race",
        operationId: "op_concurrent_winner",
      });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          cookies: { [REFRESH_TOKEN_COOKIE]: rawToken },
        });

        await authController.refresh(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, "REFRESH_IN_PROGRESS");
      } finally {
        RefreshSession.findOne = origSessionFindOne;
        SessionFamily.findOne = origFamilyFindOne;
        ActiveRotations.findOneAndUpdate = origActiveUpsert;
      }
    });

    test("Step 1: SessionFamily lock conflict rolls back Step 0.5 intent and returns 409 REFRESH_CONCURRENCY_CONFLICT", async () => {
      const rawToken = "token_step1_conflict";
      RefreshSession.findOne = async () => ({
        tokenHash: hashToken(rawToken),
        familyId: "fam_lock_conflict",
        userId: "user_123",
        isRevoked: false,
        rotationState: "ACTIVE",
        expiresAt: new Date(Date.now() + 100000),
      });

      SessionFamily.findOne = async () => ({
        familyId: "fam_lock_conflict",
        isRevoked: false,
        familyStatus: "ACTIVE",
      });

      // Step 0.5 succeeds (null returned before upsert)
      ActiveRotations.findOneAndUpdate = async () => null;

      let deletedIntent = false;
      ActiveRotations.deleteOne = async () => {
        deletedIntent = true;
        return { deletedCount: 1 };
      };

      // Step 1 fails because family was concurrently locked (matchedCount = 0)
      SessionFamily.updateOne = async () => ({ matchedCount: 0 });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          cookies: { [REFRESH_TOKEN_COOKIE]: rawToken },
        });

        await authController.refresh(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, "REFRESH_CONCURRENCY_CONFLICT");
        assert.strictEqual(deletedIntent, true, "Must cleanly roll back Step 0.5 intent on Step 1 race");
      } finally {
        RefreshSession.findOne = origSessionFindOne;
        SessionFamily.findOne = origFamilyFindOne;
        ActiveRotations.findOneAndUpdate = origActiveUpsert;
        ActiveRotations.deleteOne = origActiveDeleteOne;
        SessionFamily.updateOne = origFamilyUpdateOne;
      }
    });

    test("Step 2 & 3: Full successful rotation commits atomically, updates family to ACTIVE, and issues successor tokens", async () => {
      const rawToken = "token_step23_success";
      const oldHash = hashToken(rawToken);

      RefreshSession.findOne = async () => ({
        tokenHash: oldHash,
        familyId: "fam_happy_path",
        userId: "65b9e1234567890abcdef123",
        isRevoked: false,
        rotationState: "ACTIVE",
        expiresAt: new Date(Date.now() + 100000),
      });

      SessionFamily.findOne = async () => ({
        familyId: "fam_happy_path",
        isRevoked: false,
        familyStatus: "ACTIVE",
      });

      ActiveRotations.findOneAndUpdate = async () => null;

      let familyStep1Locked = false;
      let familyStep3Committed = false;
      SessionFamily.updateOne = async (query, update) => {
        if (update.$set.familyStatus === "ROTATING") {
          familyStep1Locked = true;
          return { matchedCount: 1 };
        }
        if (update.$set.familyStatus === "ACTIVE") {
          familyStep3Committed = true;
          assert.strictEqual(update.$set.activeOperationId, null);
          assert.ok(update.$set.lastFencingToken > 0);
          return { matchedCount: 1 };
        }
        return { matchedCount: 1 };
      };

      let oldSessionCommitted = false;
      RefreshSession.updateOne = async (_query, update) => {
        if (update.$set.rotationState === "COMMITTED") {
          oldSessionCommitted = true;
          assert.strictEqual(update.$set.isRevoked, true);
          assert.ok(update.$set.replacedByTokenHash);
        }
        return { modifiedCount: 1 };
      };

      let successorCreated = false;
      RefreshSession.create = async (docs) => {
        successorCreated = true;
        const doc = Array.isArray(docs) ? docs[0] : docs;
        assert.strictEqual(doc.rotationState, "ACTIVE");
        assert.strictEqual(doc.isRevoked, false);
        return [doc];
      };

      let intentDeleted = false;
      ActiveRotations.deleteOne = async () => {
        intentDeleted = true;
        return { deletedCount: 1 };
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          cookies: { [REFRESH_TOKEN_COOKIE]: rawToken },
        });

        await authController.refresh(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.accessToken);
        assert.ok(res.body.csrfToken);

        assert.strictEqual(familyStep1Locked, true);
        assert.strictEqual(familyStep3Committed, true);
        assert.strictEqual(oldSessionCommitted, true);
        assert.strictEqual(successorCreated, true);
        assert.strictEqual(intentDeleted, true);

        // Verify successor cookies set
        assert.ok(res.cookies[REFRESH_TOKEN_COOKIE]);
        assert.notStrictEqual(res.cookies[REFRESH_TOKEN_COOKIE].val, rawToken);
      } finally {
        RefreshSession.findOne = origSessionFindOne;
        RefreshSession.updateOne = origSessionUpdateOne;
        RefreshSession.create = origSessionCreate;
        SessionFamily.findOne = origFamilyFindOne;
        SessionFamily.updateOne = origFamilyUpdateOne;
        ActiveRotations.findOneAndUpdate = origActiveUpsert;
        ActiveRotations.deleteOne = origActiveDeleteOne;
      }
    });

    test("Step 3: Atomic intent deletion failure (deletedCount !== 1) triggers CONCURRENCY_FENCE_ERROR and rolls back", async () => {
      const rawToken = "token_step3_fence_fail";
      RefreshSession.findOne = async () => ({
        tokenHash: hashToken(rawToken),
        familyId: "fam_fence_fail",
        userId: "65b9e1234567890abcdef123",
        isRevoked: false,
        rotationState: "ACTIVE",
        expiresAt: new Date(Date.now() + 100000),
      });

      SessionFamily.findOne = async () => ({
        familyId: "fam_fence_fail",
        isRevoked: false,
        familyStatus: "ACTIVE",
      });

      ActiveRotations.findOneAndUpdate = async () => null;
      SessionFamily.updateOne = async () => ({ matchedCount: 1 });
      RefreshSession.updateOne = async () => ({ modifiedCount: 1 });
      RefreshSession.create = async () => [];

      // Step 3 delete fails (0 deleted, indicating concurrent deletion)
      ActiveRotations.deleteOne = async () => ({ deletedCount: 0 });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          cookies: { [REFRESH_TOKEN_COOKIE]: rawToken },
        });

        await authController.refresh(req, res, next);
        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, "CONCURRENCY_FENCE_ERROR");
      } finally {
        RefreshSession.findOne = origSessionFindOne;
        RefreshSession.updateOne = origSessionUpdateOne;
        RefreshSession.create = origSessionCreate;
        SessionFamily.findOne = origFamilyFindOne;
        SessionFamily.updateOne = origFamilyUpdateOne;
        ActiveRotations.findOneAndUpdate = origActiveUpsert;
        ActiveRotations.deleteOne = origActiveDeleteOne;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Logout & Logout-All
  // ---------------------------------------------------------------------------
  describe("4. Logout and Logout-All Endpoints", () => {
    let origFamilyUpdateOne, origFamilyUpdateMany, origSessionUpdateOne, origSessionUpdateMany, origActiveDeleteOne;

    beforeEach(() => {
      origFamilyUpdateOne = SessionFamily.updateOne;
      origFamilyUpdateMany = SessionFamily.updateMany;
      origSessionUpdateOne = RefreshSession.updateOne;
      origSessionUpdateMany = RefreshSession.updateMany;
      origActiveDeleteOne = ActiveRotations.deleteOne;
    });

    test("logout revokes target session family and refresh token, deletes intent, and clears cookies", async () => {
      let revokedFamily = null;
      const origSessionFindOne = RefreshSession.findOne;
      RefreshSession.findOne = async () => ({ familyId: "fam_target", tokenHash: "some_hash" });
      SessionFamily.updateOne = async (query, update) => {
        revokedFamily = { query, update };
        return { modifiedCount: 1 };
      };
      RefreshSession.updateOne = async () => ({ modifiedCount: 1 });
      ActiveRotations.deleteOne = async () => ({ deletedCount: 1 });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "user_123", familyId: "fam_target" },
          cookies: { [REFRESH_TOKEN_COOKIE]: "some_token" },
        });

        await authController.logout(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(revokedFamily.query.familyId, "fam_target");
        assert.strictEqual(revokedFamily.update.$set.familyStatus, "REVOKED");
        assert.strictEqual(revokedFamily.update.$set.revocationReason, "LOGOUT");

        // Verify cookies cleared
        assert.ok(res.clearedCookies.some((c) => c.name === REFRESH_TOKEN_COOKIE));
      } finally {
        RefreshSession.findOne = origSessionFindOne;
        SessionFamily.updateOne = origFamilyUpdateOne;
        RefreshSession.updateOne = origSessionUpdateOne;
        ActiveRotations.deleteOne = origActiveDeleteOne;
      }
    });

    test("logoutAll revokes all session families and refresh sessions for authenticated user", async () => {
      let familyUpdateManyDoc = null;
      let sessionUpdateManyDoc = null;

      SessionFamily.updateMany = async (query, update) => {
        familyUpdateManyDoc = { query, update };
        return { modifiedCount: 3 };
      };
      RefreshSession.updateMany = async (query, update) => {
        sessionUpdateManyDoc = { query, update };
        return { modifiedCount: 3 };
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "65b9e1234567890abcdef123" },
        });

        await authController.logoutAll(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);

        assert.strictEqual(familyUpdateManyDoc.query.userId, "65b9e1234567890abcdef123");
        assert.strictEqual(familyUpdateManyDoc.update.$set.familyStatus, "REVOKED");
        assert.strictEqual(familyUpdateManyDoc.update.$set.revocationReason, "LOGOUT_ALL");

        assert.strictEqual(sessionUpdateManyDoc.query.userId, "65b9e1234567890abcdef123");
        assert.strictEqual(sessionUpdateManyDoc.update.$set.revocationReason, "LOGOUT_ALL");

        assert.ok(res.clearedCookies.some((c) => c.name === REFRESH_TOKEN_COOKIE));
      } finally {
        SessionFamily.updateMany = origFamilyUpdateMany;
        RefreshSession.updateMany = origSessionUpdateMany;
      }
    });

    test("logoutAll without authenticated user returns 401 AUTH_REQUIRED", async () => {
      const { req, res, next, getNextError } = createMockHttp({ user: null });

      await authController.logoutAll(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, "AUTH_REQUIRED");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. CSRF-Token & Me Endpoints
  // ---------------------------------------------------------------------------
  describe("5. CSRF-Token & Me Endpoints", () => {
    let origFindById;

    beforeEach(() => {
      origFindById = User.findById;
    });

    test("getCsrfToken issues valid raw token and sets signed cookie", () => {
      const { req, res, next, getNextError } = createMockHttp({});

      authController.getCsrfToken(req, res, next);

      assert.strictEqual(getNextError(), null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(typeof res.body.csrfToken, "string");
      assert.ok(res.cookies[CSRF_TOKEN_COOKIE]);
      assert.ok(res.cookies[CSRF_TOKEN_COOKIE].val.startsWith(`${res.body.csrfToken}.`));
    });

    test("getMe returns user data without password and session family context", async () => {
      User.findById = async () => ({
        _id: "user_me_123",
        username: "alice",
        email: "alice@connectx.com",
        isAvatarImageSet: true,
        avatarImage: "avatar.png",
        createdAt: new Date(),
      });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "user_me_123" },
          sessionFamily: { familyId: "fam_active_me", familyStatus: "ACTIVE" },
        });

        await authController.getMe(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.user.username, "alice");
        assert.strictEqual(res.body.user.password, undefined);
        assert.strictEqual(res.body.sessionFamily.familyId, "fam_active_me");
      } finally {
        User.findById = origFindById;
      }
    });

    test("getMe without req.user returns 401 AUTH_REQUIRED", async () => {
      const { req, res, next, getNextError } = createMockHttp({ user: null });

      await authController.getMe(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, "AUTH_REQUIRED");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Clustered Orphan Sweeper Protocol
  // ---------------------------------------------------------------------------
  describe("6. Clustered Orphan Sweeper Protocol", () => {
    let origActiveFindOne, origActiveDeleteOne, origActiveFind;
    let origFamilyFindOne, origFamilyUpdateOne;

    beforeEach(() => {
      origActiveFindOne = ActiveRotations.findOne;
      origActiveDeleteOne = ActiveRotations.deleteOne;
      origActiveFind = ActiveRotations.find;
      origFamilyFindOne = SessionFamily.findOne;
      origFamilyUpdateOne = SessionFamily.updateOne;
    });

    test("reconcileOrphanIntent reconciles Step 1 ROTATING intent with deletedCount === 1 assertion", async () => {
      const staleDoc = {
        _id: "fam_stale_step1",
        operationId: "op_stale_1",
        fencingToken: 100,
      };

      ActiveRotations.findOne = async () => staleDoc;

      SessionFamily.findOne = async () => ({
        familyId: "fam_stale_step1",
        familyStatus: "ROTATING",
        activeOperationId: "op_stale_1",
      });

      let familyReconciled = null;
      SessionFamily.updateOne = async (query, update) => {
        familyReconciled = { query, update };
        return { matchedCount: 1 };
      };

      let deletedIntent = false;
      ActiveRotations.deleteOne = async () => {
        deletedIntent = true;
        return { deletedCount: 1 };
      };

      try {
        const result = await reconcileOrphanIntent(staleDoc);
        assert.strictEqual(result.reconciled, true);
        assert.strictEqual(result.familyId, "fam_stale_step1");
        assert.strictEqual(familyReconciled.update.$set.familyStatus, "REVOKED");
        assert.strictEqual(familyReconciled.update.$set.revocationReason, "ORPHAN_STEP1_ROTATING_RECONCILED");
        assert.strictEqual(deletedIntent, true);
      } finally {
        ActiveRotations.findOne = origActiveFindOne;
        SessionFamily.findOne = origFamilyFindOne;
        SessionFamily.updateOne = origFamilyUpdateOne;
        ActiveRotations.deleteOne = origActiveDeleteOne;
      }
    });

    test("reconcileOrphanIntent yields SweeperYieldError if intent ownership is lost", async () => {
      const staleDoc = {
        _id: "fam_stale_lost",
        operationId: "op_old",
        fencingToken: 50,
      };

      // Intent was already superseded by newer fencingToken or operationId
      ActiveRotations.findOne = async () => null;

      try {
        await assert.rejects(
          async () => reconcileOrphanIntent(staleDoc),
          (err) => {
            assert.ok(err instanceof SweeperYieldError);
            assert.strictEqual(err.code, "INTENT_OWNERSHIP_LOST");
            return true;
          }
        );
      } finally {
        ActiveRotations.findOne = origActiveFindOne;
      }
    });

    test("reconcileOrphanIntent aborts transaction and yields if deletedCount !== 1", async () => {
      const staleDoc = {
        _id: "fam_stale_race",
        operationId: "op_stale_race",
        fencingToken: 150,
      };

      ActiveRotations.findOne = async () => staleDoc;
      SessionFamily.findOne = async () => ({
        familyId: "fam_stale_race",
        familyStatus: "ROTATING",
        activeOperationId: "op_stale_race",
      });
      SessionFamily.updateOne = async () => ({ matchedCount: 1 });

      // Simulate concurrent worker consuming the intent before sweeper can delete it
      ActiveRotations.deleteOne = async () => ({ deletedCount: 0 });

      try {
        await assert.rejects(
          async () => reconcileOrphanIntent(staleDoc),
          (err) => {
            assert.ok(err instanceof SweeperYieldError);
            assert.strictEqual(err.code, "INTENT_DELETION_FAILED_ROLLBACK_FAMILY");
            return true;
          }
        );
      } finally {
        ActiveRotations.findOne = origActiveFindOne;
        SessionFamily.findOne = origFamilyFindOne;
        SessionFamily.updateOne = origFamilyUpdateOne;
        ActiveRotations.deleteOne = origActiveDeleteOne;
      }
    });

    test("runOrphanSweeper sweeps stale intents and aggregates reconciled vs yielded metrics", async () => {
      const staleDocs = [
        { _id: "fam_1", operationId: "op_1", fencingToken: 1 },
        { _id: "fam_2", operationId: "op_2", fencingToken: 2 },
      ];

      ActiveRotations.find = async () => staleDocs;
      ActiveRotations.findOne = async (query) => {
        if (query._id === "fam_1") return staleDocs[0];
        return null; // fam_2 lost ownership
      };
      SessionFamily.findOne = async () => ({ familyStatus: "ROTATING", activeOperationId: "op_1" });
      SessionFamily.updateOne = async () => ({ matchedCount: 1 });
      ActiveRotations.deleteOne = async () => ({ deletedCount: 1 });

      try {
        const stats = await runOrphanSweeper({ thresholdMs: 1000 });
        assert.strictEqual(stats.scanned, 2);
        assert.strictEqual(stats.reconciled, 1);
        assert.strictEqual(stats.yielded, 1);
        assert.strictEqual(stats.errors, 0);
      } finally {
        ActiveRotations.find = origActiveFind;
        ActiveRotations.findOne = origActiveFindOne;
        SessionFamily.findOne = origFamilyFindOne;
        SessionFamily.updateOne = origFamilyUpdateOne;
        ActiveRotations.deleteOne = origActiveDeleteOne;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Legacy Routes Shielding & Backward Compatibility
  // ---------------------------------------------------------------------------
  describe("7. Legacy Controllers Shielding", () => {
    let origFindOne, origUpdateOne;

    beforeEach(() => {
      origFindOne = User.findOne;
      origUpdateOne = User.updateOne;
    });

    test("legacy login returns { status: true, user } without password and sets secure cookies", async () => {
      const hashedPassword = await bcrypt.hash("Password123!", 10);
      User.findOne = () => ({
        select: async () => ({
          _id: "user_legacy_1",
          username: "bob",
          password: hashedPassword,
          failedAttempts: 0,
          toObject() {
            return { _id: this._id, username: this.username, password: this.password };
          },
        }),
      });

      const origFamilyCreate = SessionFamily.create;
      const origSessionCreate = RefreshSession.create;
      SessionFamily.create = async (doc) => doc;
      RefreshSession.create = async (doc) => doc;

      try {
        const { req, res, next } = createMockHttp({
          body: { username: "bob", password: "Password123!" },
        });

        await userController.login(req, res, next);

        assert.strictEqual(res.body.status, true);
        assert.strictEqual(res.body.user.username, "bob");
        assert.strictEqual(res.body.user.password, undefined);
        assert.ok(res.cookies[REFRESH_TOKEN_COOKIE]);
        assert.ok(res.cookies[CSRF_TOKEN_COOKIE]);
      } finally {
        User.findOne = origFindOne;
        SessionFamily.create = origFamilyCreate;
        RefreshSession.create = origSessionCreate;
      }
    });

    test("legacy register returns { status: true, user } without password and sets secure cookies", async () => {
      User.findOne = async () => null;
      const origCreate = User.create;
      User.create = async (doc) => ({
        _id: "user_legacy_new",
        username: doc.username,
        email: doc.email,
        password: doc.password,
        toObject() {
          return { _id: this._id, username: this.username, email: this.email, password: this.password };
        },
      });

      const origFamilyCreate = SessionFamily.create;
      const origSessionCreate = RefreshSession.create;
      SessionFamily.create = async (doc) => doc;
      RefreshSession.create = async (doc) => doc;

      try {
        const { req, res, next } = createMockHttp({
          body: { username: "charlie", email: "charlie@test.com", password: "Password123!" },
        });

        await userController.register(req, res, next);

        assert.strictEqual(res.body.status, true);
        assert.strictEqual(res.body.user.username, "charlie");
        assert.strictEqual(res.body.user.password, undefined);
        assert.ok(res.cookies[REFRESH_TOKEN_COOKIE]);
        assert.ok(res.cookies[CSRF_TOKEN_COOKIE]);
      } finally {
        User.findOne = origFindOne;
        User.create = origCreate;
        SessionFamily.create = origFamilyCreate;
        RefreshSession.create = origSessionCreate;
      }
    });

    test("legacy logOut clears cookies and revokes active session family", async () => {
      let revokedFamily = null;
      const origUpdateMany = SessionFamily.updateMany;
      SessionFamily.updateMany = async (query, update) => {
        revokedFamily = { query, update };
        return { modifiedCount: 1 };
      };

      try {
        const { req, res, next } = createMockHttp({});
        req.params = { id: "user_legacy_logout" };

        await userController.logOut(req, res, next);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(revokedFamily.query.userId, "user_legacy_logout");
        assert.strictEqual(revokedFamily.update.$set.familyStatus, "REVOKED");
        assert.ok(res.clearedCookies.some((c) => c.name === REFRESH_TOKEN_COOKIE));
      } finally {
        SessionFamily.updateMany = origUpdateMany;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Router Route Definition Structure
  // ---------------------------------------------------------------------------
  describe("8. Router Configuration Structure", () => {
    test("authV1Routes registers all expected v1 endpoints", () => {
      const routes = authV1Routes.stack.map((layer) => ({
        path: layer.route && layer.route.path,
        methods: layer.route && Object.keys(layer.route.methods),
      })).filter((r) => r.path);

      const paths = routes.map((r) => r.path);
      assert.ok(paths.includes("/register"), "Missing /register route");
      assert.ok(paths.includes("/login"), "Missing /login route");
      assert.ok(paths.includes("/refresh"), "Missing /refresh route");
      assert.ok(paths.includes("/logout"), "Missing /logout route");
      assert.ok(paths.includes("/logout-all"), "Missing /logout-all route");
      assert.ok(paths.includes("/csrf-token"), "Missing /csrf-token route");
      assert.ok(paths.includes("/me"), "Missing /me route");
    });
  });
});
