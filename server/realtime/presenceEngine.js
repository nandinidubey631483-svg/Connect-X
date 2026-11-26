/**
 * ConnectX Distributed Presence & Heartbeat Engine
 * 
 * Manages:
 * - Online / Offline status with multi-socket tracking per user
 * - Heartbeat pulse with configurable timeout window (default: 30s TTL)
 * - Last-seen timestamp persistence in MongoDB
 * - Distributed presence coordination via Redis (when available) with in-memory fallback
 * - Privacy-aware presence dispatch (filters lastSeen and online indicators according to privacy settings)
 */
const User = require("../models/userModel");
const UserSettings = require("../models/userSettingsModel");

const HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds
const HEARTBEAT_TIMEOUT_MS = 35000;  // 35 seconds

class PresenceEngine {
  constructor({ redisClient = null, userModel = User, userSettingsModel = UserSettings } = {}) {
    this.redisClient = redisClient;
    this.UserModel = userModel;
    this.UserSettingsModel = userSettingsModel;

    // In-memory fallback structures:
    // userId -> Set<socketId>
    this.userSockets = new Map();
    // socketId -> { userId, lastHeartbeat: timestamp }
    this.socketMeta = new Map();
    // userId -> lastHeartbeat: timestamp
    this.userHeartbeats = new Map();

    this._sweepInterval = null;
  }

  /**
   * Starts periodic background heartbeat sweeper
   */
  startSweeper(intervalMs = 10000, io = null) {
    if (this._sweepInterval) return;
    this._sweepInterval = setInterval(async () => {
      await this.sweepStaleSessions(io);
    }, intervalMs);
    if (this._sweepInterval.unref) {
      this._sweepInterval.unref();
    }
  }

  /**
   * Stops heartbeat sweeper
   */
  stopSweeper() {
    if (this._sweepInterval) {
      clearInterval(this._sweepInterval);
      this._sweepInterval = null;
    }
  }

  /**
   * Registers a socket connection for an authenticated user.
   * Returns { isFirstSession: boolean, activeSocketsCount: number }
   */
  async registerConnection(userId, socketId) {
    if (!userId || !socketId) return { isFirstSession: false, activeSocketsCount: 0 };
    const uId = String(userId);
    const now = Date.now();

    let isFirstSession = false;

    // In-memory registration
    if (!this.userSockets.has(uId)) {
      this.userSockets.set(uId, new Set());
      isFirstSession = true;
    }
    const set = this.userSockets.get(uId);
    set.add(socketId);
    this.socketMeta.set(socketId, { userId: uId, lastHeartbeat: now });
    this.userHeartbeats.set(uId, now);

    // Redis distributed registration if available
    if (this.redisClient && typeof this.redisClient.sadd === "function") {
      try {
        const added = await this.redisClient.sadd(`presence:user:${uId}`, socketId);
        await this.redisClient.set(`presence:heartbeat:${uId}`, String(now));
        await this.redisClient.set(`presence:socket:${socketId}`, uId);
        // If set was empty before, this is first session across nodes
        if (added === 1 && set.size === 1) {
          isFirstSession = true;
        }
      } catch (err) {
        console.warn("⚠️ Redis presence registration error, using memory fallback:", err.message);
      }
    }

    // Persist online state if first session
    if (isFirstSession && this.UserModel && typeof this.UserModel.updateOne === "function") {
      try {
        await this.UserModel.updateOne(
          { _id: uId },
          { $set: { isOnline: true, lastSeen: new Date(now) } }
        );
      } catch (dbErr) {
        console.error("❌ Failed to update user online status:", dbErr.message);
      }
    }

    return {
      isFirstSession,
      activeSocketsCount: set.size,
    };
  }

  /**
   * Records a heartbeat ping from a connected socket.
   */
  async recordHeartbeat(socketId) {
    const meta = this.socketMeta.get(socketId);
    if (!meta) return false;

    const now = Date.now();
    meta.lastHeartbeat = now;
    this.userHeartbeats.set(meta.userId, now);

    if (this.redisClient && typeof this.redisClient.set === "function") {
      try {
        await this.redisClient.set(`presence:heartbeat:${meta.userId}`, String(now));
      } catch (_) {}
    }
    return true;
  }

