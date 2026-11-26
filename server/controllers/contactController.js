/**
 * ConnectX Contact Controller (Phase 5 Module 4)
 * 
 * Provides:
 * - searchUsers: Search & user discovery with pagination and relationship annotation
 * - sendContactRequest: Sends friend/contact request with duplicate/self prevention
 * - getContactRequests: Fetches incoming and outgoing pending requests
 * - acceptContactRequest: Accepts pending request and establishes mutual contact
 * - rejectContactRequest: Rejects pending request
 * - cancelContactRequest: Retracts sent pending request
 * - getContacts: Lists accepted contacts for the authenticated user
 * - removeContact: Removes mutual contact relationship
 * 
 * Invariants:
 * - Ownership & Authorization: strictly verified using req.user.userId
 * - Privacy: Passwords, email, phone numbers, failed attempts, and lock dates are never exposed in search or contact lists
 * - Self-request prevented: Cannot send requests to self
 * - State machine consistency: Only PENDING requests can be transitioned
 */
const User = require("../models/userModel");
const Contact = require("../models/contactModel");
const ContactRequest = require("../models/contactRequestModel");
const { dispatchNotification } = require("../models/notificationService");
const AppError = require("../utils/appError");

/**
 * GET /api/v1/contacts/search
 * User discovery & search with pagination and relationship status
 */
