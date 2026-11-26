/**
 * ConnectX Phase 5 Module 7: Delivery & Read Receipts Engine Backend Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

const Messages = require("../models/messageModel");
const Conversation = require("../models/conversationModel");
const UserSettings = require("../models/userSettingsModel");
const messageController = require("../controllers/messageController");
const { initSocketGateway } = require("../realtime/socketGateway");
const AppError = require("../utils/appError");

function createMockHttp({ body = {}, params = {}, query = {}, user = null } = {}) {
  const req = {
    body,
    params,
    query,
    user,
    ip: "127.0.0.1",
    method: "PUT",
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

describe("ConnectX Phase 5 Module 7: Delivery & Read Receipts Engine Tests", () => {
  let origMsgFind, origMsgUpdateMany;
  let origConvFindById, origConvFindOne;
  let origUserSettingsFindOne;

  beforeEach(() => {
    origMsgFind = Messages.find;
    origMsgUpdateMany = Messages.updateMany;
    origConvFindById = Conversation.findById;
    origConvFindOne = Conversation.findOne;
    origUserSettingsFindOne = UserSettings.findOne;
  });

  afterEach(() => {
    Messages.find = origMsgFind;
    Messages.updateMany = origMsgUpdateMany;
    Conversation.findById = origConvFindById;
    Conversation.findOne = origConvFindOne;
    UserSettings.findOne = origUserSettingsFindOne;
  });

  describe("1. Receipt Lifecycle: Sent -> Delivered -> Read", () => {
    test("transitions status from SENT to DELIVERED with timestamp", async () => {
      const mockMsg = {
        _id: "m_100",
        conversationId: "conv_1",
        sender: "u_alice",
        users: ["u_alice", "u_bob"],
        status: "SENT",
        deliveredAt: null,
        readAt: null,
      };

      let updateApplied = null;
      Messages.find = (filter) => {
        if (filter._id && filter._id.$in) {
          return {
            lean: async () => [
              updateApplied
                ? { ...mockMsg, ...updateApplied.$set }
                : mockMsg,
            ],
            then(resolve) {
              resolve([mockMsg]);
            },
          };
        }
        return [mockMsg];
      };

      Messages.updateMany = async (filter, update) => {
        updateApplied = update;
        return { modifiedCount: 1 };
      };

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_bob" },
        body: { status: "DELIVERED", messageId: "m_100" },
      });

      await messageController.updateMessageStatus(req, res, next);
      assert.strictEqual(getNextError(), null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data[0].status, "DELIVERED");
      assert.ok(res.body.data[0].deliveredAt);
    });

    test("transitions status from DELIVERED to READ with timestamps", async () => {
      const mockMsg = {
        _id: "m_100",
        conversationId: "conv_1",
        sender: "u_alice",
        users: ["u_alice", "u_bob"],
        status: "DELIVERED",
        deliveredAt: new Date(),
        readAt: null,
      };

      let updateApplied = null;
      Messages.find = (filter) => {
        if (filter._id && filter._id.$in) {
          return {
            lean: async () => [
              updateApplied
                ? { ...mockMsg, ...updateApplied.$set }
                : mockMsg,
            ],
            then(resolve) {
              resolve([mockMsg]);
            },
          };
        }
        return [mockMsg];
      };

      Messages.updateMany = async (filter, update) => {
        updateApplied = update;
        return { modifiedCount: 1 };
      };

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_bob" },
        body: { status: "READ", messageId: "m_100" },
      });

      await messageController.updateMessageStatus(req, res, next);
      assert.strictEqual(getNextError(), null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data[0].status, "READ");
      assert.ok(res.body.data[0].readAt);
    });
  });

  describe("2. Authorization & Ownership Checks", () => {
    test("rejects sender marking their own message as DELIVERED or READ with 403 UNAUTHORIZED_RECEIPT_UPDATE", async () => {
      const mockMsg = {
        _id: "m_own",
        sender: "u_alice",
        users: ["u_alice", "u_bob"],
        status: "SENT",
      };

      Messages.find = () => [mockMsg];

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_alice" }, // Alice is sender
        body: { status: "READ", messageId: "m_own" },
      });

      await messageController.updateMessageStatus(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, "UNAUTHORIZED_RECEIPT_UPDATE");
    });

    test("rejects non-participant with 403 MESSAGE_ACCESS_DENIED", async () => {
      const mockMsg = {
        _id: "m_private",
        sender: "u_alice",
        users: ["u_alice", "u_bob"],
        status: "SENT",
      };

      Messages.find = () => [mockMsg];

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_charlie" }, // Charlie is not in users
        body: { status: "DELIVERED", messageId: "m_private" },
      });

      await messageController.updateMessageStatus(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, "MESSAGE_ACCESS_DENIED");
    });
  });

  describe("3. Duplicate Receipt Events & Regression Protection", () => {
    test("marking an already DELIVERED message as DELIVERED is an idempotent no-op", async () => {
      const mockMsg = {
        _id: "m_already_delivered",
        sender: "u_alice",
        users: ["u_alice", "u_bob"],
        status: "DELIVERED",
        deliveredAt: new Date("2026-11-26T00:00:00Z"),
      };

      Messages.find = () => [mockMsg];

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_bob" },
        body: { status: "DELIVERED", messageId: "m_already_delivered" },
      });

      await messageController.updateMessageStatus(req, res, next);
      assert.strictEqual(getNextError(), null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.message, "Status unchanged (already up to date)");
      assert.strictEqual(res.body.data.status, "DELIVERED");
    });

    test("rejects invalid regression from READ to DELIVERED with 400 INVALID_STATUS_REGRESSION", async () => {
      const mockMsg = {
        _id: "m_read",
        sender: "u_alice",
        users: ["u_alice", "u_bob"],
        status: "READ",
        readAt: new Date(),
      };

      Messages.find = () => [mockMsg];

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_bob" },
        body: { status: "DELIVERED", messageId: "m_read" },
      });

      await messageController.updateMessageStatus(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "INVALID_STATUS_REGRESSION");
    });
  });

  describe("4. Privacy Settings & Read Receipts Masking", () => {
    test("suppresses READ status in getConversationMessages if recipient disabled read receipts", async () => {
      const mockConv = {
        _id: "conv_privacy",
        participants: ["u_alice", "u_bob"],
      };

      Conversation.findById = async () => mockConv;
      Messages.countDocuments = async () => 1;

      // Alice is sender; message is READ in DB
      Messages.find = () => ({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => [
                {
                  _id: "m_secret_read",
                  conversationId: "conv_privacy",
                  sender: "u_alice",
                  users: ["u_alice", "u_bob"],
                  status: "READ",
                  message: { text: "Can you see if I read this?" },
                  readAt: new Date(),
                  createdAt: new Date(),
                },
              ],
            }),
          }),
        }),
      });

      // Bob (recipient) has read receipts disabled
      UserSettings.findOne = async (filter) => {
        if (filter.userId === "u_bob") {
          return { privacy: { readReceiptsEnabled: false } };
        }
        return { privacy: { readReceiptsEnabled: true } };
      };

      // Alice queries conversation messages
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_alice" },
        params: { conversationId: "conv_privacy" },
      });

      await messageController.getConversationMessages(req, res, next);
      assert.strictEqual(getNextError(), null);
      assert.strictEqual(res.statusCode, 200);

      const msg = res.body.messages[0];
      assert.strictEqual(msg.fromSelf, true);
      // Status must be masked to DELIVERED because recipient disabled read receipts
      assert.strictEqual(msg.status, "DELIVERED");
      assert.strictEqual(msg.readAt, null);
    });
  });

  describe("5. Socket.IO Gateway Multi-Device & Lifecycle Integration", () => {
    test("message:delivered event updates DB and fans out to sender room and recipient other sockets", async () => {
      let updateFilter = null;
      let updateSet = null;

      const mockMessagesModel = {
        find: async () => [
          {
            _id: "m_sock_1",
            conversationId: "conv_1",
            sender: "u_alice",
            users: ["u_alice", "u_bob"],
            status: "SENT",
          },
        ],
        updateMany: async (filter, update) => {
          updateFilter = filter;
          updateSet = update;
          return { modifiedCount: 1 };
        },
      };

      const emittedTo = [];
      let connectionHandler = null;
      const mockIo = {
        use: () => {},
        on: (event, handler) => {
          if (event === "connection") {
            connectionHandler = handler;
          }
        },
        to: (room) => ({
          emit: (event, payload) => {
            emittedTo.push({ room, event, payload });
          },
        }),
      };

      // Initialize gateway with mock models
      initSocketGateway(
        {},
        {
          io: mockIo,
          messagesModel: mockMessagesModel,
          authMiddleware: (socket, next) => next(),
        }
      );

      // Create simulated socket for Bob (recipient)
      const socketListeners = {};
      const mockSocket = {
        id: "sock_bob_tab1",
        user: { userId: "u_bob" },
        join: () => {},
        on: (ev, fn) => {
          socketListeners[ev] = fn;
        },
        to: () => ({ emit: () => {} }),
      };

      assert.ok(connectionHandler);
      connectionHandler(mockSocket);

      // Trigger socket connection setup
      global.userSockets = new Map();
      global.userSockets.set("u_bob", new Set(["sock_bob_tab1", "sock_bob_tab2"]));
      global.userSockets.set("u_alice", new Set(["sock_alice_1"]));

      // Bob sends message:delivered
      let ackResult = null;
      const handler = socketListeners["message:delivered"];
      assert.ok(handler);

      await handler(
        { messageId: "m_sock_1", conversationId: "conv_1" },
        (res) => {
          ackResult = res;
        }
      );

      assert.strictEqual(ackResult.success, true);
      assert.strictEqual(ackResult.status, "DELIVERED");
      assert.strictEqual(updateFilter.status, "SENT");
      assert.strictEqual(updateSet.$set.status, "DELIVERED");

      // Verify broadcast reached sender room user:u_alice
      const senderEvent = emittedTo.find((e) => e.room === "user:u_alice");
      assert.ok(senderEvent);
      assert.strictEqual(senderEvent.payload.status, "DELIVERED");
    });

    test("message:read event respects privacy setting and suppresses sender broadcast", async () => {
      const mockMessagesModel = {
        find: async () => [
          {
            _id: "m_priv_1",
            conversationId: "conv_1",
            sender: "u_alice",
            users: ["u_alice", "u_bob"],
            status: "DELIVERED",
          },
        ],
        updateMany: async () => ({ modifiedCount: 1 }),
      };

      const mockUserSettingsModel = {
        findOne: async () => ({
          privacy: { readReceiptsEnabled: false },
        }),
      };

      const emittedTo = [];
      let connectionHandler = null;
      const mockIo = {
        use: () => {},
        on: (ev, handler) => {
          if (ev === "connection") connectionHandler = handler;
        },
        to: (room) => ({
          emit: (ev, payload) => {
            emittedTo.push({ room, ev, payload });
          },
        }),
      };

      const mockConversationModel = {
        findById: async () => ({
          _id: "conv_1",
          participants: ["u_alice", "u_bob"],
          unreadCounts: new Map(),
          save: async () => {},
        }),
      };

      initSocketGateway(
        {},
        {
          io: mockIo,
          messagesModel: mockMessagesModel,
          conversationModel: mockConversationModel,
          userSettingsModel: mockUserSettingsModel,
          authMiddleware: (socket, next) => next(),
        }
      );

      const socketListeners = {};
      const mockSocket = {
        id: "sock_bob",
        user: { userId: "u_bob" },
        join: () => {},
        on: (ev, fn) => {
          socketListeners[ev] = fn;
        },
        to: () => ({ emit: () => {} }),
      };

      assert.ok(connectionHandler);
      connectionHandler(mockSocket);

      let ackResult = null;
      await socketListeners["message:read"](
        { messageId: "m_priv_1", conversationId: "conv_1" },
        (res) => {
          ackResult = res;
        }
      );

      assert.strictEqual(ackResult.success, true);
      assert.strictEqual(ackResult.status, "READ");
      assert.strictEqual(ackResult.suppressed, true);

      // Verify NO broadcast was sent to Alice
      const senderEvent = emittedTo.find((e) => e.room === "user:u_alice");
      assert.strictEqual(senderEvent, undefined);
    });

    test("database failure during receipt update fails closed without broadcasting", async () => {
      const mockMessagesModel = {
        find: async () => [
          {
            _id: "m_err_1",
            conversationId: "conv_1",
            sender: "u_alice",
            users: ["u_alice", "u_bob"],
            status: "SENT",
          },
        ],
        updateMany: async () => {
          throw new Error("Mongo connection drop during receipt commit");
        },
      };

      let connectionHandler = null;
      const mockIo = {
        use: () => {},
        on: (ev, handler) => {
          if (ev === "connection") connectionHandler = handler;
        },
        to: () => ({ emit: () => {} }),
      };

      initSocketGateway(
        {},
        {
          io: mockIo,
          messagesModel: mockMessagesModel,
          authMiddleware: (socket, next) => next(),
        }
      );

      const socketListeners = {};
      const mockSocket = {
        id: "sock_bob",
        user: { userId: "u_bob" },
        join: () => {},
        on: (ev, fn) => {
          socketListeners[ev] = fn;
        },
        to: () => ({ emit: () => {} }),
      };

      assert.ok(connectionHandler);
      connectionHandler(mockSocket);

      let ackResult = null;
      await socketListeners["message:delivered"](
        { messageId: "m_err_1" },
        (res) => {
          ackResult = res;
        }
      );

      assert.strictEqual(ackResult.success, false);
      assert.strictEqual(ackResult.error, "DELIVERY_RECEIPT_FAILED");
    });
  });
});
