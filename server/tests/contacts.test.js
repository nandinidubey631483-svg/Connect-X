/**
 * ConnectX Phase 5 Module 4: Contact Discovery & Social Graph Backend Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");

const User = require("../models/userModel");
const Contact = require("../models/contactModel");
const ContactRequest = require("../models/contactRequestModel");
const contactController = require("../controllers/contactController");
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

describe("ConnectX Phase 5 Module 4: Contact Discovery & Social Graph Tests", () => {
  let origUserFind, origUserCount, origUserFindById;
  let origContactFind, origContactFindOne, origContactUpdateOne, origContactDeleteMany;
  let origReqFind, origReqFindOne, origReqFindById, origReqCreate, origReqUpdateMany;

  beforeEach(() => {
    origUserFind = User.find;
    origUserCount = User.countDocuments;
    origUserFindById = User.findById;

    origContactFind = Contact.find;
    origContactFindOne = Contact.findOne;
    origContactUpdateOne = Contact.updateOne;
    origContactDeleteMany = Contact.deleteMany;

    origReqFind = ContactRequest.find;
    origReqFindOne = ContactRequest.findOne;
    origReqFindById = ContactRequest.findById;
    origReqCreate = ContactRequest.create;
    origReqUpdateMany = ContactRequest.updateMany;
  });

  describe("1. User Discovery & Search (searchUsers)", () => {
    test("rejects request if user context is missing", async () => {
      const { req, res, next, getNextError } = createMockHttp({ user: null });
      await contactController.searchUsers(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, "TOKEN_MISSING");
    });

    test("searches users with pagination and escapes special regex characters", async () => {
      const currentUserId = "u_me_123";
      let capturedFilter = null;

      User.countDocuments = async (filter) => {
        capturedFilter = filter;
        return 1;
      };

      User.find = (filter) => ({
        select: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [
                  {
                    _id: "u_target_456",
                    username: "alice_crypto",
                    displayName: "Alice [VIP]",
                    avatarImage: "avatar_str",
                    isAvatarImageSet: true,
                    bio: "Hello world",
                    statusMessage: "Online",
                    isOnline: true,
                    lastSeen: new Date("2026-11-26T00:00:00Z"),
                  },
                ],
              }),
            }),
          }),
        }),
      });

      Contact.find = () => ({
        select: () => ({
          lean: async () => [],
        }),
      });

      ContactRequest.find = () => ({
        lean: async () => [],
      });

      const { req, res, next } = createMockHttp({
        user: { userId: currentUserId },
        query: { q: "Alice [VIP]", page: "1", limit: "10" },
      });

      await contactController.searchUsers(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.users.length, 1);
      assert.strictEqual(res.body.users[0].relationship, "NONE");
      assert.strictEqual(res.body.pagination.total, 1);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 10);
      assert.strictEqual(res.body.pagination.totalPages, 1);
      // Ensure current user is excluded
      assert.deepStrictEqual(capturedFilter._id, { $ne: currentUserId });
    });

    test("annotates users with correct relationship states: CONTACT, PENDING_SENT, PENDING_RECEIVED", async () => {
      const currentUserId = "u_me_123";

      User.countDocuments = async () => 3;
      User.find = () => ({
        select: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [
                  { _id: "u_1", username: "user_one" },
                  { _id: "u_2", username: "user_two" },
                  { _id: "u_3", username: "user_three" },
                ],
              }),
            }),
          }),
        }),
      });

      Contact.find = () => ({
        select: () => ({
          lean: async () => [{ contact: "u_1" }],
        }),
      });

      ContactRequest.find = () => ({
        lean: async () => [
          { _id: "req_sent", requester: currentUserId, recipient: "u_2", status: "PENDING" },
          { _id: "req_recv", requester: "u_3", recipient: currentUserId, status: "PENDING" },
        ],
      });

      const { req, res, next } = createMockHttp({
        user: { userId: currentUserId },
        query: {},
      });

      await contactController.searchUsers(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      const [u1, u2, u3] = res.body.users;
      assert.strictEqual(u1.relationship, "CONTACT");
      assert.strictEqual(u2.relationship, "PENDING_SENT");
      assert.strictEqual(u2.requestId, "req_sent");
      assert.strictEqual(u3.relationship, "PENDING_RECEIVED");
      assert.strictEqual(u3.requestId, "req_recv");
    });
  });

  describe("2. Send Contact Request (sendContactRequest)", () => {
    test("rejects self-request with 400 SELF_REQUEST_PROHIBITED", async () => {
      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_same_123" },
        body: { recipientId: "u_same_123" },
      });

      await contactController.sendContactRequest(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "SELF_REQUEST_PROHIBITED");
    });

    test("rejects non-existent recipient with 404 USER_NOT_FOUND", async () => {
      User.findById = async () => null;

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_caller_123" },
        body: { recipientId: "u_missing_999" },
      });

      await contactController.sendContactRequest(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, "USER_NOT_FOUND");
    });

    test("rejects request if users are already contacts with 409 ALREADY_CONTACTS", async () => {
      User.findById = async () => ({ _id: "u_target" });
      Contact.findOne = async () => ({ user: "u_caller", contact: "u_target" });

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_caller" },
        body: { recipientId: "u_target" },
      });

      await contactController.sendContactRequest(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 409);
      assert.strictEqual(err.code, "ALREADY_CONTACTS");
    });

    test("rejects duplicate outgoing request with 409 DUPLICATE_REQUEST", async () => {
      User.findById = async () => ({ _id: "u_target" });
      Contact.findOne = async () => null;
      ContactRequest.findOne = async (query) => {
        if (query.requester === "u_caller" && query.recipient === "u_target" && query.status === "PENDING") {
          return { _id: "req_existing", status: "PENDING" };
        }
        return null;
      };

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_caller" },
        body: { recipientId: "u_target" },
      });

      await contactController.sendContactRequest(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 409);
      assert.strictEqual(err.code, "DUPLICATE_REQUEST");
    });

    test("rejects if incoming request is already pending with 409 INCOMING_REQUEST_EXISTS", async () => {
      User.findById = async () => ({ _id: "u_target" });
      Contact.findOne = async () => null;
      ContactRequest.findOne = async (query) => {
        if (query.requester === "u_target" && query.recipient === "u_caller" && query.status === "PENDING") {
          return { _id: "req_incoming", status: "PENDING" };
        }
        return null;
      };

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_caller" },
        body: { recipientId: "u_target" },
      });

      await contactController.sendContactRequest(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 409);
      assert.strictEqual(err.code, "INCOMING_REQUEST_EXISTS");
    });

    test("creates new pending request when valid", async () => {
      User.findById = async () => ({ _id: "u_target" });
      Contact.findOne = async () => null;
      ContactRequest.findOne = async () => null;
      ContactRequest.create = async (doc) => ({ _id: "req_new_123", ...doc });

      const { req, res, next } = createMockHttp({
        user: { userId: "u_caller" },
        body: { recipientId: "u_target" },
      });

      await contactController.sendContactRequest(req, res, next);

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.request.status, "PENDING");
      assert.strictEqual(res.body.request.requester, "u_caller");
      assert.strictEqual(res.body.request.recipient, "u_target");
    });
  });

  describe("3. Accept Contact Request (acceptContactRequest)", () => {
    test("rejects if request not found with 404 REQUEST_NOT_FOUND", async () => {
      ContactRequest.findById = async () => null;

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_me" },
        params: { requestId: "req_missing" },
      });

      await contactController.acceptContactRequest(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, "REQUEST_NOT_FOUND");
    });

    test("rejects if non-recipient attempts to accept with 403 UNAUTHORIZED_ACTION", async () => {
      ContactRequest.findById = async () => ({
        _id: "req_1",
        requester: "u_sender",
        recipient: "u_recipient",
        status: "PENDING",
      });

      const { req, res, next, getNextError } = createMockHttp({
        user: { userId: "u_attacker" },
        params: { requestId: "req_1" },
      });

      await contactController.acceptContactRequest(req, res, next);
      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, "UNAUTHORIZED_ACTION");
    });

    test("successfully accepts pending request and establishes mutual Contact records", async () => {
      const mockRequest = {
        _id: "req_1",
        requester: "u_sender",
        recipient: "u_recipient",
        status: "PENDING",
        save: async function () {
          return this;
        },
      };
      ContactRequest.findById = async () => mockRequest;

      const contactUpdates = [];
      Contact.updateOne = async (filter, update, options) => {
        contactUpdates.push({ filter, update, options });
        return { acknowledged: true };
      };

      const { req, res, next } = createMockHttp({
        user: { userId: "u_recipient" },
        params: { requestId: "req_1" },
      });

      await contactController.acceptContactRequest(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(mockRequest.status, "ACCEPTED");
      assert.strictEqual(contactUpdates.length, 2);
      // Mutual connections
      assert.strictEqual(contactUpdates[0].filter.user, "u_sender");
      assert.strictEqual(contactUpdates[0].filter.contact, "u_recipient");
      assert.strictEqual(contactUpdates[1].filter.user, "u_recipient");
      assert.strictEqual(contactUpdates[1].filter.contact, "u_sender");
    });
  });

  describe("4. Reject & Cancel Contact Requests", () => {
    test("rejectContactRequest rejects request by recipient", async () => {
      const mockRequest = {
        _id: "req_reject",
        requester: "u_sender",
        recipient: "u_recipient",
        status: "PENDING",
        save: async function () {
          return this;
        },
      };
      ContactRequest.findById = async () => mockRequest;

      const { req, res, next } = createMockHttp({
        user: { userId: "u_recipient" },
        params: { requestId: "req_reject" },
      });

      await contactController.rejectContactRequest(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(mockRequest.status, "REJECTED");
    });

    test("cancelContactRequest allows requester to cancel their own request", async () => {
      const mockRequest = {
        _id: "req_cancel",
        requester: "u_sender",
        recipient: "u_recipient",
        status: "PENDING",
        save: async function () {
          return this;
        },
      };
      ContactRequest.findById = async () => mockRequest;

      const { req, res, next } = createMockHttp({
        user: { userId: "u_sender" },
        params: { requestId: "req_cancel" },
      });

      await contactController.cancelContactRequest(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(mockRequest.status, "CANCELLED");
    });
  });

  describe("5. Contact List & Removal (getContacts, removeContact)", () => {
    test("getContacts returns confirmed contact list with safe fields", async () => {
      Contact.find = () => ({
        populate: () => ({
          sort: async () => [
            {
              contact: {
                _id: "u_c1",
                username: "bob",
                displayName: "Bob Smith",
                avatarImage: "avatar_bob",
                isAvatarImageSet: true,
                bio: "Bob's bio",
                statusMessage: "Busy",
                isOnline: true,
                lastSeen: new Date(),
              },
              createdAt: new Date(),
            },
          ],
        }),
      });

      const { req, res, next } = createMockHttp({
        user: { userId: "u_me" },
      });

      await contactController.getContacts(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.contacts.length, 1);
      assert.strictEqual(res.body.contacts[0].username, "bob");
      assert.strictEqual(res.body.contacts[0].relationship, "CONTACT");
      assert.strictEqual(res.body.contacts[0].password, undefined);
    });

    test("removeContact deletes mutual contact records and cancels accepted request", async () => {
      Contact.findOne = async () => ({ _id: "c_1", user: "u_me", contact: "u_other" });
      
      let deletedFilter = null;
      Contact.deleteMany = async (filter) => {
        deletedFilter = filter;
        return { deletedCount: 2 };
      };

      let updatedReqFilter = null;
      ContactRequest.updateMany = async (filter) => {
        updatedReqFilter = filter;
        return { modifiedCount: 1 };
      };

      const { req, res, next } = createMockHttp({
        user: { userId: "u_me" },
        params: { contactId: "u_other" },
      });

      await contactController.removeContact(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(deletedFilter);
      assert.ok(updatedReqFilter);
    });
  });
});
