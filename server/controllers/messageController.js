/**
 * ConnectX Message Controller (Phase 5 Module 6)
 * 
 * Provides:
 * - getConversationMessages: Paginated message history with conversation membership authorization
 * - sendMessage: Server-authoritative message persistence with conversation metadata synchronization
 * - getMessages: Legacy message history retrieval (preserved for backward compatibility)
 * - addMessage: Legacy message sender (preserved and synced with conversation metadata)
 * 
 * Invariants:
 * - Server-authoritative sender: req.user.userId is always used as sender
 * - Strict membership check: Only conversation participants can send or read messages
 * - Reliable persistence: Messages are fully committed to DB before acknowledging or broadcasting
 */
const Messages = require("../models/messageModel");
const Conversation = require("../models/conversationModel");
const UserSettings = require("../models/userSettingsModel");
const { dispatchNotification } = require("../models/notificationService");
const AppError = require("../utils/appError");

const STATUS_WEIGHT = {
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents & Data
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Audio / Video
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
]);

const DANGEROUS_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "sh", "msi", "com", "vbs", "ps1", "scr", "jar", "bin"
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function validateMedia(mediaPayload) {
  if (!mediaPayload || typeof mediaPayload !== "object") {
    throw new AppError("Invalid media payload", 400, "VALIDATION_ERROR");
  }

  const { filename, originalName, mimeType, data, size } = mediaPayload;
  const rawName = filename || originalName || "file";
  const cleanName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Check dangerous extension
  const extMatch = cleanName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    throw new AppError(`File type .${ext} is forbidden for security reasons`, 400, "INVALID_FILE_TYPE");
  }

  // Check MIME type
  const cleanMime = (mimeType || "").toLowerCase().trim();
  if (!cleanMime || !ALLOWED_MIME_TYPES.has(cleanMime)) {
    throw new AppError(`MIME type '${cleanMime}' is not supported or permitted`, 400, "INVALID_FILE_TYPE");
  }

  // Validate data payload
  if (!data || typeof data !== "string") {
    throw new AppError("Media data must be provided as a base64 encoded string", 400, "VALIDATION_ERROR");
  }

  // Strip possible data:image/...;base64, prefix if client included it
  const base64Data = data.includes(";base64,") ? data.split(";base64,")[1] : data;
  const buffer = Buffer.from(base64Data, "base64");
  const actualSize = buffer.length;

  if (actualSize === 0) {
    throw new AppError("Uploaded file cannot be empty", 400, "VALIDATION_ERROR");
  }

  if (actualSize > MAX_FILE_SIZE || (size && size > MAX_FILE_SIZE)) {
    throw new AppError("File size exceeds 5MB limit", 413, "FILE_TOO_LARGE");
  }

  const messageType = cleanMime.startsWith("image/") ? "IMAGE" : "FILE";

  return {
    messageType,
    media: {
      filename: cleanName,
      originalName: originalName || cleanName,
      mimeType: cleanMime,
      size: actualSize,
      data: base64Data,
    },
  };
}

/**
 * GET /api/v1/messages/:conversationId
 * Retrieves paginated message history for a conversation
 */
