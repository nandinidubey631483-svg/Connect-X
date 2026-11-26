/**
 * ConnectX Phase 4 Module 8: Comprehensive End-to-End System Audit Tests
 * Uses CommonJS syntax with Node.js native test runner (node:test and node:assert)
 */
const { test, describe, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcrypt");

const User = require("../models/userModel");
const SessionFamily = require("../models/sessionFamilyModel");
const ActiveRotations = require("../models/activeRotationsModel");
const RefreshSession = require("../models/refreshSessionModel");
const Counter = require("../models/counterModel");

const {
  hashToken,
} = require("../utils/cryptoUtils");
const { signAccessToken } = require("../utils/jwtUtils");
const {
  REFRESH_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
} = require("../middleware/cookieConfig");
const {
  createAuthenticateToken,
} = require("../middleware/authMiddleware");
const authController = require("../controllers/authController");
const { createSocketAuthMiddleware } = require("../realtime/socketAuthMiddleware");
const AppError = require("../utils/appError");

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
      return this;
    },
  };

  let nextCalledWith = null;
  const next = (err) => {
    nextCalledWith = err;
  };

  return { req, res, next, getNextError: () => nextCalledWith };
}

describe("ConnectX Phase 4 End-to-End System Audit & Invariant Suite", () => {
  let origCounterFindOneAndUpdate;
  let testFencingCounter = 20000;

  before(() => {
    process.env.JWT_ACCESS_SECRET = "audit_super_secret_jwt_access_key_1234567890123456";
    process.env.CSRF_SECRET = "audit_super_secret_csrf_hmac_key_123456789012345678";
    process.env.NODE_ENV = "test";
  });

  beforeEach(() => {
    origCounterFindOneAndUpdate = Counter.findOneAndUpdate;
    Counter.findOneAndUpdate = async () => ({
      _id: "auth_fencing_sequence",
      seq: (testFencingCounter += 10000),
    });
  });

  afterEach(() => {
    if (origCounterFindOneAndUpdate) {
      Counter.findOneAndUpdate = origCounterFindOneAndUpdate;
    }
  });

  test("E2E Invariant 1: Complete User Lifecycle (Register -> Authenticated Call -> Refresh Rotation -> Socket Handshake -> Logout)", async () => {
    const rawToken = "token_lifecycle_seed";
    const tokenHash = hashToken(rawToken);

    const origUserFind = User.findOne;
    const origUserCreate = User.create;
    const origFamilyCreate = SessionFamily.create;
    const origFamilyFind = SessionFamily.findOne;
    const origFamilyUpdate = SessionFamily.updateOne;
    const origSessionCreate = RefreshSession.create;
    const origSessionFind = RefreshSession.findOne;
    const origSessionUpdate = RefreshSession.updateOne;
    const origActiveUpsert = ActiveRotations.findOneAndUpdate;
    const origActiveDelete = ActiveRotations.deleteOne;

    let familyRevoked = false;

    try {
      // 1. Register Mocking
      User.findOne = async () => null;
      User.create = async (doc) => ({
        _id: "65b9e1234567890abcdef123",
        username: doc.username,
        email: doc.email,
        password: doc.password,
        failedAttempts: 0,
      });

      SessionFamily.create = async (doc) => doc;
      RefreshSession.create = async (docs) => (Array.isArray(docs) ? docs : [docs]);

      const { req: regReq, res: regRes, next: regNext, getNextError: regErr } = createMockHttp({
        body: { username: "alice_audit", email: "alice@audit.com", password: "Password123!" },
      });

      await authController.register(regReq, regRes, regNext);

      assert.strictEqual(regErr(), null);
      assert.strictEqual(regRes.statusCode, 201);
      assert.ok(regRes.body.accessToken);
      assert.ok(regRes.body.csrfToken);
      assert.ok(regRes.cookies[REFRESH_TOKEN_COOKIE]);

      const initialAccessToken = regRes.body.accessToken;

      // 2. Authenticated Call
      const mockSessionFamilyModel = {
        findOne: async () => ({
          familyId: "fam_lifecycle",
          userId: "65b9e1234567890abcdef123",
          familyStatus: "ACTIVE",
          isRevoked: false,
        }),
      };

      const authenticateToken = createAuthenticateToken({ sessionFamilyModel: mockSessionFamilyModel });
      const meReq = {
        headers: {
          authorization: `Bearer ${initialAccessToken}`,
        },
      };

      let authPassed = false;
      await authenticateToken(meReq, {}, (err) => {
        if (!err) authPassed = true;
      });
      assert.ok(authPassed);
      assert.ok(meReq.user.userId);

      // 3. Refresh Rotation
      RefreshSession.findOne = async () => ({
        tokenHash,
        familyId: "fam_lifecycle",
        userId: "65b9e1234567890abcdef123",
        isRevoked: false,
        rotationState: "ACTIVE",
        expiresAt: new Date(Date.now() + 100000),
      });

      SessionFamily.findOne = async () => ({
        familyId: "fam_lifecycle",
        userId: "65b9e1234567890abcdef123",
        isRevoked: familyRevoked,
        familyStatus: familyRevoked ? "REVOKED" : "ACTIVE",
      });

      ActiveRotations.findOneAndUpdate = async () => null;
      ActiveRotations.deleteOne = async () => ({ deletedCount: 1 });
      SessionFamily.updateOne = async () => ({ matchedCount: 1 });
      RefreshSession.updateOne = async () => ({ modifiedCount: 1 });

      const { req: refReq, res: refRes, next: refNext, getNextError: refErr } = createMockHttp({
        cookies: { [REFRESH_TOKEN_COOKIE]: rawToken },
      });

      await authController.refresh(refReq, refRes, refNext);

      assert.strictEqual(refErr(), null);
      assert.strictEqual(refRes.statusCode, 200);
      assert.ok(refRes.body.accessToken);
      assert.ok(refRes.cookies[REFRESH_TOKEN_COOKIE]);

      const successorAccessToken = refRes.body.accessToken;

      // 4. Socket Handshake
      const socket = {
        handshake: {
          headers: { authorization: `Bearer ${successorAccessToken}` },
          auth: {},
        },
      };

      const socketMiddleware = createSocketAuthMiddleware({
        sessionFamilyModel: SessionFamily,
        activeRotationsModel: ActiveRotations,
      });

      let socketAccepted = false;
      await socketMiddleware(socket, (err) => {
        if (!err) socketAccepted = true;
      });
      assert.ok(socketAccepted);
      assert.strictEqual(socket.user.userId, "65b9e1234567890abcdef123");

      // 5. Logout
      const { req: logoutReq, res: logoutRes, next: logoutNext, getNextError: logoutErr } = createMockHttp({
        user: { userId: "65b9e1234567890abcdef123", familyId: "fam_lifecycle" },
        cookies: { [REFRESH_TOKEN_COOKIE]: refRes.cookies[REFRESH_TOKEN_COOKIE].val },
      });

      SessionFamily.updateOne = async (_q, upd) => {
        if (upd.$set && upd.$set.isRevoked) {
          familyRevoked = true;
        }
        return { modifiedCount: 1 };
      };

      await authController.logout(logoutReq, logoutRes, logoutNext);

      assert.strictEqual(logoutErr(), null);
      assert.strictEqual(logoutRes.statusCode, 200);
      assert.ok(logoutRes.clearedCookies.some((c) => c.name === REFRESH_TOKEN_COOKIE));
      assert.strictEqual(familyRevoked, true);

      // 6. Post-Logout Handshake Fails Closed
      let postLogoutErr = null;
      await socketMiddleware(socket, (err) => {
        postLogoutErr = err;
      });
      assert.ok(postLogoutErr);
      assert.strictEqual(postLogoutErr.data?.code, "SESSION_REVOKED");
    } finally {
      User.findOne = origUserFind;
      User.create = origUserCreate;
      SessionFamily.create = origFamilyCreate;
      SessionFamily.findOne = origFamilyFind;
      SessionFamily.updateOne = origFamilyUpdate;
      RefreshSession.create = origSessionCreate;
      RefreshSession.findOne = origSessionFind;
      RefreshSession.updateOne = origSessionUpdate;
      ActiveRotations.findOneAndUpdate = origActiveUpsert;
      ActiveRotations.deleteOne = origActiveDelete;
    }
  });

  test("E2E Invariant 2: Refresh Token Reuse Detection revokes entire family immediately", async () => {
    const rawToken = "reused_token_value_abc";
    const tokenHash = hashToken(rawToken);
    let familyUpdatedRevoked = false;

    const origSessionFind = RefreshSession.findOne;
    const origFamilyUpdate = SessionFamily.updateOne;

    try {
      RefreshSession.findOne = async () => ({
        tokenHash,
        familyId: "fam_victim_reuse_123",
        userId: "user_123",
        isRevoked: true, // Replaying an already revoked token!
        rotationState: "COMMITTED",
      });

      SessionFamily.updateOne = async (q, upd) => {
        if (upd.$set && upd.$set.isRevoked === true && upd.$set.revocationReason === "TOKEN_REUSE_DETECTED") {
          familyUpdatedRevoked = true;
        }
        return { modifiedCount: 1 };
      };

      const { req, res, next, getNextError } = createMockHttp({
        cookies: { [REFRESH_TOKEN_COOKIE]: rawToken },
      });

      await authController.refresh(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, "TOKEN_REUSE_DETECTED");
      assert.ok(familyUpdatedRevoked);
    } finally {
      RefreshSession.findOne = origSessionFind;
      SessionFamily.updateOne = origFamilyUpdate;
    }
  });

  test("E2E Invariant 3: Account Lockout after consecutive failed attempts protects against brute-force", async () => {
    const origFindOne = User.findOne;
    const origUpdateOne = User.updateOne;

    try {
      // 1. Verify 5th failed attempt sets lockUntil
      const hashedPassword = await bcrypt.hash("CorrectPassword1!", 10);
      let updatedSet = null;

      User.findOne = () => ({
        select: async () => ({
          _id: "65b9e1234567890abcdef123",
          username: "victim_user",
          password: hashedPassword,
          failedAttempts: 4, // 4 prior failures
        }),
      });

      User.updateOne = async (_query, update) => {
        updatedSet = update.$set;
        return { modifiedCount: 1 };
      };

      const { req: failReq, res: failRes, next: failNext, getNextError: failErr } = createMockHttp({
        body: { username: "victim_user", password: "BadPassword" },
      });

      await authController.login(failReq, failRes, failNext);

      const err = failErr();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(updatedSet.failedAttempts, 5);
      assert.ok(updatedSet.lockUntil instanceof Date);

      // 2. Verify active lockout rejects without password check with 423 ACCOUNT_LOCKED
      User.findOne = () => ({
        select: async () => ({
          _id: "65b9e1234567890abcdef123",
          username: "victim_user",
          failedAttempts: 5,
          lockUntil: new Date(Date.now() + 10 * 60 * 1000), // actively locked
        }),
      });

      const { req: lockedReq, res: lockedRes, next: lockedNext, getNextError: lockedErr } = createMockHttp({
        body: { username: "victim_user", password: "AnyPassword" },
      });

      await authController.login(lockedReq, lockedRes, lockedNext);

      const lErr = lockedErr();
      assert.ok(lErr instanceof AppError);
      assert.strictEqual(lErr.statusCode, 423);
      assert.strictEqual(lErr.code, "ACCOUNT_LOCKED");
    } finally {
      User.findOne = origFindOne;
      User.updateOne = origUpdateOne;
    }
  });

  test("E2E Invariant 4: Fail-Closed Protection under Infrastructure Outages", async () => {
    const failingRedis = {
      get: async () => {
        throw new Error("Redis cluster disconnected");
      },
    };

    const token = signAccessToken({ userId: "u1", familyId: "fam1" });
    const socket = {
      handshake: {
        headers: { authorization: `Bearer ${token}` },
        auth: {},
      },
    };

    const mockFamilyModel = {
      findOne: async () => ({
        familyId: "fam1",
        userId: "u1",
        familyStatus: "ACTIVE",
        isRevoked: false,
      }),
    };

    const mockRotationsModel = {
      findOne: async () => null,
    };

    const socketMiddleware = createSocketAuthMiddleware({
      sessionFamilyModel: mockFamilyModel,
      activeRotationsModel: mockRotationsModel,
      redisClient: failingRedis,
    });

    let outageError;
    await socketMiddleware(socket, (err) => {
      outageError = err;
    });

    assert.ok(outageError);
    assert.strictEqual(outageError.data?.code, "REDIS_UNAVAILABLE");
  });
});
