/**
 * ConnectX Phase 5 Module 8: Media & File Sharing Backend Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

const Messages = require("../models/messageModel");
const Conversation = require("../models/conversationModel");
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
    method: "POST",
  };

  const headers = {};
  const res = {
    statusCode: 200,
    body: null,
    headers,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    set(headerObj) {
      Object.assign(this.headers, headerObj);
      return this;
    },
    send(data) {
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

describe("ConnectX Phase 5 Module 8: Media & File Sharing Tests", () => {
  let origMsgFind, origMsgFindById, origMsgCreate;
  let origConvFindById, origConvFindOne;

  beforeEach(() => {
    origMsgFind = Messages.find;
    origMsgFindById = Messages.findById;
    origMsgCreate = Messages.create;
    origConvFindById = Conversation.findById;
    origConvFindOne = Conversation.findOne;
  });

  afterEach(() => {
    Messages.find = origMsgFind;
    Messages.findById = origMsgFindById;
    Messages.create = origMsgCreate;
    Conversation.findById = origConvFindById;
    Conversation.findOne = origConvFindOne;
  });

  describe("1. Media Payload Validation", () => {
    test("accepts valid image payload (PNG/JPEG) within 5MB limit", () => {
      const sampleBase64 = Buffer.from("sample image binary data").toString("base64");
      const mediaPayload = {
        filename: "vacation.png",
        mimeType: "image/png",
        data: sampleBase64,
      };

      const result = messageController.validateMedia(mediaPayload);
      assert.strictEqual(result.messageType, "IMAGE");
      assert.strictEqual(result.media.filename, "vacation.png");
      assert.strictEqual(result.media.mimeType, "image/png");
      assert.ok(result.media.size > 0);
    });

    test("accepts valid document payload (PDF) and determines FILE messageType", () => {
      const sampleBase64 = Buffer.from("%PDF-1.4 sample document content").toString("base64");
      const mediaPayload = {
        filename: "report.pdf",
        mimeType: "application/pdf",
        data: sampleBase64,
      };

      const result = messageController.validateMedia(mediaPayload);
      assert.strictEqual(result.messageType, "FILE");
      assert.strictEqual(result.media.filename, "report.pdf");
      assert.strictEqual(result.media.mimeType, "application/pdf");
    });

    test("rejects dangerous file extensions (.exe, .sh, .bat) with 400 INVALID_FILE_TYPE", () => {
      const sampleBase64 = Buffer.from("binary executable").toString("base64");
      const dangerousPayload = {
        filename: "virus.exe",
        mimeType: "application/octet-stream",
        data: sampleBase64,
      };

      assert.throws(
        () => messageController.validateMedia(dangerousPayload),
        (err) => err instanceof AppError && err.code === "INVALID_FILE_TYPE" && err.statusCode === 400
      );
    });

    test("rejects unsupported MIME types with 400 INVALID_FILE_TYPE", () => {
      const sampleBase64 = Buffer.from("dummy data").toString("base64");
      const unknownPayload = {
        filename: "custom.unknown",
        mimeType: "application/x-custom-malicious",
        data: sampleBase64,
      };

      assert.throws(
        () => messageController.validateMedia(unknownPayload),
        (err) => err instanceof AppError && err.code === "INVALID_FILE_TYPE" && err.statusCode === 400
      );
    });

    test("rejects oversized file (> 5MB) with 413 FILE_TOO_LARGE", () => {
      // 5.5MB dummy buffer
      const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024);
      const largeBase64 = largeBuffer.toString("base64");
      const oversizedPayload = {
        filename: "heavy_video.mp4",
        mimeType: "video/mp4",
        data: largeBase64,
      };

      assert.throws(
        () => messageController.validateMedia(oversizedPayload),
        (err) => err instanceof AppError && err.code === "FILE_TOO_LARGE" && err.statusCode === 413
      );
    });
  });

  describe("2. Sending Media Messages & Metadata Persistence", () => {
    test("sendMessage persists image with media metadata, updates conversation lastMessage to [Image]", async () => {
      const mockConv = {
        _id: "conv_media_1",
        participants: ["u_alice", "u_bob"],
        lastMessage: null,
        updatedAt: null,
        save: async function () { return this; },
      };

      Conversation.findById = async () => mockConv;

      let savedDoc = null;
      Messages.create = async (doc) => {
        savedDoc = {
          _id: "m_media_img",
          ...doc,
          createdAt: new Date(),
        };
        return savedDoc;
      };

      const sampleBase64 = Buffer.from("photo bytes").toString("base64");
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_alice" },
        body: {
          conversationId: "conv_media_1",
          media: {
            filename: "profile_shot.jpg",
            mimeType: "image/jpeg",
            data: sampleBase64,
          },
        },
      });

      await messageController.sendMessage(req, res, next);
      assert.strictEqual(getNextError(), null);
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(savedDoc.messageType, "IMAGE");
      assert.strictEqual(savedDoc.media.filename, "profile_shot.jpg");
      assert.strictEqual(savedDoc.status, "SENT");
      // Conversation snippet updated to [Image]
      assert.strictEqual(mockConv.lastMessage.text, "[Image]");
      assert.strictEqual(mockConv.lastMessage.sender, "u_alice");
    });

    test("sendMessage with file attachment and text caption preserves caption", async () => {
      const mockConv = {
        _id: "conv_media_2",
        participants: ["u_alice", "u_bob"],
        lastMessage: null,
        updatedAt: null,
        save: async function () { return this; },
      };

      Conversation.findById = async () => mockConv;

      let savedDoc = null;
      Messages.create = async (doc) => {
        savedDoc = {
          _id: "m_media_file",
          ...doc,
          createdAt: new Date(),
        };
        return savedDoc;
      };

      const sampleBase64 = Buffer.from("Q4 Financial Report").toString("base64");
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_alice" },
        body: {
          conversationId: "conv_media_2",
          text: "Here is the Q4 summary",
          media: {
            filename: "q4_report.pdf",
            mimeType: "application/pdf",
            data: sampleBase64,
          },
        },
      });

      await messageController.sendMessage(req, res, next);
      assert.strictEqual(getNextError(), null);
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(savedDoc.messageType, "FILE");
      assert.strictEqual(savedDoc.message.text, "Here is the Q4 summary");
      assert.strictEqual(mockConv.lastMessage.text, "Here is the Q4 summary");
    });
  });

  describe("3. Authorized Media Download & Serving (getMediaFile)", () => {
    test("serves binary media to authorized conversation participant with correct headers", async () => {
      const originalBinary = Buffer.from("Invoice PDF binary data stream");
      const mockMessage = {
        _id: "m_invoice",
        users: ["u_alice", "u_bob"],
        messageType: "FILE",
        media: {
          filename: "invoice_101.pdf",
          mimeType: "application/pdf",
          data: originalBinary.toString("base64"),
        },
      };

      Messages.findById = async () => mockMessage;

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_bob" }, // Bob is authorized participant
        params: { messageId: "m_invoice" },
        query: { download: "true" },
      });

      await messageController.getMediaFile(req, res, next);
      assert.strictEqual(getNextError(), null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers["Content-Type"], "application/pdf");
      assert.ok(res.headers["Content-Disposition"].includes("attachment"));
      assert.ok(Buffer.isBuffer(res.body));
      assert.strictEqual(res.body.toString(), originalBinary.toString());
    });

    test("rejects unauthorized user with 403 MESSAGE_ACCESS_DENIED", async () => {
      const mockMessage = {
        _id: "m_confidential",
        users: ["u_alice", "u_bob"],
        messageType: "FILE",
        media: {
          filename: "secret.pdf",
          mimeType: "application/pdf",
          data: Buffer.from("secret").toString("base64"),
        },
      };

      Messages.findById = async () => mockMessage;

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_hacker" }, // Hacker is not a participant
        params: { messageId: "m_confidential" },
      });

      await messageController.getMediaFile(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, "MESSAGE_ACCESS_DENIED");
    });
  });

  describe("4. Socket.IO Gateway Real-Time Media Exchange", () => {
    test("message:send via socket validates and broadcasts media payload to recipient room", async () => {
      let createdDoc = null;
      const mockMessagesModel = {
        create: async (doc) => {
          createdDoc = {
            _id: "m_sock_media",
            ...doc,
            createdAt: new Date(),
          };
          return createdDoc;
        },
      };

      const mockConversationModel = {
        findById: async () => ({
          _id: "conv_sock_media",
          participants: ["u_alice", "u_bob"],
          lastMessage: null,
          updatedAt: null,
          save: async () => {},
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
          emit: (event, payload) => {
            emittedTo.push({ room, event, payload });
          },
        }),
      };

      initSocketGateway(
        {},
        {
          io: mockIo,
          messagesModel: mockMessagesModel,
          conversationModel: mockConversationModel,
          authMiddleware: (s, n) => n(),
        }
      );

      const socketListeners = {};
      const mockSocket = {
        id: "sock_alice",
        user: { userId: "u_alice" },
        join: () => {},
        on: (ev, fn) => {
          socketListeners[ev] = fn;
        },
        to: () => ({ emit: () => {} }),
      };

      connectionHandler(mockSocket);

      const sampleBase64 = Buffer.from("live image data").toString("base64");
      let ackResponse = null;

      await socketListeners["message:send"](
        {
          conversationId: "conv_sock_media",
          to: "u_bob",
          media: {
            filename: "photo.jpg",
            mimeType: "image/jpeg",
            data: sampleBase64,
          },
        },
        (res) => {
          ackResponse = res;
        }
      );

      assert.strictEqual(ackResponse.success, true);
      assert.strictEqual(createdDoc.messageType, "IMAGE");
      assert.strictEqual(createdDoc.media.filename, "photo.jpg");

      // Verify real-time broadcast to user:u_bob
      const recipientEvent = emittedTo.find((e) => e.room === "user:u_bob" && e.event === "message:receive");
      assert.ok(recipientEvent);
      assert.strictEqual(recipientEvent.payload.messageType, "IMAGE");
      assert.strictEqual(recipientEvent.payload.media.filename, "photo.jpg");
    });
  });
});
