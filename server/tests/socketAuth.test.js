/**
 * ConnectX Phase 4 Module 5: Real-time Socket.IO Auth Integration Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

const {
  createSocketAuthMiddleware,
  socketEventAuthMiddleware,
  extractSocketToken,
  createSocketError,
} = require("../realtime/socketAuthMiddleware");
const { initSocketGateway } = require("../realtime/socketGateway");
const { signAccessToken } = require("../utils/jwtUtils");
const AppError = require("../utils/appError");

const TEST_SECRET = "test_super_secret_key_at_least_32_characters_long_123456789";
const VALID_USER_ID = "65b9e1234567890abcdef123";
const VALID_FAMILY_ID = "fam_socket_test_12345";

// Helper to create a mock socket object
function createMockSocket({
  authToken = null,
  authHeader = null,
  cookieHeader = null,
  queryToken = null,
  user = null,
} = {}) {
  const handshake = {
    auth: authToken ? { token: authToken } : {},
    headers: {},
    query: queryToken ? { token: queryToken } : {},
  };

  if (authHeader) handshake.headers.authorization = authHeader;
  if (cookieHeader) handshake.headers.cookie = cookieHeader;

  const joinedRooms = new Set();
  const emittedEvents = [];

  const socket = {
    id: `sock_${Math.random().toString(36).substring(2, 9)}`,
    handshake,
    user,
    sessionFamily: null,
    fencingToken: null,
    use(fn) {
      this._eventMiddleware = fn;
    },
    join(room) {
      joinedRooms.add(room);
    },
    rooms: joinedRooms,
    emit(event, data) {
      emittedEvents.push({ event, data });
    },
    to(targetId) {
      return {
        emit(event, data) {
          emittedEvents.push({ targetId, event, data });
        },
      };
    },
    getEmittedEvents: () => emittedEvents,
  };

  return socket;
}

describe("ConnectX Module 5: Real-time Socket.IO Auth Integration Tests", () => {
  let validToken;

  beforeEach(() => {
    validToken = signAccessToken({
      userId: VALID_USER_ID,
      familyId: VALID_FAMILY_ID,
      secretOverride: TEST_SECRET,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Handshake Token Extraction Vectors & Query Prohibition
  // ---------------------------------------------------------------------------
  describe("1. Handshake Token Extraction & Query Rejection", () => {
    test("extracts token from handshake.auth.token (raw and Bearer prefixed)", () => {
      assert.strictEqual(extractSocketToken({ auth: { token: "raw_token_abc" } }), "raw_token_abc");
      assert.strictEqual(extractSocketToken({ auth: { token: "Bearer bearer_token_xyz" } }), "bearer_token_xyz");
      assert.strictEqual(extractSocketToken({ auth: { token: "BEARER upper_bearer" } }), "upper_bearer");
    });

    test("extracts token from handshake.headers.authorization", () => {
      assert.strictEqual(
        extractSocketToken({ headers: { authorization: "Bearer header_token_123" } }),
        "header_token_123"
      );
    });

    test("extracts token from handshake.headers.cookie", () => {
      assert.strictEqual(
        extractSocketToken({ headers: { cookie: "connectx_access_token=cookie_token_999; other=1" } }),
        "cookie_token_999"
      );
    });

    test("strictly rejects query parameter JWT token extraction to prevent log leakage", () => {
      assert.strictEqual(
        extractSocketToken({ query: { token: "query_token_456" } }),
        null,
        "Query parameter token extraction must return null"
      );
      assert.strictEqual(
        extractSocketToken({ query: { token: "Bearer query_token_456" } }),
        null
      );
    });

    test("returns null when no approved token vector is present or empty", () => {
      assert.strictEqual(extractSocketToken({}), null);
      assert.strictEqual(extractSocketToken(null), null);
      assert.strictEqual(extractSocketToken({ auth: {} }), null);
      assert.strictEqual(extractSocketToken({ headers: { authorization: "Basic 123" } }), null);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Handshake JWT Validation & Error Formatting
  // ---------------------------------------------------------------------------
  describe("2. Handshake Token Verification", () => {
    test("rejects handshake when token is missing with 401 TOKEN_MISSING", async () => {
      const middleware = createSocketAuthMiddleware({ secretOverride: TEST_SECRET });
      const socket = createMockSocket({});

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "TOKEN_MISSING");
      assert.strictEqual(errorResult.data.statusCode, 401);
      assert.ok(!socket.user);
    });

    test("handshake with query-parameter token only is rejected with 401 TOKEN_MISSING", async () => {
      const middleware = createSocketAuthMiddleware({ secretOverride: TEST_SECRET });
      const socket = createMockSocket({ queryToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "TOKEN_MISSING");
      assert.strictEqual(errorResult.data.statusCode, 401);
      assert.ok(!socket.user);
    });

    test("rejects handshake with malformed token with 401 TOKEN_INVALID", async () => {
      const middleware = createSocketAuthMiddleware({ secretOverride: TEST_SECRET });
      const socket = createMockSocket({ authToken: "invalid.jwt.token" });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "TOKEN_INVALID");
      assert.strictEqual(errorResult.data.statusCode, 401);
    });

    test("rejects handshake with expired token with 401 TOKEN_EXPIRED / AUTH_EXPIRED", async () => {
      const expiredToken = signAccessToken({
        userId: VALID_USER_ID,
        familyId: VALID_FAMILY_ID,
        expiresIn: "-1s",
        secretOverride: TEST_SECRET,
      });

      const middleware = createSocketAuthMiddleware({ secretOverride: TEST_SECRET });
      const socket = createMockSocket({ authToken: expiredToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.ok(["TOKEN_EXPIRED", "AUTH_EXPIRED"].includes(errorResult.data.code));
      assert.strictEqual(errorResult.data.statusCode, 401);
    });

    test("rejects handshake with token signed with different secret", async () => {
      const wrongSecretToken = signAccessToken({
        userId: VALID_USER_ID,
        familyId: VALID_FAMILY_ID,
        secretOverride: "wrong_secret_key_at_least_32_characters_long_99999",
      });

      const middleware = createSocketAuthMiddleware({ secretOverride: TEST_SECRET });
      const socket = createMockSocket({ authToken: wrongSecretToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "TOKEN_INVALID");
      assert.strictEqual(errorResult.data.statusCode, 401);
    });

    test("accepts valid token and binds server-side socket.user identity", async () => {
      const mockFamilyModel = {
        findOne: async () => ({
          familyId: VALID_FAMILY_ID,
          userId: VALID_USER_ID,
          familyStatus: "ACTIVE",
          isRevoked: false,
          lastFencingToken: 120,
        }),
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.strictEqual(errorResult, undefined);
      assert.ok(socket.user);
      assert.strictEqual(socket.user.userId, VALID_USER_ID);
      assert.strictEqual(socket.user.familyId, VALID_FAMILY_ID);
      assert.strictEqual(socket.sessionFamily.familyStatus, "ACTIVE");
      assert.strictEqual(socket.fencingToken, 120);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SessionFamily Status Verification
  // ---------------------------------------------------------------------------
  describe("3. SessionFamily Status Verification", () => {
    test("rejects connection if SessionFamily does not exist in database with 401 SESSION_REVOKED", async () => {
      const mockFamilyModel = {
        findOne: async () => null,
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "SESSION_REVOKED");
      assert.strictEqual(errorResult.data.statusCode, 401);
    });

    test("rejects connection if SessionFamily is marked isRevoked: true", async () => {
      const mockFamilyModel = {
        findOne: async () => ({
          familyId: VALID_FAMILY_ID,
          userId: VALID_USER_ID,
          isRevoked: true,
          familyStatus: "REVOKED",
        }),
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "SESSION_REVOKED");
    });

    test("rejects connection if SessionFamily is QUARANTINED with 403 FAMILY_QUARANTINED", async () => {
      const mockFamilyModel = {
        findOne: async () => ({
          familyId: VALID_FAMILY_ID,
          userId: VALID_USER_ID,
          isRevoked: false,
          familyStatus: "QUARANTINED",
        }),
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "FAMILY_QUARANTINED");
      assert.strictEqual(errorResult.data.statusCode, 403);
    });

    test("rejects connection if SessionFamily user binding does not match token subject", async () => {
      const mockFamilyModel = {
        findOne: async () => ({
          familyId: VALID_FAMILY_ID,
          userId: "different_user_9999",
          isRevoked: false,
          familyStatus: "ACTIVE",
        }),
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "TOKEN_MISMATCH");
      assert.strictEqual(errorResult.data.statusCode, 401);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Concurrent Rotation & Distributed Uncertainty Governance
  // ---------------------------------------------------------------------------
  describe("4. Concurrent Refresh & Uncertainty Checks", () => {
    test("rejects connection if family is ROTATING with AMBIGUOUS_STEP1 with 503 AUTH_TRANSACTION_UNCERTAIN", async () => {
      const mockFamilyModel = {
        findOne: async () => ({
          familyId: VALID_FAMILY_ID,
          userId: VALID_USER_ID,
          isRevoked: false,
          familyStatus: "ROTATING",
        }),
      };

      const mockActiveModel = {
        findOne: async () => ({
          _id: VALID_FAMILY_ID,
          intentStatus: "AMBIGUOUS_STEP1",
        }),
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        activeRotationsModel: mockActiveModel,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "AUTH_TRANSACTION_UNCERTAIN");
      assert.strictEqual(errorResult.data.statusCode, 503);
    });

    test("rejects connection if family is actively ROTATING without ambiguity with 409 SESSION_ROTATING", async () => {
      const mockFamilyModel = {
        findOne: async () => ({
          familyId: VALID_FAMILY_ID,
          userId: VALID_USER_ID,
          isRevoked: false,
          familyStatus: "ROTATING",
        }),
      };

      const mockActiveModel = {
        findOne: async () => ({
          _id: VALID_FAMILY_ID,
          intentStatus: "INTENT_DECLARED",
        }),
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        activeRotationsModel: mockActiveModel,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "SESSION_ROTATING");
      assert.strictEqual(errorResult.data.statusCode, 409);
    });

    test("rejects connection if Redis uncertainty registry marks family quarantined with 503 AUTH_TRANSACTION_UNCERTAIN", async () => {
      const mockFamilyModel = {
        findOne: async () => ({
          familyId: VALID_FAMILY_ID,
          userId: VALID_USER_ID,
          isRevoked: false,
          familyStatus: "ACTIVE",
        }),
      };

      const mockRedis = {
        get: async (key) => (key.includes(VALID_FAMILY_ID) ? "QUARANTINED" : null),
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        redisClient: mockRedis,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "AUTH_TRANSACTION_UNCERTAIN");
      assert.strictEqual(errorResult.data.statusCode, 503);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Fail-Closed Handling on Infrastructure Outages
  // ---------------------------------------------------------------------------
  describe("5. Fail-Closed Handling on Infrastructure Outages", () => {
    test("MongoDB outage during SessionFamily lookup strictly fails closed with 500 DATABASE_UNAVAILABLE", async () => {
      const mockFailingDb = {
        findOne: async () => {
          throw new Error("MongoNetworkTimeoutError: connection timed out to replica set");
        },
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFailingDb,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "DATABASE_UNAVAILABLE");
      assert.strictEqual(errorResult.data.statusCode, 500);
      assert.ok(!socket.user, "Unauthenticated socket must not be established on DB crash");
    });

    test("MongoDB outage during ActiveRotations check strictly fails closed", async () => {
      const mockFamilyModel = {
        findOne: async () => ({
          familyId: VALID_FAMILY_ID,
          userId: VALID_USER_ID,
          isRevoked: false,
          familyStatus: "ROTATING",
        }),
      };

      const mockFailingActive = {
        findOne: async () => {
          throw new Error("MongooseServerSelectionError: no primary found");
        },
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        activeRotationsModel: mockFailingActive,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "DATABASE_UNAVAILABLE");
      assert.strictEqual(errorResult.data.statusCode, 500);
    });

    test("Redis outage during uncertainty check strictly fails closed with 503 REDIS_UNAVAILABLE", async () => {
      const mockFamilyModel = {
        findOne: async () => ({
          familyId: VALID_FAMILY_ID,
          userId: VALID_USER_ID,
          isRevoked: false,
          familyStatus: "ACTIVE",
        }),
      };

      const mockFailingRedis = {
        get: async () => {
          throw new Error("ECONNREFUSED: Redis instance offline");
        },
      };

      const middleware = createSocketAuthMiddleware({
        sessionFamilyModel: mockFamilyModel,
        redisClient: mockFailingRedis,
        secretOverride: TEST_SECRET,
      });
      const socket = createMockSocket({ authToken: validToken });

      let errorResult = null;
      await middleware(socket, (err) => {
        errorResult = err;
      });

      assert.ok(errorResult instanceof Error);
      assert.strictEqual(errorResult.data.code, "REDIS_UNAVAILABLE");
      assert.strictEqual(errorResult.data.statusCode, 503);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Per-Event Authorization & Identity Spoofing Protection
  // ---------------------------------------------------------------------------
  describe("6. Per-Event Authorization & Identity Protection", () => {
    test("rejects event if socket has no authenticated user context", () => {
      const unauthSocket = createMockSocket({ user: null });
      const packet = ["send-msg", { to: "user_2", msg: "hello" }];

      let errResult = null;
      socketEventAuthMiddleware.call(unauthSocket, packet, (err) => {
        errResult = err;
      });

      assert.ok(errResult instanceof Error);
      assert.strictEqual(errResult.data.code, "UNAUTHORIZED_EVENT");
    });

    test("overwrites spoofed sender id with authenticated socket.user.userId", () => {
      const authSocket = createMockSocket({
        user: { userId: VALID_USER_ID, familyId: VALID_FAMILY_ID },
      });
      const packet = ["send-msg", { to: "victim_user", from: "spoofed_admin_id", msg: "malicious" }];

      let errResult = null;
      socketEventAuthMiddleware.call(authSocket, packet, (err) => {
        errResult = err;
      });

      assert.strictEqual(errResult, undefined);
      assert.strictEqual(packet[1].from, VALID_USER_ID, "data.from must be overridden with verified server identity");
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Gateway Initialization, CSWSH Protection & Concurrent Sockets Lifecycle
  // ---------------------------------------------------------------------------
  describe("7. Socket Gateway Lifecycle, CSWSH & Concurrent Sockets", () => {
    let server;

    beforeEach(() => {
      server = http.createServer();
    });

    test("initSocketGateway binds authentication middleware and initializes online mappings", () => {
      const io = initSocketGateway(server, {
        sessionFamilyModel: { findOne: async () => null },
        secretOverride: TEST_SECRET,
      });

      assert.ok(io);
      assert.ok(global.onlineUsers instanceof Map);
      assert.ok(global.userSockets instanceof Map);
      io.close();
    });

    test("allowRequest CSWSH protection rejects unpermitted origin and accepts permitted origin", (t, done) => {
      const io = initSocketGateway(server, { secretOverride: TEST_SECRET });
      const allowRequest = io.engine.opts.allowRequest;
      assert.strictEqual(typeof allowRequest, "function");

      // Untrusted Origin
      allowRequest({ headers: { origin: "http://malicious-origin.com" } }, (err, allowed) => {
        assert.strictEqual(allowed, false);
        assert.match(err, /CORS_POLICY_VIOLATION/);

        // Permitted Origin
        allowRequest({ headers: { origin: "http://localhost:3000" } }, (err2, allowed2) => {
          assert.strictEqual(err2, null);
          assert.strictEqual(allowed2, true);
          io.close();
          done();
        });
      });
    });

    test("add-user event rejects mismatched userId with auth-error IDENTITY_SPOOF_ATTEMPT", () => {
      const io = initSocketGateway(server, {
        secretOverride: TEST_SECRET,
      });

      const authSocket = createMockSocket({
        user: { userId: VALID_USER_ID, familyId: VALID_FAMILY_ID },
      });

      const registeredListeners = {};
      authSocket.on = (event, fn) => {
        registeredListeners[event] = fn;
      };

      const connectionHandler = io.listeners("connection")[0];
      connectionHandler(authSocket);

      // Assert user automatically joined room and was registered in onlineUsers
      assert.ok(authSocket.rooms.has(`user:${VALID_USER_ID}`));
      assert.strictEqual(onlineUsers.get(VALID_USER_ID), authSocket.id);

      // Malicious attempt to register someone else's userId
      registeredListeners["add-user"]("another_users_id_999");

      // Verify auth-error event was emitted
      const events = authSocket.getEmittedEvents();
      const spoofError = events.find((e) => e.event === "auth-error");
      assert.ok(spoofError);
      assert.strictEqual(spoofError.data.code, "IDENTITY_SPOOF_ATTEMPT");

      // Verify onlineUsers mapping was NOT corrupted
      assert.strictEqual(onlineUsers.get("another_users_id_999"), undefined);
      assert.strictEqual(onlineUsers.get(VALID_USER_ID), authSocket.id);

      io.close();
    });

    test("concurrent sockets for same user: closing one tab keeps onlineUsers mapped to remaining active socket", () => {
      const io = initSocketGateway(server, {
        secretOverride: TEST_SECRET,
      });
      const connectionHandler = io.listeners("connection")[0];

      // Tab 1 connects
      const socket1 = createMockSocket({
        user: { userId: "user_multi", familyId: VALID_FAMILY_ID },
      });
      const listeners1 = {};
      socket1.on = (event, fn) => { listeners1[event] = fn; };
      connectionHandler(socket1);

      // Tab 2 connects concurrently for same user
      const socket2 = createMockSocket({
        user: { userId: "user_multi", familyId: VALID_FAMILY_ID },
      });
      const listeners2 = {};
      socket2.on = (event, fn) => { listeners2[event] = fn; };
      connectionHandler(socket2);

      // Both sockets are tracked under userSockets
      assert.strictEqual(userSockets.get("user_multi").size, 2);
      assert.strictEqual(onlineUsers.get("user_multi"), socket2.id);

      // Tab 2 closes / disconnects
      listeners2["disconnect"]();

      // INVARIANT: User is STILL online because Tab 1 is active!
      assert.strictEqual(userSockets.get("user_multi").size, 1);
      assert.strictEqual(onlineUsers.get("user_multi"), socket1.id);

      // Message to user_multi still routes to Tab 1
      const senderSocket = createMockSocket({
        user: { userId: "sender_user", familyId: VALID_FAMILY_ID },
      });
      const senderListeners = {};
      senderSocket.on = (event, fn) => { senderListeners[event] = fn; };
      connectionHandler(senderSocket);

      senderListeners["send-msg"]({
        to: "user_multi",
        msg: "Message to multi-tab user",
      });

      const emitted = senderSocket.getEmittedEvents();
      const deliveredMsg = emitted.find((e) => e.targetId === socket1.id);
      assert.ok(deliveredMsg, "Message must reach remaining active socket");
      assert.strictEqual(deliveredMsg.data, "Message to multi-tab user");

      // Tab 1 closes -> now user is fully offline
      listeners1["disconnect"]();
      assert.strictEqual(userSockets.get("user_multi"), undefined);
      assert.strictEqual(onlineUsers.get("user_multi"), undefined);

      io.close();
    });
  });
});