async function getConversationMessages(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { conversationId } = req.params;
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

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const before = req.query.before;

    const filter = {
      $or: [
        { conversationId: conversation._id },
        { users: { $all: conversation.participants } },
      ],
    };

    if (before) {
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) {
        filter.createdAt = { $lt: beforeDate };
      }
    }

    const total = await Messages.countDocuments(filter);
    const skip = (page - 1) * limit;

    const rawMessages = await Messages.find(filter)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Check privacy settings for read receipts
    let maskReadReceipts = false;
    try {
      const otherParticipantId = (conversation.participants || []).find(
        (p) => (p._id ? p._id.toString() : p.toString()) !== userId.toString()
      );
      if (otherParticipantId) {
        const otherId = otherParticipantId._id ? otherParticipantId._id.toString() : otherParticipantId.toString();
        const [mySettings, otherSettings] = await Promise.all([
          UserSettings.findOne({ userId }),
          UserSettings.findOne({ userId: otherId }),
        ]);
        if (mySettings?.privacy?.readReceiptsEnabled === false || otherSettings?.privacy?.readReceiptsEnabled === false) {
          maskReadReceipts = true;
        }
      }
    } catch (_) {}

    const formattedMessages = rawMessages.map((msg) => {
      const fromSelf = msg.sender ? msg.sender.toString() === userId.toString() : false;
      let status = msg.status || "SENT";
      if (fromSelf && maskReadReceipts && status === "READ") {
        status = "DELIVERED";
      }
      return {
        _id: msg._id,
        conversationId: msg.conversationId || conversation._id,
        sender: msg.sender,
        message: msg.message?.text || msg.message,
        messageType: msg.messageType || "TEXT",
        media: msg.media && (msg.media.filename || msg.media.data) ? {
          filename: msg.media.filename,
          originalName: msg.media.originalName,
          mimeType: msg.media.mimeType,
          size: msg.media.size,
          url: `/api/v1/messages/media/${msg._id}`,
          data: msg.media.data,
        } : null,
        fromSelf,
        status,
        deliveredAt: msg.deliveredAt || null,
        readAt: fromSelf && maskReadReceipts ? null : (msg.readAt || null),
        createdAt: msg.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      messages: formattedMessages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: skip + rawMessages.length < total,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/messages
 * Sends and reliably persists a new message with authoritative sender identity (supporting text and media)
 */
async function sendMessage(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { conversationId, to, text, message, media, file } = req.body || {};
    let content = (text || message || "").trim();
    const mediaInput = media || file;

    let mediaData = null;
    let messageType = "TEXT";

    if (mediaInput) {
      const validated = validateMedia(mediaInput);
      mediaData = validated.media;
      messageType = validated.messageType;
      if (!content) {
        content = messageType === "IMAGE" ? "[Image]" : `[File] ${mediaData.filename}`;
      }
    }

    if (!content && !mediaData) {
      return next(new AppError("Message content cannot be empty", 400, "VALIDATION_ERROR"));
    }

    let conversation = null;

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
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
    } else if (to) {
      const hash = [userId.toString(), to.toString()].sort().join(":");
      conversation = await Conversation.findOne({ participantHash: hash });
      if (!conversation) {
        conversation = await Conversation.create({
          participants: [userId, to],
          participantHash: hash,
          type: "DIRECT",
        });
      }
    } else {
      return next(new AppError("Either conversationId or recipient 'to' must be provided", 400, "VALIDATION_ERROR"));
    }

    // Persist message reliably to MongoDB before responding
    const newMsg = await Messages.create({
      conversationId: conversation._id,
      messageType,
      message: { text: content },
      media: mediaData,
      users: conversation.participants,
      sender: userId, // Server-authoritative sender
      status: "SENT",
    });

    // Update conversation metadata
    conversation.lastMessage = {
      text: content,
      sender: userId,
      createdAt: newMsg.createdAt,
    };
    conversation.updatedAt = new Date();
    await conversation.save();

    // Asynchronously dispatch notification to recipient(s)
    (async () => {
      try {
        const recipientParticipant = (conversation.participants || []).find(
          (p) => (p._id ? p._id.toString() : p.toString()) !== userId.toString()
        );
        if (recipientParticipant) {
          const recipientId = recipientParticipant._id ? recipientParticipant._id.toString() : recipientParticipant.toString();
          const preview = messageType === "IMAGE" ? "📷 Sent an image" : (messageType === "FILE" ? `📎 Sent a file: ${mediaData?.filename || ""}` : content);
          await dispatchNotification({
            recipientId,
            senderId: userId,
            type: "MESSAGE_RECEIVED",
            title: "New Message",
            body: preview.length > 100 ? `${preview.substring(0, 97)}...` : preview,
            conversationId: conversation._id,
            messageId: newMsg._id,
            dedupKey: `msg:${newMsg._id}`,
          });
        }
      } catch (_) {}
    })();

    return res.status(201).json({
      success: true,
      message: {
        _id: newMsg._id,
        conversationId: conversation._id,
        sender: userId,
        message: content,
        messageType,
        media: mediaData ? {
          filename: mediaData.filename,
          originalName: mediaData.originalName,
          mimeType: mediaData.mimeType,
          size: mediaData.size,
          url: `/api/v1/messages/media/${newMsg._id}`,
          data: mediaData.data,
        } : null,
        fromSelf: true,
        status: "SENT",
        createdAt: newMsg.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/messages/media/:messageId
 * Serves media binary content with strict conversation participant authorization
 */
async function getMediaFile(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { messageId } = req.params;
    const msg = await Messages.findById(messageId);
    if (!msg) {
      return next(new AppError("Message not found", 404, "MESSAGE_NOT_FOUND"));
    }

    // Verify caller is an authorized conversation participant
    const isMember = (msg.users || []).some(
      (u) => (u._id ? u._id.toString() : u.toString()) === userId.toString()
    );
    if (!isMember) {
      return next(new AppError("You are not authorized to view this media file", 403, "MESSAGE_ACCESS_DENIED"));
    }

    if (!msg.media || !msg.media.data) {
      return next(new AppError("Media not found on this message", 404, "MEDIA_NOT_FOUND"));
    }

    const buffer = Buffer.from(msg.media.data, "base64");
    const isDownload = req.query.download === "true" || msg.messageType === "FILE";
    const disposition = isDownload ? "attachment" : "inline";

    res.set({
      "Content-Type": msg.media.mimeType || "application/octet-stream",
      "Content-Length": buffer.length,
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(msg.media.filename)}"`,
      "Cache-Control": "private, max-age=86400",
    });

    return res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------
// Legacy Endpoints (Preserved for full backward compatibility)
// -------------------------------------------------------------

module.exports.getMessages = async (req, res, next) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) {
      return res.json([]);
    }

    const messages = await Messages.find({
      users: {
        $all: [from, to],
      },
    }).sort({ createdAt: 1, updatedAt: 1 });

    const projectedMessages = messages.map((msg) => {
      return {
        _id: msg._id,
        fromSelf: msg.sender.toString() === from,
        message: msg.message?.text || msg.message,
        createdAt: msg.createdAt,
      };
    });
    res.json(projectedMessages);
  } catch (ex) {
    next(ex);
  }
};

module.exports.addMessage = async (req, res, next) => {
  try {
    const { from, to, message } = req.body;
    if (!message || !from || !to) {
      return res.json({ msg: "Failed to add message to the database" });
    }

    const data = await Messages.create({
      message: { text: message },
      users: [from, to],
      sender: from,
      status: "SENT",
    });

    if (data && from && to) {
      try {
        const hash = [from.toString(), to.toString()].sort().join(":");
        await Conversation.findOneAndUpdate(
          { participantHash: hash },
          {
            $set: {
              lastMessage: {
                text: message,
                sender: from,
                createdAt: data.createdAt || new Date(),
              },
            },
            $setOnInsert: {
              participants: [from, to],
              participantHash: hash,
              type: "DIRECT",
            },
          },
          { upsert: true }
        );
      } catch (_) {}
    }

    if (data) return res.json({ msg: "Message added successfully." });
    else return res.json({ msg: "Failed to add message to the database" });
  } catch (ex) {
    next(ex);
  }
};

module.exports.getConversationMessages = getConversationMessages;
module.exports.sendMessage = sendMessage;

/**
 * PUT /api/v1/messages/status or PUT /api/v1/messages/:messageId/status
 * Updates delivery/read status with strict forward progression and participant authorization
 */
async function updateMessageStatus(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { status, messageId, messageIds } = req.body || {};
    const targetStatus = (status || "").toUpperCase();
    const targetId = req.params.messageId || messageId;

    if (!["DELIVERED", "READ"].includes(targetStatus)) {
      return next(new AppError("Invalid status. Allowed values: DELIVERED, READ", 400, "VALIDATION_ERROR"));
    }

    const idsToUpdate = targetId ? [targetId] : (Array.isArray(messageIds) ? messageIds : []);
    if (idsToUpdate.length === 0) {
      return next(new AppError("messageId or messageIds array required", 400, "VALIDATION_ERROR"));
    }

    const messages = await Messages.find({ _id: { $in: idsToUpdate } });
    if (!messages || messages.length === 0) {
      return next(new AppError("Message not found", 404, "MESSAGE_NOT_FOUND"));
    }

    // For single message, validate ownership & regression strictly
    if (idsToUpdate.length === 1) {
      const msg = messages[0];
      const isMember = (msg.users || []).some(
        (u) => (u._id ? u._id.toString() : u.toString()) === userId.toString()
      );
      if (!isMember) {
        return next(new AppError("You are not a participant in this conversation", 403, "MESSAGE_ACCESS_DENIED"));
      }

      if (msg.sender && msg.sender.toString() === userId.toString()) {
        return next(new AppError("Cannot update receipt for messages sent by self", 403, "UNAUTHORIZED_RECEIPT_UPDATE"));
      }

      const currentWeight = STATUS_WEIGHT[msg.status] || 1;
      const newWeight = STATUS_WEIGHT[targetStatus];

      if (newWeight < currentWeight) {
        return next(new AppError(`Invalid status regression from ${msg.status} to ${targetStatus}`, 400, "INVALID_STATUS_REGRESSION"));
      }

      if (newWeight === currentWeight) {
        return res.status(200).json({
          success: true,
          message: "Status unchanged (already up to date)",
          data: {
            _id: msg._id,
            status: msg.status,
            deliveredAt: msg.deliveredAt,
            readAt: msg.readAt,
          },
        });
      }
    }

    const now = new Date();
    const updateFields = { status: targetStatus };
    if (targetStatus === "DELIVERED") {
      updateFields.deliveredAt = now;
    } else if (targetStatus === "READ") {
      updateFields.readAt = now;
      updateFields.deliveredAt = now;
    }

    const query = {
      _id: { $in: idsToUpdate },
      sender: { $ne: userId },
      users: userId,
    };

    if (targetStatus === "DELIVERED") {
      query.status = "SENT";
    } else if (targetStatus === "READ") {
      query.status = { $in: ["SENT", "DELIVERED"] };
    }

    await Messages.updateMany(query, { $set: updateFields });
    const updatedMessages = await Messages.find({ _id: { $in: idsToUpdate } }).lean();

    return res.status(200).json({
      success: true,
      data: updatedMessages.map((m) => ({
        _id: m._id,
        conversationId: m.conversationId,
        status: m.status,
        deliveredAt: m.deliveredAt,
        readAt: m.readAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/messages/conversation/:conversationId/read
 * Marks all incoming messages in a conversation as READ
 */
async function markConversationMessagesRead(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return next(new AppError("Conversation not found", 404, "CONVERSATION_NOT_FOUND"));
    }

    const isMember = (conversation.participants || []).some(
      (p) => (p._id ? p._id.toString() : p.toString()) === userId.toString()
    );
    if (!isMember) {
      return next(new AppError("You are not a participant in this conversation", 403, "CONVERSATION_ACCESS_DENIED"));
    }

    const now = new Date();
    const result = await Messages.updateMany(
      {
        conversationId: conversation._id,
        sender: { $ne: userId },
        status: { $in: ["SENT", "DELIVERED"] },
      },
      {
        $set: {
          status: "READ",
          readAt: now,
          deliveredAt: now,
        },
      }
    );

    if (conversation.unreadCounts) {
      conversation.unreadCounts.set(userId.toString(), 0);
      await conversation.save();
    }

    return res.status(200).json({
      success: true,
      message: "Conversation messages marked as read",
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (err) {
    next(err);
  }
}

module.exports.updateMessageStatus = updateMessageStatus;
module.exports.markConversationMessagesRead = markConversationMessagesRead;
module.exports.getMediaFile = getMediaFile;
module.exports.uploadMedia = sendMessage;
module.exports.validateMedia = validateMedia;