async function searchUsers(req, res, next) {
  try {
    const currentUserId = req.user && req.user.userId;
    if (!currentUserId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { q = "", page = 1, limit = 20 } = req.query;
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    const filter = { _id: { $ne: currentUserId } };

    if (typeof q === "string" && q.trim().length > 0) {
      const sanitized = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(sanitized, "i");
      filter.$or = [{ username: regex }, { displayName: regex }];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("_id username displayName avatarImage isAvatarImageSet bio statusMessage isOnline lastSeen")
        .sort({ username: 1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
    ]);

    // Retrieve relationships for current user in parallel
    const [userContacts, pendingRequests] = await Promise.all([
      Contact.find({ user: currentUserId }).select("contact").lean(),
      ContactRequest.find({
        status: "PENDING",
        $or: [{ requester: currentUserId }, { recipient: currentUserId }],
      }).lean(),
    ]);

    const contactSet = new Set(userContacts.map((c) => c.contact.toString()));
    const sentMap = new Map();
    const receivedMap = new Map();

    for (const reqItem of pendingRequests) {
      const requesterStr = reqItem.requester.toString();
      const recipientStr = reqItem.recipient.toString();
      const currentStr = currentUserId.toString();

      if (requesterStr === currentStr) {
        sentMap.set(recipientStr, reqItem._id);
      } else if (recipientStr === currentStr) {
        receivedMap.set(requesterStr, reqItem._id);
      }
    }

    const annotatedUsers = users.map((u) => {
      const uid = u._id.toString();
      let relationship = "NONE";
      let requestId = null;

      if (contactSet.has(uid)) {
        relationship = "CONTACT";
      } else if (sentMap.has(uid)) {
        relationship = "PENDING_SENT";
        requestId = sentMap.get(uid);
      } else if (receivedMap.has(uid)) {
        relationship = "PENDING_RECEIVED";
        requestId = receivedMap.get(uid);
      }

      return {
        _id: u._id,
        username: u.username,
        displayName: u.displayName || "",
        avatarImage: u.avatarImage || "",
        isAvatarImageSet: !!u.isAvatarImageSet,
        bio: u.bio || "",
        statusMessage: u.statusMessage || "",
        isOnline: !!u.isOnline,
        lastSeen: u.lastSeen || null,
        relationship,
        requestId,
      };
    });

    return res.status(200).json({
      success: true,
      users: annotatedUsers,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/contacts/request
 * Send a contact request to recipientId
 */
async function sendContactRequest(req, res, next) {
  try {
    const requesterId = req.user && req.user.userId;
    if (!requesterId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { recipientId } = req.body || {};
    if (!recipientId) {
      return next(new AppError("Recipient ID is required", 400, "VALIDATION_ERROR"));
    }

    if (requesterId.toString() === recipientId.toString()) {
      return next(new AppError("Cannot send contact request to yourself", 400, "SELF_REQUEST_PROHIBITED"));
    }

    // Verify recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return next(new AppError("Target user not found", 404, "USER_NOT_FOUND"));
    }

    // Verify they are not already contacts
    const existingContact = await Contact.findOne({ user: requesterId, contact: recipientId });
    if (existingContact) {
      return next(new AppError("Users are already contacts", 409, "ALREADY_CONTACTS"));
    }

    // Verify no existing pending request in either direction
    const [outgoingPending, incomingPending] = await Promise.all([
      ContactRequest.findOne({ requester: requesterId, recipient: recipientId, status: "PENDING" }),
      ContactRequest.findOne({ requester: recipientId, recipient: requesterId, status: "PENDING" }),
    ]);

    if (outgoingPending) {
      return next(new AppError("A pending contact request to this user already exists", 409, "DUPLICATE_REQUEST"));
    }
    if (incomingPending) {
      return next(new AppError("A pending contact request from this user already exists", 409, "INCOMING_REQUEST_EXISTS"));
    }

    // Reuse existing inactive request record or create new
    let request = await ContactRequest.findOne({ requester: requesterId, recipient: recipientId });
    if (request) {
      request.status = "PENDING";
      await request.save();
    } else {
      request = await ContactRequest.create({
        requester: requesterId,
        recipient: recipientId,
        status: "PENDING",
      });
    }

    // Dispatch notification to recipient
    (async () => {
      try {
        const requesterUser = await User.findById(requesterId).select("username displayName");
        const senderName = requesterUser ? (requesterUser.displayName || requesterUser.username) : "Someone";
        await dispatchNotification({
          recipientId,
          senderId: requesterId,
          type: "CONTACT_REQUEST_RECEIVED",
          title: "New Contact Request",
          body: `${senderName} sent you a contact request`,
          dedupKey: `req:${request._id}:${request.updatedAt ? request.updatedAt.getTime() : Date.now()}`,
        });
      } catch (_) {}
    })();

    return res.status(201).json({
      success: true,
      message: "Contact request sent successfully",
      request,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/contacts/requests
 * Lists incoming and outgoing pending requests
 */
async function getContactRequests(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const [incoming, outgoing] = await Promise.all([
      ContactRequest.find({ recipient: userId, status: "PENDING" })
        .populate("requester", "_id username displayName avatarImage isAvatarImageSet bio statusMessage isOnline lastSeen")
        .sort({ createdAt: -1 }),
      ContactRequest.find({ requester: userId, status: "PENDING" })
        .populate("recipient", "_id username displayName avatarImage isAvatarImageSet bio statusMessage isOnline lastSeen")
        .sort({ createdAt: -1 }),
    ]);

    return res.status(200).json({
      success: true,
      incoming,
      outgoing,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/contacts/request/:requestId/accept
 * Recipient accepts a pending contact request
 */
async function acceptContactRequest(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { requestId } = req.params;
    const request = await ContactRequest.findById(requestId);
    if (!request) {
      return next(new AppError("Contact request not found", 404, "REQUEST_NOT_FOUND"));
    }

    if (request.recipient.toString() !== userId.toString()) {
      return next(new AppError("Only the recipient can accept this contact request", 403, "UNAUTHORIZED_ACTION"));
    }

    if (request.status !== "PENDING") {
      return next(new AppError(`Request is no longer pending: ${request.status}`, 400, "INVALID_REQUEST_STATUS"));
    }

    request.status = "ACCEPTED";
    await request.save();

    // Establish mutual contact relationship
    await Promise.all([
      Contact.updateOne(
        { user: request.requester, contact: request.recipient },
        { $setOnInsert: { user: request.requester, contact: request.recipient } },
        { upsert: true }
      ),
      Contact.updateOne(
        { user: request.recipient, contact: request.requester },
        { $setOnInsert: { user: request.recipient, contact: request.requester } },
        { upsert: true }
      ),
    ]);

    // Dispatch notification to requester that request was accepted
    (async () => {
      try {
        const acceptingUser = await User.findById(userId).select("username displayName");
        const senderName = acceptingUser ? (acceptingUser.displayName || acceptingUser.username) : "Someone";
        await dispatchNotification({
          recipientId: request.requester,
          senderId: userId,
          type: "CONTACT_REQUEST_ACCEPTED",
          title: "Contact Request Accepted",
          body: `${senderName} accepted your contact request`,
          dedupKey: `req_accepted:${request._id}`,
        });
      } catch (_) {}
    })();

    return res.status(200).json({
      success: true,
      message: "Contact request accepted",
      request,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/contacts/request/:requestId/reject
 * Recipient declines a pending contact request
 */
async function rejectContactRequest(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { requestId } = req.params;
    const request = await ContactRequest.findById(requestId);
    if (!request) {
      return next(new AppError("Contact request not found", 404, "REQUEST_NOT_FOUND"));
    }

    if (request.recipient.toString() !== userId.toString()) {
      return next(new AppError("Only the recipient can reject this contact request", 403, "UNAUTHORIZED_ACTION"));
    }

    if (request.status !== "PENDING") {
      return next(new AppError(`Request is no longer pending: ${request.status}`, 400, "INVALID_REQUEST_STATUS"));
    }

    request.status = "REJECTED";
    await request.save();

    return res.status(200).json({
      success: true,
      message: "Contact request rejected",
      request,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/contacts/request/:requestId/cancel
 * DELETE /api/v1/contacts/request/:requestId
 * Requester cancels a sent pending contact request
 */
async function cancelContactRequest(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { requestId } = req.params;
    const request = await ContactRequest.findById(requestId);
    if (!request) {
      return next(new AppError("Contact request not found", 404, "REQUEST_NOT_FOUND"));
    }

    if (request.requester.toString() !== userId.toString()) {
      return next(new AppError("Only the requester can cancel this contact request", 403, "UNAUTHORIZED_ACTION"));
    }

    if (request.status !== "PENDING") {
      return next(new AppError(`Request is no longer pending: ${request.status}`, 400, "INVALID_REQUEST_STATUS"));
    }

    request.status = "CANCELLED";
    await request.save();

    return res.status(200).json({
      success: true,
      message: "Contact request cancelled",
      request,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/contacts
 * Returns list of confirmed contacts for authenticated user
 */
async function getContacts(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const contactEntries = await Contact.find({ user: userId })
      .populate({
        path: "contact",
        select: "_id username displayName avatarImage isAvatarImageSet bio statusMessage isOnline lastSeen",
      })
      .sort({ createdAt: -1 });

    const contacts = contactEntries
      .filter((entry) => entry && entry.contact)
      .map((entry) => {
        const c = entry.contact;
        return {
          _id: c._id,
          username: c.username,
          displayName: c.displayName || "",
          avatarImage: c.avatarImage || "",
          isAvatarImageSet: !!c.isAvatarImageSet,
          bio: c.bio || "",
          statusMessage: c.statusMessage || "",
          isOnline: !!c.isOnline,
          lastSeen: c.lastSeen || null,
          addedAt: entry.createdAt,
          relationship: "CONTACT",
        };
      });

    return res.status(200).json({
      success: true,
      contacts,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/contacts/:contactId
 * Removes an existing contact from user's contact list
 */
async function removeContact(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { contactId } = req.params;
    const existing = await Contact.findOne({ user: userId, contact: contactId });
    if (!existing) {
      return next(new AppError("Contact not found in your contact list", 404, "CONTACT_NOT_FOUND"));
    }

    // Delete mutual contact records
    await Contact.deleteMany({
      $or: [
        { user: userId, contact: contactId },
        { user: contactId, contact: userId },
      ],
    });

    // Update accepted request status to CANCELLED so users can reconnect later
    await ContactRequest.updateMany(
      {
        $or: [
          { requester: userId, recipient: contactId },
          { requester: contactId, recipient: userId },
        ],
        status: "ACCEPTED",
      },
      { $set: { status: "CANCELLED" } }
    );

    return res.status(200).json({
      success: true,
      message: "Contact removed successfully",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchUsers,
  sendContactRequest,
  getContactRequests,
  acceptContactRequest,
  rejectContactRequest,
  cancelContactRequest,
  getContacts,
  removeContact,
};
