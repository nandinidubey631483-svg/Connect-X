/**
 * ConnectX Phase 5 Module 3: Distributed Presence & Heartbeat Engine Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

const { PresenceEngine, HEARTBEAT_TIMEOUT_MS } = require("../realtime/presenceEngine");

// Mock User Model
class MockUserModel {
  constructor() {
    this.users = new Map();
  }

  async findById(id) {
    return this.users.get(String(id)) || null;
  }

  async updateOne(filter, update) {
    const id = String(filter._id);
    const existing = this.users.get(id) || { _id: id };
    if (update.$set) {
      Object.assign(existing, update.$set);
    }
    this.users.set(id, existing);
    return { modifiedCount: 1 };
  }
}

// Mock UserSettings Model
class MockUserSettingsModel {
  constructor() {
    this.settings = new Map();
  }

  async findOne(filter) {
    return this.settings.get(String(filter.userId)) || null;
  }

  setSettings(userId, settingsObj) {
    this.settings.set(String(userId), settingsObj);
  }
}

// Mock Redis Client
class MockRedisClient {
  constructor() {
    this.sets = new Map();
    this.keys = new Map();
  }

  async sadd(key, val) {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    const s = this.sets.get(key);
    const initialSize = s.size;
    s.add(val);
    return s.size > initialSize ? 1 : 0;
  }

  async srem(key, val) {
    if (!this.sets.has(key)) return 0;
    const s = this.sets.get(key);
    const res = s.delete(val) ? 1 : 0;
    if (s.size === 0) this.sets.delete(key);
    return res;
  }

  async scard(key) {
    const s = this.sets.get(key);
    return s ? s.size : 0;
  }

  async set(key, val) {
    this.keys.set(key, String(val));
    return "OK";
  }

  async del(key) {
    const deleted = this.keys.delete(key) ? 1 : 0;
    return deleted;
  }
}

describe("ConnectX Phase 5 Module 3: Distributed Presence & Heartbeat Engine Tests", () => {
  let userModel;
  let userSettingsModel;
  let redisClient;
  let presence;

  beforeEach(() => {
    userModel = new MockUserModel();
    userSettingsModel = new MockUserSettingsModel();
    redisClient = new MockRedisClient();

    presence = new PresenceEngine({
      redisClient,
      userModel,
      userSettingsModel,
    });
  });

  afterEach(() => {
    presence.stopSweeper();
  });

  describe("1. Connection & Multi-Session Tracking", () => {
    test("first session registration marks user online in memory, Redis, and DB", async () => {
      const res = await presence.registerConnection("u_user_1", "sock_tab_1");

      assert.strictEqual(res.isFirstSession, true);
      assert.strictEqual(res.activeSocketsCount, 1);

      const isOnline = await presence.isUserOnline("u_user_1");
      assert.strictEqual(isOnline, true);

      // Verify DB record updated
      const dbUser = await userModel.findById("u_user_1");
      assert.ok(dbUser);
      assert.strictEqual(dbUser.isOnline, true);
      assert.ok(dbUser.lastSeen instanceof Date);
    });

    test("multiple tabs/sessions for same user does not treat second connection as first session", async () => {
      await presence.registerConnection("u_user_1", "sock_tab_1");
      const secondRes = await presence.registerConnection("u_user_1", "sock_tab_2");

      assert.strictEqual(secondRes.isFirstSession, false);
      assert.strictEqual(secondRes.activeSocketsCount, 2);

      const isOnline = await presence.isUserOnline("u_user_1");
      assert.strictEqual(isOnline, true);
    });

    test("disconnecting one of multiple sessions leaves user online", async () => {
      await presence.registerConnection("u_user_1", "sock_tab_1");
      await presence.registerConnection("u_user_1", "sock_tab_2");

      const unreg1 = await presence.unregisterConnection("u_user_1", "sock_tab_1");
      assert.strictEqual(unreg1.isLastSession, false);
      assert.strictEqual(unreg1.activeSocketsCount, 1);

      const isOnline = await presence.isUserOnline("u_user_1");
      assert.strictEqual(isOnline, true);

      // DB remains online
      const dbUser = await userModel.findById("u_user_1");
      assert.strictEqual(dbUser.isOnline, true);
    });

    test("closing last remaining session unregisters user and marks offline in DB with lastSeen", async () => {
      await presence.registerConnection("u_user_1", "sock_tab_1");

      const unreg = await presence.unregisterConnection("u_user_1", "sock_tab_1");
      assert.strictEqual(unreg.isLastSession, true);
      assert.strictEqual(unreg.activeSocketsCount, 0);

      const isOnline = await presence.isUserOnline("u_user_1");
      assert.strictEqual(isOnline, false);

      const dbUser = await userModel.findById("u_user_1");
      assert.strictEqual(dbUser.isOnline, false);
      assert.ok(dbUser.lastSeen instanceof Date);
    });
  });

  describe("2. Heartbeat & Stale Session Sweeper", () => {
    test("recordHeartbeat updates socket and user heartbeat timestamps", async () => {
      await presence.registerConnection("u_user_1", "sock_1");
      const recorded = await presence.recordHeartbeat("sock_1");
      assert.strictEqual(recorded, true);

      const falseRecorded = await presence.recordHeartbeat("nonexistent_socket");
      assert.strictEqual(falseRecorded, false);
    });

    test("sweepStaleSessions cleans up sockets that exceed heartbeat timeout", async () => {
      await presence.registerConnection("u_user_stale", "sock_stale_1");

      // Artificially age the heartbeat past HEARTBEAT_TIMEOUT_MS
      const meta = presence.socketMeta.get("sock_stale_1");
      meta.lastHeartbeat = Date.now() - (HEARTBEAT_TIMEOUT_MS + 5000);

      const emittedUpdates = [];
      const mockIo = {
        emit: (event, payload) => {
          emittedUpdates.push({ event, payload });
        },
      };

      const sweptCount = await presence.sweepStaleSessions(mockIo);
      assert.strictEqual(sweptCount, 1);

      const isOnline = await presence.isUserOnline("u_user_stale");
      assert.strictEqual(isOnline, false);

      assert.strictEqual(emittedUpdates.length, 1);
      assert.strictEqual(emittedUpdates[0].event, "presence:update");
      assert.strictEqual(emittedUpdates[0].payload.userId, "u_user_stale");
      assert.strictEqual(emittedUpdates[0].payload.isOnline, false);
    });
  });

  describe("3. Privacy-Aware Presence & Last-Seen Rules", () => {
    test("self presence query is always visible regardless of privacy settings", async () => {
      userSettingsModel.setSettings("u_self", {
        privacy: { lastSeenVisibility: "nobody" },
      });
      await presence.registerConnection("u_self", "sock_self_1");

      const info = await presence.getSanitizedPresence("u_self", "u_self");
      assert.strictEqual(info.isVisible, true);
      assert.strictEqual(info.isOnline, true);
      assert.ok(info.lastSeen);
    });

    test("target with lastSeenVisibility = 'nobody' hides online status and lastSeen from other users", async () => {
      userSettingsModel.setSettings("u_target_private", {
        privacy: { lastSeenVisibility: "nobody" },
      });
      await presence.registerConnection("u_target_private", "sock_priv_1");

      const info = await presence.getSanitizedPresence("u_target_private", "u_observer_1");
      assert.strictEqual(info.isVisible, false);
      assert.strictEqual(info.isOnline, false);
      assert.strictEqual(info.lastSeen, null);
    });

    test("target with lastSeenVisibility = 'everyone' reveals presence and lastSeen to observers", async () => {
      userSettingsModel.setSettings("u_target_public", {
        privacy: { lastSeenVisibility: "everyone" },
      });
      await presence.registerConnection("u_target_public", "sock_pub_1");

      const info = await presence.getSanitizedPresence("u_target_public", "u_observer_1");
      assert.strictEqual(info.isVisible, true);
      assert.strictEqual(info.isOnline, true);
      assert.ok(info.lastSeen);
    });
  });

  describe("4. Distributed Fail-Safe Redis Fallback", () => {
    test("continues tracking presence in memory even if Redis fails", async () => {
      const brokenRedis = {
        sadd: async () => {
          throw new Error("Redis cluster down");
        },
        srem: async () => {
          throw new Error("Redis cluster down");
        },
        scard: async () => {
          throw new Error("Redis cluster down");
        },
        set: async () => {
          throw new Error("Redis cluster down");
        },
        del: async () => {
          throw new Error("Redis cluster down");
        },
      };

      const failSafePresence = new PresenceEngine({
        redisClient: brokenRedis,
        userModel,
        userSettingsModel,
      });

      const reg = await failSafePresence.registerConnection("u_fallback", "sock_fb_1");
      assert.strictEqual(reg.isFirstSession, true);

      const isOnline = await failSafePresence.isUserOnline("u_fallback");
      assert.strictEqual(isOnline, true);

      const unreg = await failSafePresence.unregisterConnection("u_fallback", "sock_fb_1");
      assert.strictEqual(unreg.isLastSession, true);
    });
  });
});
