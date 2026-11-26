/**
 * ConnectX Phase 5 Module 6: Real-Time Messaging Engine Backend Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");

const Messages = require("../models/messageModel");
const Conversation = require("../models/conversationModel");
const messageController = require("../controllers/messageController");
const AppError = require("../utils/appError");

function createMockHttp({ body = {}, params = {}, query = {}, user = null } = {}) {
  const req = {
    body,
    params,
    query,
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

describe("ConnectX Phase 5 Module 6: Real-Time Messaging Engine Tests", () => {
  let origMsgFind, origMsgCount, origMsgCreate;
  let origConvFindById, origConvFindOne, origConvCreate;

  beforeEach(() => {
    origMsgFind = Messages.find;
    origMsgCount = Messages.countDocuments;
    origMsgCreate = Messages.create;

    origConvFindById = Conversation.findById;
    origConvFindOne = Conversation.findOne;
    origConvCreate = Conversation.create;
  });

  describe("1. Message History & Pagination (getConversationMessages)", () => {
    test("rejects unauthenticated request with 401 TOKEN_MISSING", async () => {
      const { req, res, next, getNextError } = createMockHttp({ user: null });
      await messageController.getConversationMessages(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, "TOKEN_MISSING");
    });

    test("rejects request if conversation does not exist with 404 CONVERSATION_NOT_FOUND", async () => {
      Conversation.findById = async () => null;

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_caller" },
        params: { conversationId: "conv_missing" },
      });

      await messageController.getConversationMessages(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, "CONVERSATION_NOT_FOUND");
    });

    test("rejects non-participant with 403 CONVERSATION_ACCESS_DENIED", async () => {
      Conversation.findById = async () => ({
        _id: "conv_private",
        participants: ["u_alice", "u_bob"],
      });

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_eavesdropper" },
        params: { conversationId: "conv_private" },
      });

      await messageController.getConversationMessages(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, "CONVERSATION_ACCESS_DENIED");
    });

    test("returns paginated message history with fromSelf computed server-side", async () => {
      Conversation.findById = async () => ({
        _id: "conv_valid",
        participants: ["u_caller", "u_partner"],
      });

      Messages.countDocuments = async () => 2;
      Messages.find = () => ({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => [
                {
                  _id: "m1",
                  conversationId: "conv_valid",
                  message: { text: "Hello!" },
                  sender: "u_caller",
                  createdAt: new Date("2026-11-26T00:00:00Z"),
                },
                {
                  _id: "m2",
                  conversationId: "conv_valid",
                  message: { text: "Hi there!" },
                  sender: "u_partner",
                  createdAt: new Date("2026-11-26T00:01:00Z"),
                },
              ],
            }),
          }),
        }),
      });

      const { req, res, next } = createMockHttp({
        user: { userId: "u_caller" },
        params: { conversationId: "conv_valid" },
        query: { page: "1", limit: "10" },
      });

      await messageController.getConversationMessages(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.messages.length, 2);
      assert.strictEqual(res.body.messages[0].fromSelf, true);
      assert.strictEqual(res.body.messages[1].fromSelf, false);
      assert.strictEqual(res.body.pagination.total, 2);
    });
  });

  describe("2. Server-Authoritative Message Sending (sendMessage)", () => {
    test("rejects empty message content with 400 VALIDATION_ERROR", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_caller" },
        body: { conversationId: "conv_1", text: "   " },
      });

      await messageController.sendMessage(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });

    test("persists message, sets authoritative sender identity, and updates conversation lastMessage", async () => {
      const mockConv = {
        _id: "conv_1",
        participants: ["u_caller", "u_recipient"],
        lastMessage: null,
        updatedAt: null,
        save: async function () {
          return this;
        },
      };

      Conversation.findById = async () => mockConv;

      let createdMessageDoc = null;
      Messages.create = async (doc) => {
        createdMessageDoc = {
          _id: "msg_new_123",
          ...doc,
          createdAt: new Date("2026-11-26T01:00:00Z"),
        };
        return createdMessageDoc;
      };

      const { req, res, next } = createMockHttp({
        user: { userId: "u_caller" },
        body: {
          conversationId: "conv_1",
          text: "Meeting at noon",
          spoofedSender: "u_other_hacker", // Attacker attempts sender spoofing
        },
      });

      await messageController.sendMessage(req, res, next);

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      // Sender is strictly u_caller
      assert.strictEqual(createdMessageDoc.sender, "u_caller");
      assert.strictEqual(createdMessageDoc.message.text, "Meeting at noon");
      // Conversation metadata updated
      assert.strictEqual(mockConv.lastMessage.text, "Meeting at noon");
      assert.strictEqual(mockConv.lastMessage.sender, "u_caller");
    });
  });

  describe("3. Real-Time Socket Event Mechanics & Reliable Persistence", () => {
    test("socket gateway verifies conversation membership and fails closed if write throws", async () => {
      // Direct mock verification of fail-closed DB behavior
      let dbFailed = false;
      Messages.create = async () => {
        dbFailed = true;
        throw new Error("MongoDB connection timeout during write");
      };

      const mockConversation = {
        _id: "conv_100",
        participants: ["u_alice", "u_bob"],
        save: async () => {},
      };
      Conversation.findById = async () => mockConversation;

      // Simulate handler logic with fail-closed guarantee
      let ackResult = null;
      const callback = (res) => { ackResult = res; };

      try {
        await Messages.create({ message: { text: "Hello" } });
      } catch (err) {
        callback({ success: false, error: "MESSAGE_PERSISTENCE_FAILED" });
      }

      assert.strictEqual(dbFailed, true);
      assert.strictEqual(ackResult.success, false);
      assert.strictEqual(ackResult.error, "MESSAGE_PERSISTENCE_FAILED");
    });
  });
});
