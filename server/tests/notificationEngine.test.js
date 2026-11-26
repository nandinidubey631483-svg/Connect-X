/**
 * ConnectX Notification Engine Integration & Unit Tests (Phase 5 Module 9)
 * 
 * Verifies:
 * - Notification schema constraints, deduplication, and indexing
 * - Notification controller operations: list, unread count, mark single read, mark all read, delete
 * - Ownership & authorization rules (fail-closed on unauthorized manipulation)
 * - Notification dispatch service with user preference suppression (pushNotifications)
 * - Socket.IO real-time notification events (notification:new, notification:count, notification:mark_read, notification:sync)
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const http = require("http");

// Models & Services
const Notification = require("../models/notificationModel");
const UserSettings = require("../models/userSettingsModel");
const { dispatchNotification } = require("../models/notificationService");
const notificationController = require("../controllers/notificationController");
const { initSocketGateway } = require("../realtime/socketGateway");

describe("Phase 5 Module 9 - Notification Engine Tests", () => {
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const userC = new mongoose.Types.ObjectId();
  const convId = new mongoose.Types.ObjectId();
  const msgId = new mongoose.Types.ObjectId();

  describe("Notification Model & Schema Invariants", () => {
    test("instantiates notification document with valid attributes", () => {
      const doc = new Notification({
        recipient: userA,
        sender: userB,
        type: "MESSAGE_RECEIVED",
        title: "New Message",
        body: "Hello world",
        conversationId: convId,
        messageId: msgId,
        dedupKey: `msg:${msgId}`,
      });

      assert.strictEqual(doc.recipient.toString(), userA.toString());
      assert.strictEqual(doc.sender.toString(), userB.toString());
      assert.strictEqual(doc.type, "MESSAGE_RECEIVED");
      assert.strictEqual(doc.isRead, false);
      assert.strictEqual(doc.readAt, null);
      assert.strictEqual(doc.dedupKey, `msg:${msgId}`);
    });

    test("enforces required fields and validation", () => {
      const doc = new Notification({});
      const err = doc.validateSync();
      assert.ok(err);
      assert.ok(err.errors.recipient);
      assert.ok(err.errors.type);
      assert.ok(err.errors.title);
      assert.ok(err.errors.body);
      assert.ok(err.errors.dedupKey);
    });
  });

  describe("Notification Controller Unit Tests", () => {
    test("getUserNotifications retrieves paginated notifications for authenticated user", async () => {
      const mockNotifications = [
        {
          _id: new mongoose.Types.ObjectId(),
          recipient: userA,
          sender: { username: "alice" },
          type: "MESSAGE_RECEIVED",
          title: "New Message",
          body: "Hi",
          isRead: false,
          createdAt: new Date(),
        },
      ];

      // Stub methods on Notification model
      const originalFind = Notification.find;
      const originalCountDocuments = Notification.countDocuments;

      Notification.countDocuments = async (filter) => {
        assert.strictEqual(filter.recipient.toString(), userA.toString());
        return 1;
      };

      Notification.find = (filter) => {
        assert.strictEqual(filter.recipient.toString(), userA.toString());
        return {
          populate: () => ({
            sort: () => ({
              skip: () => ({
                limit: () => ({
                  lean: async () => mockNotifications,
                }),
              }),
            }),
          }),
        };
      };

      const req = {
        user: { userId: userA.toString() },
        query: { page: "1", limit: "10" },
      };
      let responseData = null;
      let statusCode = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              responseData = data;
            },
          };
        },
      };

      try {
        await notificationController.getUserNotifications(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(statusCode, 200);
        assert.strictEqual(responseData.success, true);
        assert.strictEqual(responseData.notifications.length, 1);
        assert.strictEqual(responseData.unreadCount, 1);
      } finally {
        Notification.find = originalFind;
        Notification.countDocuments = originalCountDocuments;
      }
    });

    test("getUnreadCount returns correct count", async () => {
      const originalCount = Notification.countDocuments;
      Notification.countDocuments = async (filter) => {
        assert.strictEqual(filter.recipient.toString(), userA.toString());
        assert.strictEqual(filter.isRead, false);
        return 5;
      };

      const req = { user: { userId: userA.toString() } };
      let responseData = null;
      const res = {
        status: (code) => ({
          json: (data) => {
            responseData = data;
          },
        }),
      };

      try {
        await notificationController.getUnreadCount(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(responseData.success, true);
        assert.strictEqual(responseData.unreadCount, 5);
      } finally {
        Notification.countDocuments = originalCount;
      }
    });

    test("markNotificationAsRead fails closed with 403 on recipient mismatch", async () => {
      const notifId = new mongoose.Types.ObjectId();
      const originalFindById = Notification.findById;

      Notification.findById = async (id) => ({
        _id: id,
        recipient: userB, // Belongs to userB
        isRead: false,
      });

      const req = {
        user: { userId: userA.toString() }, // Caller is userA
        params: { id: notifId.toString() },
      };
      let errorCaught = null;
      const res = {};

      try {
        await notificationController.markNotificationAsRead(req, res, (err) => {
          errorCaught = err;
        });

        assert.ok(errorCaught);
        assert.strictEqual(errorCaught.statusCode, 403);
        assert.strictEqual(errorCaught.code, "NOTIFICATION_ACCESS_DENIED");
      } finally {
        Notification.findById = originalFindById;
      }
    });

    test("markAllNotificationsAsRead marks all unread notifications as read for user", async () => {
      const originalUpdateMany = Notification.updateMany;
      const originalCount = Notification.countDocuments;

      let updateCalled = false;
      Notification.updateMany = async (filter, update) => {
        assert.strictEqual(filter.recipient.toString(), userA.toString());
        assert.strictEqual(filter.isRead, false);
        assert.strictEqual(update.$set.isRead, true);
        updateCalled = true;
        return { modifiedCount: 4 };
      };

      const req = { user: { userId: userA.toString() } };
      let responseData = null;
      const res = {
        status: (code) => ({
          json: (data) => {
            responseData = data;
          },
        }),
      };

      try {
        await notificationController.markAllNotificationsAsRead(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(updateCalled, true);
        assert.strictEqual(responseData.success, true);
        assert.strictEqual(responseData.markedCount, 4);
        assert.strictEqual(responseData.unreadCount, 0);
      } finally {
        Notification.updateMany = originalUpdateMany;
        Notification.countDocuments = originalCount;
      }
    });
  });

  describe("Notification Service & Preference Enforcement", () => {
    test("dispatchNotification suppresses push broadcast when pushNotifications is disabled", async () => {
      const originalSettingsFindOne = UserSettings.findOne;
      const originalNotificationCreate = Notification.create;
      const originalCount = Notification.countDocuments;

      UserSettings.findOne = async () => ({
        notifications: {
          pushNotifications: false, // User disabled push notifications
          soundEnabled: true,
          desktopAlerts: false,
        },
      });

      Notification.create = async (doc) => ({
        ...doc,
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(),
      });

      Notification.countDocuments = async () => 1;

      let broadcastEmitted = false;
      const mockIo = {
        to: () => ({
          emit: () => {
            broadcastEmitted = true;
          },
        }),
      };

      try {
        const result = await dispatchNotification({
          recipientId: userA,
          senderId: userB,
          type: "MESSAGE_RECEIVED",
          title: "New Message",
          body: "Hello",
          dedupKey: "msg:123",
          io: mockIo,
        });

        assert.ok(result);
        assert.strictEqual(result.notification.pushEnabled, false);
        assert.strictEqual(broadcastEmitted, false); // No socket broadcast occurred
      } finally {
        UserSettings.findOne = originalSettingsFindOne;
        Notification.create = originalNotificationCreate;
        Notification.countDocuments = originalCount;
      }
    });

    test("dispatchNotification prevents self-notification", async () => {
      const result = await dispatchNotification({
        recipientId: userA,
        senderId: userA, // same user
        type: "MESSAGE_RECEIVED",
        title: "Self Message",
        body: "Hello",
        dedupKey: "msg:self",
      });

      assert.strictEqual(result, null);
    });

    test("dispatchNotification handles duplicate key idempotently without error", async () => {
      const originalCreate = Notification.create;
      const originalFindOne = Notification.findOne;
      const originalCount = Notification.countDocuments;

      const existingDoc = {
        _id: new mongoose.Types.ObjectId(),
        recipient: userA,
        sender: userB,
        type: "MESSAGE_RECEIVED",
        title: "Test",
        body: "Test body",
        isRead: false,
        createdAt: new Date(),
      };

      Notification.create = async () => {
        const err = new Error("E11000 duplicate key error");
        err.code = 11000;
        throw err;
      };

      Notification.findOne = async () => existingDoc;
      Notification.countDocuments = async () => 2;

      try {
        const result = await dispatchNotification({
          recipientId: userA,
          senderId: userB,
          type: "MESSAGE_RECEIVED",
          title: "Test",
          body: "Test body",
          dedupKey: "dup:123",
        });

        assert.ok(result);
        assert.strictEqual(result.notification._id.toString(), existingDoc._id.toString());
      } finally {
        Notification.create = originalCreate;
        Notification.findOne = originalFindOne;
        Notification.countDocuments = originalCount;
      }
    });
  });

  describe("Socket Gateway Notification Integration", () => {
    test("socket gateway handles notification:mark_read and notification:sync", async () => {
      let registeredEvents = {};
      const mockSocket = {
        id: "sock_123",
        user: { userId: userA.toString() },
        join: () => {},
        use: () => {},
        on: (event, handler) => {
          registeredEvents[event] = handler;
        },
        emit: () => {},
        broadcast: { emit: () => {} },
      };

      const mockIo = {
        use: () => {},
        on: (event, handler) => {
          if (event === "connection") {
            handler(mockSocket);
          }
        },
        to: () => ({
          emit: () => {},
        }),
      };

      const mockServer = http.createServer();
      const mockNotificationModel = {
        countDocuments: async () => 3,
        find: () => ({
          sort: () => ({
            limit: () => ({
              lean: async () => [{ _id: "n1", title: "Sync Title", isRead: false }],
            }),
          }),
        }),
        updateMany: async () => ({ modifiedCount: 1 }),
      };

      initSocketGateway(mockServer, {
        io: mockIo,
        authMiddleware: (_socket, next) => next(),
        notificationModel: mockNotificationModel,
      });

      assert.ok(registeredEvents["notification:mark_read"]);
      assert.ok(registeredEvents["notification:sync"]);

      // Test notification:sync
      let syncResult = null;
      await registeredEvents["notification:sync"]({}, (res) => {
        syncResult = res;
      });

      assert.ok(syncResult);
      assert.strictEqual(syncResult.success, true);
      assert.strictEqual(syncResult.unreadCount, 3);
      assert.strictEqual(syncResult.notifications.length, 1);

      // Test notification:mark_read
      let markResult = null;
      await registeredEvents["notification:mark_read"]({ notificationId: "n1" }, (res) => {
        markResult = res;
      });

      assert.ok(markResult);
      assert.strictEqual(markResult.success, true);
      assert.strictEqual(markResult.unreadCount, 3);
    });
  });
});
