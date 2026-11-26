/**
 * ConnectX Phase 5 Module 5: Conversation & Chat Management Backend Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");

const User = require("../models/userModel");
const Conversation = require("../models/conversationModel");
const conversationController = require("../controllers/conversationController");
const messageController = require("../controllers/messageController");
const Messages = require("../models/messageModel");
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

describe("ConnectX Phase 5 Module 5: Conversation & Chat Management Tests", () => {
  let origUserFindById;
  let origConvFind, origConvFindOne, origConvFindById, origConvCreate, origConvFindOneAndUpdate;

  beforeEach(() => {
    origUserFindById = User.findById;
    origConvFind = Conversation.find;
    origConvFindOne = Conversation.findOne;
    origConvFindById = Conversation.findById;
    origConvCreate = Conversation.create;
    origConvFindOneAndUpdate = Conversation.findOneAndUpdate;
  });

  describe("1. Deduplication Hash Logic (getParticipantHash)", () => {
    test("produces identical participantHash regardless of argument ordering", () => {
      const hash1 = conversationController.getParticipantHash("user_alpha", "user_beta");
      const hash2 = conversationController.getParticipantHash("user_beta", "user_alpha");
      assert.strictEqual(hash1, hash2);
      assert.strictEqual(hash1, "user_alpha:user_beta");
    });
  });

  describe("2. Create or Retrieve Conversation (createOrGetConversation)", () => {
    test("rejects request if caller is not authenticated with 401 TOKEN_MISSING", async () => {
      const { req, res, next, getNextError } = createMockHttp({ user: null });
      await conversationController.createOrGetConversation(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, "TOKEN_MISSING");
    });

    test("rejects request if participantId is omitted with 400 VALIDATION_ERROR", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_me" },
        body: {},
      });
      await conversationController.createOrGetConversation(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });

    test("rejects self-conversation creation with 400 SELF_CONVERSATION_PROHIBITED", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_same" },
        body: { participantId: "u_same" },
      });
      await conversationController.createOrGetConversation(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "SELF_CONVERSATION_PROHIBITED");
    });

    test("rejects non-existent target participant with 404 USER_NOT_FOUND", async () => {
      User.findById = async () => null;

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_me" },
        body: { participantId: "u_ghost" },
      });
      await conversationController.createOrGetConversation(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, "USER_NOT_FOUND");
    });

    test("creates new conversation if none exists and returns 201 with isNew: true", async () => {
      User.findById = async () => ({ _id: "u_target", username: "target" });
      Conversation.findOne = () => ({
        populate: () => ({
          populate: async () => null,
        }),
      });

      let createdDoc = null;
      Conversation.create = async (doc) => {
        createdDoc = { _id: "conv_new_123", ...doc };
        return createdDoc;
      };

      Conversation.findById = (id) => ({
        populate: () => ({
          populate: async () => ({
            _id: id,
            participants: [{ _id: "u_me" }, { _id: "u_target" }],
            type: "DIRECT",
          }),
        }),
      });

      const { req, res, next } = createMockHttp({
        user: { userId: "u_me" },
        body: { participantId: "u_target" },
      });

      await conversationController.createOrGetConversation(req, res, next);

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.isNew, true);
      assert.strictEqual(res.body.conversation._id, "conv_new_123");
      assert.ok(createdDoc);
      assert.strictEqual(createdDoc.participantHash, "u_me:u_target");
    });

    test("returns existing conversation without duplicating if already present (isNew: false)", async () => {
      User.findById = async () => ({ _id: "u_target", username: "target" });

      const existingConv = {
        _id: "conv_existing_999",
        participants: [{ _id: "u_me" }, { _id: "u_target" }],
        participantHash: "u_me:u_target",
      };

      Conversation.findOne = () => ({
        populate: () => ({
          populate: async () => existingConv,
        }),
      });

      let createCalled = false;
      Conversation.create = async () => {
        createCalled = true;
      };

      const { req, res, next } = createMockHttp({
        user: { userId: "u_me" },
        body: { participantId: "u_target" },
      });

      await conversationController.createOrGetConversation(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.isNew, false);
      assert.strictEqual(res.body.conversation._id, "conv_existing_999");
      assert.strictEqual(createCalled, false);
    });
  });

  describe("3. List User Conversations (getUserConversations)", () => {
    test("returns all conversations for caller populated with otherParticipant", async () => {
      const mockConversations = [
        {
          _id: "conv_1",
          participants: [
            { _id: "u_me", username: "caller" },
            { _id: "u_friend", username: "friend_bob", displayName: "Bob" },
          ],
          lastMessage: { text: "Hey there!", sender: { _id: "u_friend", username: "friend_bob" } },
          updatedAt: new Date(),
        },
      ];

      Conversation.find = () => ({
        populate: () => ({
          populate: () => ({
            sort: async () => mockConversations,
          }),
        }),
      });

      const { req, res, next } = createMockHttp({
        user: { userId: "u_me" },
      });

      await conversationController.getUserConversations(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.conversations.length, 1);
      assert.strictEqual(res.body.conversations[0].otherParticipant._id, "u_friend");
      assert.strictEqual(res.body.conversations[0].otherParticipant.displayName, "Bob");
    });
  });

  describe("4. Conversation Details & Membership Authorization (getConversationById)", () => {
    test("rejects if conversation does not exist with 404 CONVERSATION_NOT_FOUND", async () => {
      Conversation.findById = () => ({
        populate: () => ({
          populate: async () => null,
        }),
      });

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_me" },
        params: { conversationId: "conv_nonexistent" },
      });

      await conversationController.getConversationById(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, "CONVERSATION_NOT_FOUND");
    });

    test("rejects non-participant with 403 CONVERSATION_ACCESS_DENIED", async () => {
      const privateConv = {
        _id: "conv_secret",
        participants: [{ _id: "u_alice" }, { _id: "u_bob" }],
      };

      Conversation.findById = () => ({
        populate: () => ({
          populate: async () => privateConv,
        }),
      });

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_intruder" },
        params: { conversationId: "conv_secret" },
      });

      await conversationController.getConversationById(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, "CONVERSATION_ACCESS_DENIED");
    });

    test("allows participant to retrieve details and formats otherParticipant", async () => {
      const conv = {
        _id: "conv_valid",
        participants: [
          { _id: "u_me", username: "caller" },
          { _id: "u_alice", username: "alice" },
        ],
      };

      Conversation.findById = () => ({
        populate: () => ({
          populate: async () => conv,
        }),
      });

      const { req, res, next } = createMockHttp({
        user: { userId: "u_me" },
        params: { conversationId: "conv_valid" },
      });

      await conversationController.getConversationById(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.conversation._id, "conv_valid");
      assert.strictEqual(res.body.conversation.otherParticipant._id, "u_alice");
    });
  });

  describe("5. Mark Conversation As Read (markConversationRead)", () => {
    test("rejects non-participant with 403 CONVERSATION_ACCESS_DENIED", async () => {
      Conversation.findById = async () => ({
        _id: "conv_1",
        participants: ["u_alice", "u_bob"],
      });

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_intruder" },
        params: { conversationId: "conv_1" },
      });

      await conversationController.markConversationRead(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, "CONVERSATION_ACCESS_DENIED");
    });

    test("resets unread counts for member", async () => {
      const mockUnreadMap = new Map([["u_me", 5]]);
      const mockConv = {
        _id: "conv_1",
        participants: ["u_me", "u_other"],
        unreadCounts: mockUnreadMap,
        save: async () => {},
      };

      Conversation.findById = async () => mockConv;

      const { req, res, next } = createMockHttp({
        user: { userId: "u_me" },
        params: { conversationId: "conv_1" },
      });

      await conversationController.markConversationRead(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(mockUnreadMap.get("u_me"), 0);
    });
  });

  describe("6. Message Integration & Metadata Updates", () => {
    test("addMessage creates message and synchronizes conversation lastMessage", async () => {
      const origMsgCreate = Messages.create;
      Messages.create = async (doc) => ({ _id: "msg_123", ...doc });

      let capturedHash = null;
      let capturedUpdate = null;
      Conversation.findOneAndUpdate = async (filter, update) => {
        capturedHash = filter.participantHash;
        capturedUpdate = update;
        return { _id: "conv_1" };
      };

      const { req, res, next } = createMockHttp({
        body: {
          from: "u_alice",
          to: "u_bob",
          message: "See you at 5pm",
        },
      });

      await messageController.addMessage(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.msg, "Message added successfully.");
      assert.strictEqual(capturedHash, "u_alice:u_bob");
      assert.strictEqual(capturedUpdate.$set.lastMessage.text, "See you at 5pm");
      assert.strictEqual(capturedUpdate.$set.lastMessage.sender, "u_alice");

      Messages.create = origMsgCreate;
    });
  });
});
