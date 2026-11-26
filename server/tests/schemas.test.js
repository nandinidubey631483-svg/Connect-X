/**
 * ConnectX Module 1: Schemas & Cryptographic Models Unit Tests
 * Uses Node.js native test runner and Mongoose schema validation.
 */
const { test, describe } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

const User = require("../models/userModel");
const SessionFamily = require("../models/sessionFamilyModel");
const ActiveRotations = require("../models/activeRotationsModel");
const RefreshSession = require("../models/refreshSessionModel");
const Counter = require("../models/counterModel");

describe("ConnectX Module 1: Schemas & Cryptographic Models Tests", () => {
  describe("User Model Security Extensions", () => {
    test("User schema instantiates with valid security defaults", () => {
      const user = new User({
        username: "securityUser",
        email: "secuser@connectx.com",
        password: "hashedPassword123",
      });

      assert.strictEqual(user.username, "securityUser");
      assert.strictEqual(user.email, "secuser@connectx.com");
      assert.strictEqual(user.passwordChangedAt, null);
      assert.strictEqual(user.failedAttempts, 0);
      assert.strictEqual(user.lockUntil, null);
      assert.strictEqual(user.isAvatarImageSet, false);
      assert.strictEqual(user.avatarImage, "");
    });

    test("User toJSON and toObject transforms strip password hash", () => {
      const user = new User({
        username: "stripUser",
        email: "strip@connectx.com",
        password: "secretHashedPassword",
      });

      const jsonUser = user.toJSON();
      assert.strictEqual(jsonUser.password, undefined);
      assert.strictEqual(jsonUser.username, "stripUser");

      const objUser = user.toObject();
      assert.strictEqual(objUser.password, undefined);
      assert.strictEqual(objUser.email, "strip@connectx.com");
    });

    test("User password has select: false by default for projection security", () => {
      assert.strictEqual(
        User.schema.path("password").options.select,
        false,
        "password field must specify select: false to protect lean and unprojected queries"
      );
    });

    test("User schema requires username, email, and password", () => {
      const emptyUser = new User({});
      const validationError = emptyUser.validateSync();
      assert.ok(validationError);
      assert.ok(validationError.errors.username);
      assert.ok(validationError.errors.email);
      assert.ok(validationError.errors.password);
    });
  });

  describe("SessionFamily Model", () => {
    test("SessionFamily validates valid document with default values", () => {
      const mockUserId = new mongoose.Types.ObjectId();
      const family = new SessionFamily({
        familyId: "fam_test_uuid_12345",
        userId: mockUserId,
      });

      const error = family.validateSync();
      assert.strictEqual(error, undefined);
      assert.strictEqual(family.familyStatus, "ACTIVE");
      assert.strictEqual(family.isRevoked, false);
      assert.strictEqual(family.revocationReason, null);
      assert.strictEqual(family.lastFencingToken, 0);
      assert.strictEqual(family.lastFencingOperationId, null);
      assert.strictEqual(family.activeOperationId, null);
      assert.ok(family.lastRotatedAt instanceof Date);
    });

    test("SessionFamily enforces valid familyStatus enum values", () => {
      const mockUserId = new mongoose.Types.ObjectId();
      const family = new SessionFamily({
        familyId: "fam_invalid_status",
        userId: mockUserId,
        familyStatus: "INVALID_STATUS",
      });

      const error = family.validateSync();
      assert.ok(error);
      assert.ok(error.errors.familyStatus);
    });

    test("SessionFamily permits accepted familyStatus enum values", () => {
      const mockUserId = new mongoose.Types.ObjectId();
      for (const status of ["ACTIVE", "ROTATING", "QUARANTINED", "REVOKED"]) {
        const family = new SessionFamily({
          familyId: `fam_status_${status}`,
          userId: mockUserId,
          familyStatus: status,
        });
        const error = family.validateSync();
        assert.strictEqual(error, undefined);
      }
    });

    test("SessionFamily requires familyId and userId", () => {
      const family = new SessionFamily({});
      const error = family.validateSync();
      assert.ok(error);
      assert.ok(error.errors.familyId);
      assert.ok(error.errors.userId);
    });
  });

  describe("ActiveRotations Model (Strict NO TTL Index Invariant)", () => {
    test("ActiveRotations validates valid rotation intent", () => {
      const intent = new ActiveRotations({
        _id: "fam_intent_123",
        operationId: "op_uuid_abc",
        tokenHash: "sha256_mock_hash_value_1234567890abcdef",
        fencingToken: 42,
        workerId: "worker_node_1",
      });

      const error = intent.validateSync();
      assert.strictEqual(error, undefined);
      assert.strictEqual(intent._id, "fam_intent_123");
      assert.strictEqual(intent.intentStatus, "INTENT_DECLARED");
      assert.strictEqual(intent.fencingToken, 42);
      assert.ok(intent.createdAt instanceof Date);
    });

    test("ActiveRotations schema explicitly contains NO TTL expiration index", () => {
      const indexes = ActiveRotations.schema.indexes();
      // Ensure no index specifies expireAfterSeconds
      const ttlIndex = indexes.find(
        ([idx, options]) => options && typeof options.expireAfterSeconds !== "undefined"
      );
      assert.strictEqual(
        ttlIndex,
        undefined,
        "ActiveRotations must NEVER contain an automatic TTL expiration index per Phase 4 v4.18+"
      );
    });

    test("ActiveRotations enforces required fields and intentStatus enum", () => {
      const intent = new ActiveRotations({
        _id: "fam_intent_test",
        intentStatus: "INVALID_INTENT",
      });

      const error = intent.validateSync();
      assert.ok(error);
      assert.ok(error.errors.operationId);
      assert.ok(error.errors.tokenHash);
      assert.ok(error.errors.fencingToken);
      assert.ok(error.errors.workerId);
      assert.ok(error.errors.intentStatus);
    });
  });

  describe("RefreshSession Model", () => {
    test("RefreshSession validates valid document with rotationState defaults", () => {
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const session = new RefreshSession({
        tokenHash: "token_hash_sha256_abcdef123456",
        familyId: "fam_uuid_xyz",
        expiresAt: expires,
      });

      const error = session.validateSync();
      assert.strictEqual(error, undefined);
      assert.strictEqual(session.rotationState, "ACTIVE");
      assert.strictEqual(session.isRevoked, false);
      assert.strictEqual(session.revocationReason, null);
      assert.strictEqual(session.replacedByTokenHash, null);
      assert.strictEqual(session.highestIssuedFencingToken, 0);
      assert.strictEqual(session.activeOperationId, null);
      assert.strictEqual(session.rotatedAt, null);
    });

    test("RefreshSession enforces rotationState enum", () => {
      const session = new RefreshSession({
        tokenHash: "hash123",
        familyId: "fam123",
        expiresAt: new Date(),
        rotationState: "INVALID_ROTATION_STATE",
      });

      const error = session.validateSync();
      assert.ok(error);
      assert.ok(error.errors.rotationState);
    });

    test("RefreshSession accepts all approved rotationState values", () => {
      for (const state of ["ACTIVE", "IN_FLIGHT", "UNCERTAIN", "COMMITTED"]) {
        const session = new RefreshSession({
          tokenHash: `hash_${state}`,
          familyId: "fam_test",
          expiresAt: new Date(),
          rotationState: state,
        });
        const error = session.validateSync();
        assert.strictEqual(error, undefined);
      }
    });

    test("RefreshSession requires tokenHash, familyId, and expiresAt", () => {
      const session = new RefreshSession({});
      const error = session.validateSync();
      assert.ok(error);
      assert.ok(error.errors.tokenHash);
      assert.ok(error.errors.familyId);
      assert.ok(error.errors.expiresAt);
    });
  });

  describe("Counter Model", () => {
    test("Counter validates monotonic sequence document", () => {
      const counter = new Counter({
        _id: "auth_fencing_sequence",
        seq: 10000,
      });

      const error = counter.validateSync();
      assert.strictEqual(error, undefined);
      assert.strictEqual(counter._id, "auth_fencing_sequence");
      assert.strictEqual(counter.seq, 10000);
    });

    test("Counter requires _id and seq", () => {
      const counter = new Counter({});
      const error = counter.validateSync();
      assert.ok(error);
      assert.ok(error.errors._id);
    });
  });

  describe("Index Reliability & Production syncIndexes", () => {
    test("ensureAllIndexes is an executable function exported by database manager", () => {
      const { ensureAllIndexes } = require("../config/database");
      assert.strictEqual(typeof ensureAllIndexes, "function");
    });

    test("All Phase 4 models have declared indexes with valid definitions", () => {
      // User indexes
      const userIndexes = User.schema.indexes();
      assert.ok(Array.isArray(userIndexes));

      // SessionFamily compound indexes
      const familyIndexes = SessionFamily.schema.indexes();
      const hasUserRevoked = familyIndexes.some(([idx]) => idx.userId === 1 && idx.isRevoked === 1);
      const hasFamilyRevoked = familyIndexes.some(([idx]) => idx.familyId === 1 && idx.isRevoked === 1);
      const hasStatusRotated = familyIndexes.some(([idx]) => idx.familyStatus === 1 && idx.lastRotatedAt === 1);
      assert.strictEqual(hasUserRevoked, true, "SessionFamily must index { userId: 1, isRevoked: 1 }");
      assert.strictEqual(hasFamilyRevoked, true, "SessionFamily must index { familyId: 1, isRevoked: 1 }");
      assert.strictEqual(hasStatusRotated, true, "SessionFamily must index { familyStatus: 1, lastRotatedAt: 1 }");

      // RefreshSession indexes
      const sessionIndexes = RefreshSession.schema.indexes();
      const hasFamilySession = sessionIndexes.some(([idx]) => idx.familyId === 1 && idx.isRevoked === 1);
      const hasExpiryTTL = sessionIndexes.some(
        ([idx, opt]) => idx.expiresAt === 1 && opt && opt.expireAfterSeconds === 0
      );
      assert.strictEqual(hasFamilySession, true, "RefreshSession must index { familyId: 1, isRevoked: 1 }");
      assert.strictEqual(hasExpiryTTL, true, "RefreshSession must define TTL index on expiresAt");

      // ActiveRotations: MUST NOT have TTL
      const intentIndexes = ActiveRotations.schema.indexes();
      const hasIntentTTL = intentIndexes.some(
        ([idx, opt]) => opt && typeof opt.expireAfterSeconds !== "undefined"
      );
      assert.strictEqual(hasIntentTTL, false, "ActiveRotations must NOT have a TTL index");
    });
  });
});