  /**
   * Registers a socket disconnection.
   * Returns { isLastSession: boolean, lastSeenDate: Date, activeSocketsCount: number }
   */
  async unregisterConnection(userId, socketId) {
    const uId = String(userId);
    const now = new Date();

    let isLastSession = false;
    let activeSocketsCount = 0;

    this.socketMeta.delete(socketId);

    const set = this.userSockets.get(uId);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) {
        this.userSockets.delete(uId);
        this.userHeartbeats.delete(uId);
        isLastSession = true;
      } else {
        activeSocketsCount = set.size;
      }
    } else {
      isLastSession = true;
    }

    if (this.redisClient) {
      try {
        if (typeof this.redisClient.srem === "function") {
          await this.redisClient.srem(`presence:user:${uId}`, socketId);
        }
        if (typeof this.redisClient.del === "function") {
          await this.redisClient.del(`presence:socket:${socketId}`);
        }
        if (typeof this.redisClient.scard === "function") {
          const remaining = await this.redisClient.scard(`presence:user:${uId}`);
          if (remaining === 0) {
            isLastSession = true;
            await this.redisClient.del(`presence:heartbeat:${uId}`);
          } else {
            isLastSession = false;
            activeSocketsCount = remaining;
          }
        }
      } catch (err) {
        console.warn("⚠️ Redis presence unregister error:", err.message);
      }
    }

    if (isLastSession && this.UserModel && typeof this.UserModel.updateOne === "function") {
      try {
        await this.UserModel.updateOne(
          { _id: uId },
          { $set: { isOnline: false, lastSeen: now } }
        );
      } catch (dbErr) {
        console.error("❌ Failed to update user offline status:", dbErr.message);
      }
    }

    return {
      isLastSession,
      lastSeenDate: now,
      activeSocketsCount,
    };
  }

  /**
   * Checks if a user is currently online.
   */
  async isUserOnline(userId) {
    const uId = String(userId);
    const set = this.userSockets.get(uId);
    if (set && set.size > 0) return true;

    if (this.redisClient && typeof this.redisClient.scard === "function") {
      try {
        const count = await this.redisClient.scard(`presence:user:${uId}`);
        if (count > 0) return true;
      } catch (_) {}
    }
    return false;
  }

  /**
   * Sweeps stale connections that missed heartbeats beyond timeout window.
   */
  async sweepStaleSessions(io = null) {
    const now = Date.now();
    const staleSockets = [];

    for (const [socketId, meta] of this.socketMeta.entries()) {
      if (now - meta.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        staleSockets.push({ socketId, userId: meta.userId });
      }
    }

    for (const item of staleSockets) {
      const { isLastSession, lastSeenDate } = await this.unregisterConnection(item.userId, item.socketId);
      if (isLastSession && io) {
        io.emit("presence:update", {
          userId: item.userId,
          isOnline: false,
          lastSeen: lastSeenDate,
        });
      }
    }

    return staleSockets.length;
  }

  /**
   * Returns privacy-filtered presence info for a target user viewed by an observer.
   */
  async getSanitizedPresence(targetUserId, observerUserId) {
    const isOnline = await this.isUserOnline(targetUserId);

    let lastSeen = null;
    let visibility = "everyone";

    if (this.UserSettingsModel && typeof this.UserSettingsModel.findOne === "function") {
      try {
        const settings = await this.UserSettingsModel.findOne({ userId: targetUserId });
        if (settings && settings.privacy && settings.privacy.lastSeenVisibility) {
          visibility = settings.privacy.lastSeenVisibility;
        }
      } catch (_) {}
    }

    // Always fetch lastSeen from DB if target exists
    if (this.UserModel && typeof this.UserModel.findById === "function") {
      try {
        const user = await this.UserModel.findById(targetUserId);
        if (user) lastSeen = user.lastSeen;
      } catch (_) {}
    }

    // Apply Privacy Rules
    // 1. If self: always visible
    if (String(targetUserId) === String(observerUserId)) {
      return { isOnline, lastSeen, isVisible: true };
    }

    // 2. If 'nobody': hide lastSeen
    if (visibility === "nobody") {
      return { isOnline: false, lastSeen: null, isVisible: false };
    }

    // 3. If 'contacts' or 'everyone': allow lastSeen
    return {
      isOnline,
      lastSeen,
      isVisible: true,
    };
  }
}

// Singleton Engine Instance
const presenceEngine = new PresenceEngine();

module.exports = {
  PresenceEngine,
  presenceEngine,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
};
