/**
 * ConnectX Phase 5 Module 1: User Profile Management Backend Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");

const User = require("../models/userModel");
const profileController = require("../controllers/profileController");
const AppError = require("../utils/appError");

function createMockHttp({ body = {}, params = {}, headers = {}, user = null } = {}) {
  const req = {
    body,
    params,
    headers,
    user,
    ip: "127.0.0.1",
    method: "GET",
  };

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };

  let nextErr = null;
  const next = (err) => {
    nextErr = err;
  };

  return { req, res, next, getNextError: () => nextErr };
}

describe("ConnectX Phase 5 Module 1: User Profile Management Tests", () => {
  let origFindById, origFindOne, origFindByIdAndUpdate;

  beforeEach(() => {
    origFindById = User.findById;
    origFindOne = User.findOne;
    origFindByIdAndUpdate = User.findByIdAndUpdate;
  });

  describe("1. GET /api/v1/profile/me (getMyProfile)", () => {
    test("returns authenticated user's profile with sensitive security fields omitted", async () => {
      const mockUser = {
        _id: "u_profile_123",
        username: "testuser",
        email: "test@connectx.com",
        password: "hashed_password",
        failedAttempts: 3,
        lockUntil: new Date(),
        displayName: "Test User",
        bio: "Full stack developer",
        phoneNumber: "+1234567890",
        statusMessage: "Coding ConnectX",
        avatarImage: "avatar_base64_data",
        isAvatarImageSet: true,
      };

      User.findById = async (id) => {
        if (id === "u_profile_123") return mockUser;
        return null;
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "u_profile_123" },
        });

        await profileController.getMyProfile(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.profile.username, "testuser");
        assert.strictEqual(res.body.profile.displayName, "Test User");
        assert.strictEqual(res.body.profile.bio, "Full stack developer");

        // Sensitive fields omitted
        assert.strictEqual(res.body.profile.password, undefined);
        assert.strictEqual(res.body.profile.failedAttempts, undefined);
        assert.strictEqual(res.body.profile.lockUntil, undefined);
      } finally {
        User.findById = origFindById;
      }
    });

    test("fails with 401 TOKEN_MISSING if user context is missing", async () => {
      const { req, res, next, getNextError } = createMockHttp({ user: null });
      await profileController.getMyProfile(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, "TOKEN_MISSING");
    });
  });

  describe("2. PUT /api/v1/profile/me (updateMyProfile)", () => {
    test("updates user's profile details and returns sanitized updated document", async () => {
      let updateExecuted = null;
      User.findOne = async () => null; // Username not taken
      User.findByIdAndUpdate = async (id, upd) => {
        updateExecuted = upd.$set;
        return {
          _id: id,
          username: upd.$set.username || "olduser",
          displayName: upd.$set.displayName,
          bio: upd.$set.bio,
          phoneNumber: upd.$set.phoneNumber,
          statusMessage: upd.$set.statusMessage,
          password: "secret_hash",
        };
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "u_profile_123" },
          body: {
            displayName: "New Display Name",
            bio: "Updated biography",
            phoneNumber: "+1987654321",
            statusMessage: "Available",
            username: "newusername",
          },
        });

        await profileController.updateMyProfile(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.profile.displayName, "New Display Name");
        assert.strictEqual(res.body.profile.bio, "Updated biography");
        assert.strictEqual(res.body.profile.password, undefined);

        assert.strictEqual(updateExecuted.displayName, "New Display Name");
        assert.strictEqual(updateExecuted.username, "newusername");
      } finally {
        User.findOne = origFindOne;
        User.findByIdAndUpdate = origFindByIdAndUpdate;
      }
    });

    test("rejects duplicate username with 409 USER_ALREADY_EXISTS", async () => {
      User.findOne = async (q) => ({ _id: "other_user_id", username: q.username });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "u_profile_123" },
          body: { username: "already_taken_name" },
        });

        await profileController.updateMyProfile(req, res, next);

        const err = getNextError();
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, "USER_ALREADY_EXISTS");
      } finally {
        User.findOne = origFindOne;
      }
    });

    test("validates field lengths (rejects excessive bio length)", async () => {
      const longBio = "a".repeat(251);
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_profile_123" },
        body: { bio: longBio },
      });

      await profileController.updateMyProfile(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });
  });

  describe("3. POST /api/v1/profile/avatar (updateAvatar)", () => {
    test("successfully updates user's avatar image", async () => {
      let avatarUpdate = null;
      User.findByIdAndUpdate = async (id, upd) => {
        avatarUpdate = upd.$set;
        return {
          _id: id,
          username: "alice",
          avatarImage: upd.$set.avatarImage,
          isAvatarImageSet: upd.$set.isAvatarImageSet,
        };
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "u_profile_123" },
          body: { image: "base64_avatar_string_here" },
        });

        await profileController.updateAvatar(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.isSet, true);
        assert.strictEqual(avatarUpdate.avatarImage, "base64_avatar_string_here");
      } finally {
        User.findByIdAndUpdate = origFindByIdAndUpdate;
      }
    });

    test("rejects missing avatar payload", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_profile_123" },
        body: {},
      });

      await profileController.updateAvatar(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });
  });

  describe("4. GET /api/v1/profile/:id (getUserPublicProfile)", () => {
    test("returns public profile without email or security fields", async () => {
      User.findById = (id) => ({
        select: async () => ({
          _id: id,
          username: "bob",
          displayName: "Bob Builder",
          avatarImage: "bob_avatar",
          isAvatarImageSet: true,
          bio: "Can we fix it?",
          statusMessage: "Yes we can!",
        }),
      });

      try {
        const { req, res, next, getNextError } = createMockHttp({
          params: { id: "u_bob_456" },
        });

        await profileController.getUserPublicProfile(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.profile.username, "bob");
        assert.strictEqual(res.body.profile.displayName, "Bob Builder");
        assert.strictEqual(res.body.profile.email, undefined);
      } finally {
        User.findById = origFindById;
      }
    });
  });
});
