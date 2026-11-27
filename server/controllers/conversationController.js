/**
 * ConnectX Conversation Controller (Phase 5 Module 5)
 * 
 * Provides:
 * - createOrGetConversation: Idempotent 1-to-1 conversation creation with deduplication
 * - getUserConversations: Retrieves all conversations for the authenticated user
 * - getConversationById: Retrieves a single conversation with membership authorization
 * - markConversationRead: Resets unread counter for the authenticated user
 * 
 * Invariants:
 * - Strict membership validation: Only participants can read or interact with a conversation
 * - Duplicate prevention: Deterministic participantHash ensures only one DIRECT conversation exists between 2 users
 * - Self-conversations prohibited
 */
const User = require("../models/userModel");
const Conversation = require("../models/conversationModel");
const AppError = require("../utils/appError");
const { isValidObjectId } = require("../utils/validators");

function getParticipantHash(userId1, userId2) {
  return [userId1.toString(), userId2.toString()].sort().join(":");
}

/**
 * POST /api/v1/conversations
 * Creates or retrieves existing one-to-one conversation
 */
async function createOrGetConversation(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const participantId = req.body.participantId || req.body.recipientId;
    if (!participantId) {
      return next(new AppError("Participant ID is required", 400, "VALIDATION_ERROR"));
    }

    if (!isValidObjectId(participantId)) {
      return next(new AppError("Invalid participant ID format", 400, "VALIDATION_ERROR"));
    }

    if (userId.toString() === participantId.toString()) {
      return next(
        new AppError("Cannot create conversation with yourself", 400, "SELF_CONVERSATION_PROHIBITED")
      );
    }

    // Verify participant exists
    const targetUser = await User.findById(participantId);
    if (!targetUser) {
      return next(new AppError("Participant user not found", 404, "USER_NOT_FOUND"));
    }

    const hash = getParticipantHash(userId, participantId);

    // Look for existing conversation
    let conversation = await Conversation.findOne({ participantHash: hash })
      .populate(
        "participants",
        "_id username displayName avatarImage isAvatarImageSet bio statusMessage isOnline lastSeen"
      )
      .populate("lastMessage.sender", "_id username displayName");

    if (conversation) {
      return res.status(200).json({
        success: true,
        conversation,
        isNew: false,
      });
    }

    // Create new conversation
    const newConv = await Conversation.create({
      participants: [userId, participantId],
      participantHash: hash,
      type: "DIRECT",
    });

    conversation = await Conversation.findById(newConv._id)
      .populate(
        "participants",
        "_id username displayName avatarImage isAvatarImageSet bio statusMessage isOnline lastSeen"
      )
      .populate("lastMessage.sender", "_id username displayName");

    return res.status(201).json({
      success: true,
      conversation,
      isNew: true,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/conversations
 * Lists all conversations where caller is a participant
 */
async function getUserConversations(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const conversations = await Conversation.find({ participants: userId })
      .populate(
        "participants",
        "_id username displayName avatarImage isAvatarImageSet bio statusMessage isOnline lastSeen"
      )
      .populate("lastMessage.sender", "_id username displayName")
      .sort({ updatedAt: -1 });

    const formatted = conversations.map((conv) => {
      const obj = conv.toObject ? conv.toObject() : { ...conv };
      const other = (obj.participants || []).find(
        (p) => p && p._id && p._id.toString() !== userId.toString()
      );
      return {
        ...obj,
        otherParticipant: other || null,
      };
    });

    return res.status(200).json({
      success: true,
      conversations: formatted,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/conversations/:conversationId
 * Retrieves conversation details with membership verification
 */
async function getConversationById(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId)
      .populate(
        "participants",
        "_id username displayName avatarImage isAvatarImageSet bio statusMessage isOnline lastSeen"
      )
      .populate("lastMessage.sender", "_id username displayName");

    if (!conversation) {
      return next(new AppError("Conversation not found", 404, "CONVERSATION_NOT_FOUND"));
    }

    const isMember = (conversation.participants || []).some(
      (p) => p && (p._id ? p._id.toString() : p.toString()) === userId.toString()
    );

    if (!isMember) {
      return next(
        new AppError("You are not a participant in this conversation", 403, "CONVERSATION_ACCESS_DENIED")
      );
    }

    const obj = conversation.toObject ? conversation.toObject() : { ...conversation };
    const other = (obj.participants || []).find(
      (p) => p && p._id && p._id.toString() !== userId.toString()
    );

    return res.status(200).json({
      success: true,
      conversation: {
        ...obj,
        otherParticipant: other || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/conversations/:conversationId/read
 * Marks conversation unread count as read for user
 */
async function markConversationRead(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { conversationId } = req.params;
    if (!conversationId || !isValidObjectId(conversationId)) {
      return next(new AppError("Invalid conversation ID format", 400, "VALIDATION_ERROR"));
    }
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return next(new AppError("Conversation not found", 404, "CONVERSATION_NOT_FOUND"));
    }

    const isMember = (conversation.participants || []).some(
      (p) => (p._id ? p._id.toString() : p.toString()) === userId.toString()
    );

    if (!isMember) {
      return next(
        new AppError("You are not a participant in this conversation", 403, "CONVERSATION_ACCESS_DENIED")
      );
    }

    if (conversation.unreadCounts) {
      conversation.unreadCounts.set(userId.toString(), 0);
      await conversation.save();
    }

    return res.status(200).json({
      success: true,
      message: "Conversation marked as read",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrGetConversation,
  getUserConversations,
  getConversationById,
  markConversationRead,
  getParticipantHash,
};
