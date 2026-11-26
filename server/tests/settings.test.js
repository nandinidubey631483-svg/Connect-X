/**
 * ConnectX Phase 5 Module 2: User Settings & Preferences Backend Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");

const UserSettings = require("../models/userSettingsModel");
const settingsController = require("../controllers/settingsController");
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

describe("ConnectX Phase 5 Module 2: User Settings & Preferences Tests", () => {
  let origFindOne, origCreate, origFindOneAndUpdate;

  beforeEach(() => {
    origFindOne = UserSettings.findOne;
    origCreate = UserSettings.create;
    origFindOneAndUpdate = UserSettings.findOneAndUpdate;
  });

  describe("1. GET /api/v1/settings (getSettings)", () => {
    test("returns existing settings for authenticated user", async () => {
      const mockSettings = {
        userId: "u_settings_1",
        notifications: {
          emailNotifications: true,
          pushNotifications: false,
          soundEnabled: true,
          desktopAlerts: false,
        },
        privacy: {
          lastSeenVisibility: "contacts",
          readReceiptsEnabled: true,
          typingIndicatorVisibility: false,
        },
        chat: {
          enterToSend: false,
          fontSize: "large",
          mediaAutoDownload: true,
          soundTheme: "subtle",
        },
        updatedAt: new Date(),
      };

      UserSettings.findOne = async (q) => {
        if (q.userId === "u_settings_1") return mockSettings;
        return null;
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "u_settings_1" },
        });

        await settingsController.getSettings(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.settings.notifications.pushNotifications, false);
        assert.strictEqual(res.body.settings.privacy.lastSeenVisibility, "contacts");
        assert.strictEqual(res.body.settings.chat.fontSize, "large");
      } finally {
        UserSettings.findOne = origFindOne;
      }
    });

    test("creates and returns default settings when no record exists", async () => {
      UserSettings.findOne = async () => null;
      let createdDoc = null;
      UserSettings.create = async (doc) => {
        createdDoc = { ...doc, updatedAt: new Date() };
        return createdDoc;
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "u_settings_new" },
        });

        await settingsController.getSettings(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.settings.notifications.emailNotifications, true);
        assert.strictEqual(res.body.settings.privacy.lastSeenVisibility, "everyone");
        assert.strictEqual(res.body.settings.chat.enterToSend, true);
        assert.strictEqual(createdDoc.userId, "u_settings_new");
      } finally {
        UserSettings.findOne = origFindOne;
        UserSettings.create = origCreate;
      }
    });

    test("fails with 401 TOKEN_MISSING if user context is missing", async () => {
      const { req, res, next, getNextError } = createMockHttp({ user: null });
      await settingsController.getSettings(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, "TOKEN_MISSING");
    });
  });

  describe("2. PUT /api/v1/settings (updateSettings)", () => {
    test("partially updates settings with valid values", async () => {
      let capturedUpdates = null;
      UserSettings.findOneAndUpdate = async (filter, update) => {
        capturedUpdates = update.$set;
        return {
          userId: filter.userId,
          notifications: {
            emailNotifications: false,
            pushNotifications: true,
            soundEnabled: true,
            desktopAlerts: true,
          },
          privacy: {
            lastSeenVisibility: "nobody",
            readReceiptsEnabled: true,
            typingIndicatorVisibility: true,
          },
          chat: {
            enterToSend: true,
            fontSize: "small",
            mediaAutoDownload: false,
            soundTheme: "none",
          },
          updatedAt: new Date(),
        };
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "u_settings_1" },
          body: {
            notifications: { emailNotifications: false },
            privacy: { lastSeenVisibility: "nobody" },
            chat: { fontSize: "small", mediaAutoDownload: false, soundTheme: "none" },
          },
        });

        await settingsController.updateSettings(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(capturedUpdates["notifications.emailNotifications"], false);
        assert.strictEqual(capturedUpdates["privacy.lastSeenVisibility"], "nobody");
        assert.strictEqual(capturedUpdates["chat.fontSize"], "small");
      } finally {
        UserSettings.findOneAndUpdate = origFindOneAndUpdate;
      }
    });

    test("rejects invalid enum values for privacy.lastSeenVisibility", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_settings_1" },
        body: { privacy: { lastSeenVisibility: "invalid_value" } },
      });

      await settingsController.updateSettings(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });

    test("rejects invalid enum values for chat.fontSize", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_settings_1" },
        body: { chat: { fontSize: "extra_huge" } },
      });

      await settingsController.updateSettings(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });

    test("rejects empty update payloads", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_settings_1" },
        body: {},
      });

      await settingsController.updateSettings(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });
  });

  describe("3. POST /api/v1/settings/reset (resetSettings)", () => {
    test("resets user settings to system defaults", async () => {
      let resetPayload = null;
      UserSettings.findOneAndUpdate = async (filter, update) => {
        resetPayload = update.$set;
        return {
          userId: filter.userId,
          ...settingsController.DEFAULT_SETTINGS,
          updatedAt: new Date(),
        };
      };

      try {
        const { req, res, next, getNextError } = createMockHttp({
          user: { userId: "u_settings_1" },
        });

        await settingsController.resetSettings(req, res, next);

        assert.strictEqual(getNextError(), null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.settings.privacy.lastSeenVisibility, "everyone");
        assert.strictEqual(res.body.settings.chat.fontSize, "medium");
        assert.deepStrictEqual(resetPayload, settingsController.DEFAULT_SETTINGS);
      } finally {
        UserSettings.findOneAndUpdate = origFindOneAndUpdate;
      }
    });
  });
});
