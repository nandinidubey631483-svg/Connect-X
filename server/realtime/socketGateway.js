/**
 * ConnectX Socket.IO Real-Time Gateway Initialization
 * 
 * Enforces:
 * - Strict Origin validation and CSWSH protections via allowRequest (extractSafeOrigin)
 * - Mandatory Handshake JWT Authentication and SessionFamily verification (io.use)
 * - Per-packet event authorization and identity spoofing prevention (socket.use)
 * - Authoritative server-side identity binding (socket.user)
 * - User room membership (user:<userId>)
 * - Concurrent socket tracking (userSockets) with resilient disconnect lifecycle
 * - Backward compatibility with legacy socket events (add-user, send-msg)
 */
const socketIo = require("socket.io");
const config = require("../config/env");
const { extractSafeOrigin } = require("../middleware/validateOrigin");
const {
  socketAuthMiddleware,
  createSocketAuthMiddleware,
  socketEventAuthMiddleware,
} = require("./socketAuthMiddleware");
const { presenceEngine } = require("./presenceEngine");
const Messages = require("../models/messageModel");
const Conversation = require("../models/conversationModel");
const UserSettings = require("../models/userSettingsModel");
const Notification = require("../models/notificationModel");
const { dispatchNotification } = require("../models/notificationService");
const { registerCallSignaling } = require("./callSignaling");
const { validateMessageContent } = require("../utils/validators");

function initSocketGateway(server, options = {}) {
  const MessagesModel = options.messagesModel || Messages;
  const ConversationModel = options.conversationModel || Conversation;
  const UserSettingsModel = options.userSettingsModel || UserSettings;
  const NotificationModel = options.notificationModel || Notification;
  const io = options.io || socketIo(server, {
    cors: {
      origin: config.allowedOrigins,
      credentials: true,
    },
    allowRequest: (req, callback) => {
      const rawOrigin = req.headers.origin || req.headers.referer;
      const origin = extractSafeOrigin(rawOrigin);

      // In production mode, reject any request missing or having malformed origin header
      if (config.isProduction) {
        if (!origin) {
          return callback("CORS_POLICY_VIOLATION: Missing or malformed origin header", false);
        }
        if (!config.allowedOrigins.includes(origin)) {
          return callback("CORS_POLICY_VIOLATION: Origin not permitted", false);
        }
      } else {
        // Development mode: validate origin if present
        if (origin && !config.allowedOrigins.includes(origin)) {
          return callback("CORS_POLICY_VIOLATION: Origin not permitted", false);
        }
      }

      callback(null, true);
    },
  });

  // Attach handshake authentication middleware
  const authMiddleware = options.authMiddleware || (
    options.sessionFamilyModel || options.activeRotationsModel || options.redisClient || options.secretOverride
      ? createSocketAuthMiddleware(options)
      : socketAuthMiddleware
  );

  io.use(authMiddleware);

  // Preserve in-memory mappings for single-node / backward compatibility
  global.onlineUsers = new Map();
  global.userSockets = new Map(); // userId -> Set<socketId> (tracks concurrent sockets per user)

  io.on("connection", (socket) => {
    global.chatSocket = socket;

    // Attach per-event authorization and sender-spoofing protection
    if (typeof socket.use === "function") {
      socket.use(socketEventAuthMiddleware.bind(socket));
    }

    const authenticatedUserId = socket.user && socket.user.userId;

    if (authenticatedUserId) {
      // Automatically join the user's private channel room
      socket.join(`user:${authenticatedUserId}`);

      // Track concurrent socket connection in legacy and presence engine
      if (!userSockets.has(authenticatedUserId)) {
        userSockets.set(authenticatedUserId, new Set());
      }
      userSockets.get(authenticatedUserId).add(socket.id);
      onlineUsers.set(authenticatedUserId, socket.id);

      // Register connection with presenceEngine
      presenceEngine.registerConnection(authenticatedUserId, socket.id).then(({ isFirstSession }) => {
        if (isFirstSession) {
          // Broadcast presence:online to all clients
          socket.broadcast.emit("presence:update", {
            userId: authenticatedUserId,
            isOnline: true,
            lastSeen: new Date(),
          });
        }
      }).catch(() => {});
    }

    // Heartbeat ping event
    socket.on("presence:heartbeat", async () => {
      await presenceEngine.recordHeartbeat(socket.id);
      socket.emit("presence:heartbeat_ack", { timestamp: Date.now() });
    });

    // Query presence with privacy filtering applied
    socket.on("presence:query", async ({ targetUserId }, callback) => {
      if (typeof callback === "function" && targetUserId) {
        const presence = await presenceEngine.getSanitizedPresence(targetUserId, authenticatedUserId);
        callback(presence);
      }
    });

    // Module 11: Real-Time Call Signaling Gateway
    registerCallSignaling(io, socket, options);

    // Legacy event: register user socket
    // Identity Spoofing Protection: Client-supplied userId MUST match authenticated socket identity!
    socket.on("add-user", (clientUserId) => {
      const activeId = authenticatedUserId || (socket.user && socket.user.userId) || clientUserId;
      if (!activeId) return;

      if (authenticatedUserId && clientUserId && String(clientUserId) !== String(authenticatedUserId)) {
        socket.emit("auth-error", {
          code: "IDENTITY_SPOOF_ATTEMPT",
          message: "Client supplied user ID does not match authenticated token.",
        });
        return;
      }

      const strId = String(activeId);
      if (!socket.user) {
        socket.user = { userId: strId };
      }
      socket.join(`user:${strId}`);

      if (!userSockets.has(strId)) {
        userSockets.set(strId, new Set());
      }
      userSockets.get(strId).add(socket.id);
      onlineUsers.set(strId, socket.id);

      presenceEngine.registerConnection(strId, socket.id).then(({ isFirstSession }) => {
        if (isFirstSession) {
          socket.broadcast.emit("presence:update", {
            userId: strId,
            isOnline: true,
            lastSeen: new Date(),
          });
        }
      }).catch(() => {});
    });

    // Phase 5 Module 6 & 8: Real-time message sending with reliable DB persistence before broadcast
    socket.on("message:send", async (data, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      const sender = authenticatedUserId || (socket.user && socket.user.userId) || (data && data.from);
      if (!sender) {
        return ack({ success: false, error: "UNAUTHORIZED", code: "AUTH_REQUIRED" });
      }
      const activeSender = String(sender);

      const { conversationId, to, text, message, media, file, clientTempId } = data || {};
      let rawText = text || message || "";
      const mediaInput = media || file;

      let mediaData = null;
      let messageType = "TEXT";

      if (mediaInput) {
        try {
          const { validateMedia } = require("../controllers/messageController");
          const validated = validateMedia(mediaInput);
          mediaData = validated.media;
          messageType = validated.messageType;
          if (!rawText) {
            rawText = messageType === "IMAGE" ? "[Image]" : `[File] ${mediaData.filename}`;
          }
        } catch (mediaErr) {
          return ack({ success: false, error: mediaErr.code || "INVALID_FILE", message: mediaErr.message });
        }
      }

      const msgValidation = validateMessageContent(rawText, 5000);
      if (!msgValidation.isValid && !mediaData) {
        return ack({ success: false, error: "VALIDATION_ERROR", message: msgValidation.error || "Message content cannot be empty" });
      }
      const content = msgValidation.isValid ? msgValidation.sanitized : (rawText ? String(rawText).slice(0, 5000) : "");

      let conv = null;
      let recipientId = to;

      try {
        if (conversationId) {
          conv = await ConversationModel.findById(conversationId);
          if (!conv) {
            return ack({ success: false, error: "CONVERSATION_NOT_FOUND" });
          }
          const isMember = (conv.participants || []).some(
            (p) => (p._id ? p._id.toString() : p.toString()) === activeSender
          );
          if (!isMember) {
            return ack({ success: false, error: "CONVERSATION_ACCESS_DENIED" });
          }
          if (!recipientId) {
            const other = (conv.participants || []).find(
              (p) => (p._id ? p._id.toString() : p.toString()) !== activeSender
            );
            recipientId = other ? (other._id ? other._id.toString() : other.toString()) : null;
          }
        } else if (to) {
          const hash = [activeSender, to.toString()].sort().join(":");
          conv = await ConversationModel.findOne({ participantHash: hash });
          if (!conv) {
            conv = await ConversationModel.create({
              participants: [activeSender, to],
              participantHash: hash,
              type: "DIRECT",
            });
          }
        } else {
          return ack({ success: false, error: "VALIDATION_ERROR", message: "Recipient or conversationId required" });
        }

        // STEP 1: Persist message reliably to DB BEFORE broadcasting
        const savedMsg = await MessagesModel.create({
          conversationId: conv._id,
          messageType,
          message: { text: content },
          media: mediaData,
          users: conv.participants,
          sender: activeSender, // Server-authoritative sender
          status: "SENT",
        });

        // STEP 2: Update conversation lastMessage metadata
        conv.lastMessage = {
          text: content,
          sender: activeSender,
          createdAt: savedMsg.createdAt,
        };
        conv.updatedAt = new Date();
        await conv.save();

        const payload = {
          _id: savedMsg._id,
          conversationId: conv._id,
          sender: activeSender,
          message: content,
          text: content,
          messageType,
          media: mediaData ? {
            filename: mediaData.filename,
            originalName: mediaData.originalName,
            mimeType: mediaData.mimeType,
            size: mediaData.size,
            url: `/api/v1/messages/media/${savedMsg._id}`,
            data: mediaData.data,
          } : null,
          createdAt: savedMsg.createdAt,
          fromSelf: false,
        };

        // STEP 3: Fan out to recipient sockets
        if (recipientId) {
          const strRecipient = String(recipientId);
          if (io && typeof io.to === "function") {
            try {
              io.to(`user:${strRecipient}`).emit("message:receive", payload);
              io.to(`user:${strRecipient}`).emit("msg-recieve", content);
            } catch (_) {}
          }

          const recipientSockets = userSockets.get(strRecipient) || userSockets.get(recipientId);
          if (recipientSockets && recipientSockets.size > 0) {
            for (const sockId of recipientSockets) {
              if (socket.to && typeof socket.to === "function") {
                try {
                  socket.to(sockId).emit("message:receive", payload);
                  socket.to(sockId).emit("msg-recieve", content);
                } catch (_) {}
              }
            }
          } else {
            const sendUserSocket = onlineUsers.get(strRecipient) || onlineUsers.get(recipientId);
            if (sendUserSocket && socket.to && typeof socket.to === "function") {
              try {
                socket.to(sendUserSocket).emit("message:receive", payload);
                socket.to(sendUserSocket).emit("msg-recieve", content);
              } catch (_) {}
            }
          }

          // Asynchronously dispatch notification if recipient is not active or for notification history
          (async () => {
            try {
              const preview = messageType === "IMAGE" ? "📷 Sent an image" : (messageType === "FILE" ? `📎 Sent a file: ${mediaData?.filename || ""}` : content);
              await dispatchNotification({
                recipientId,
                senderId: authenticatedUserId,
                type: "MESSAGE_RECEIVED",
                title: "New Message",
                body: preview.length > 100 ? `${preview.substring(0, 97)}...` : preview,
                conversationId: conversation._id,
                messageId: savedMsg._id,
                dedupKey: `msg:${savedMsg._id}`,
                io,
                userSockets,
              });
            } catch (_) {}
          })();
        }

        // STEP 4: Acknowledge sender with persisted message
        return ack({
          success: true,
          message: {
            ...payload,
            fromSelf: true,
          },
          clientTempId,
        });
      } catch (err) {
        // Fail-closed on database write error
        return ack({
          success: false,
          error: "MESSAGE_PERSISTENCE_FAILED",
          message: err.message || "Failed to commit message to storage",
        });
      }
    });

    // Message synchronization on reconnect
    socket.on("message:sync", async (data, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      if (!authenticatedUserId) {
        return ack({ success: false, error: "UNAUTHORIZED" });
      }

      const { conversationId, since } = data || {};
      if (!conversationId) {
        return ack({ success: false, error: "VALIDATION_ERROR", message: "conversationId required" });
      }

      try {
        const conv = await ConversationModel.findById(conversationId);
        if (!conv) {
          return ack({ success: false, error: "CONVERSATION_NOT_FOUND" });
        }

        const isMember = (conv.participants || []).some(
          (p) => (p._id ? p._id.toString() : p.toString()) === authenticatedUserId.toString()
        );
        if (!isMember) {
          return ack({ success: false, error: "CONVERSATION_ACCESS_DENIED" });
        }

        const filter = { conversationId: conv._id };
        if (since) {
          const sinceDate = new Date(since);
          if (!isNaN(sinceDate.getTime())) {
            filter.createdAt = { $gt: sinceDate };
          }
        }

        const missedMessages = await MessagesModel.find(filter).sort({ createdAt: 1 }).lean();
        const formatted = (missedMessages || []).map((m) => ({
          _id: m._id,
          conversationId: m.conversationId,
          sender: m.sender,
          message: m.message?.text || m.message,
          messageType: m.messageType || "TEXT",
          media: m.media && (m.media.filename || m.media.data) ? {
            filename: m.media.filename,
            originalName: m.media.originalName,
            mimeType: m.media.mimeType,
            size: m.media.size,
            url: `/api/v1/messages/media/${m._id}`,
            data: m.media.data,
          } : null,
          fromSelf: m.sender ? m.sender.toString() === authenticatedUserId.toString() : false,
          status: m.status || "SENT",
          deliveredAt: m.deliveredAt || null,
          readAt: m.readAt || null,
          createdAt: m.createdAt,
        }));

        return ack({ success: true, messages: formatted });
      } catch (err) {
        return ack({ success: false, error: "SYNC_FAILED" });
      }
    });

    // Phase 5 Module 7: Delivery Receipt Event
    const handleDeliveryReceipt = async (data, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      if (!authenticatedUserId) {
        return ack({ success: false, error: "UNAUTHORIZED", code: "AUTH_REQUIRED" });
      }

      const { messageId, messageIds, conversationId } = data || {};
      const targetIds = messageId ? [messageId] : (Array.isArray(messageIds) ? messageIds : []);
      if (targetIds.length === 0) {
        return ack({ success: false, error: "VALIDATION_ERROR", message: "messageId or messageIds required" });
      }

      try {
        const messages = await MessagesModel.find({ _id: { $in: targetIds } });
        if (!messages || messages.length === 0) {
          return ack({ success: false, error: "MESSAGE_NOT_FOUND" });
        }

        // Validate caller is recipient and NOT sender
        for (const msg of messages) {
          if (msg.sender && msg.sender.toString() === authenticatedUserId.toString()) {
            return ack({ success: false, error: "UNAUTHORIZED_RECEIPT_UPDATE", message: "Cannot mark own message as delivered" });
          }
        }

        const now = new Date();
        // Update only messages currently at SENT (strictly prevent regression)
        await MessagesModel.updateMany(
          {
            _id: { $in: targetIds },
            sender: { $ne: authenticatedUserId },
            status: "SENT",
          },
          {
            $set: {
              status: "DELIVERED",
              deliveredAt: now,
            },
          }
        );

        const affectedSenders = new Set();
        const convId = conversationId || messages[0].conversationId;

        for (const msg of messages) {
          if (msg.sender) {
            affectedSenders.add(msg.sender.toString());
          }
        }

        const statusPayload = {
          messageIds: targetIds,
          messageId: targetIds[0],
          conversationId: convId,
          status: "DELIVERED",
          deliveredAt: now,
          updatedBy: authenticatedUserId,
        };

        // Broadcast to sender(s)
        for (const senderId of affectedSenders) {
          if (io && typeof io.to === "function") {
            io.to(`user:${senderId}`).emit("message:status_update", statusPayload);
            io.to(`user:${senderId}`).emit("message:delivered", statusPayload);
          }
          const senderSockets = userSockets.get(senderId);
          if (senderSockets) {
            for (const sockId of senderSockets) {
              if (socket.to && typeof socket.to === "function") {
                socket.to(sockId).emit("message:status_update", statusPayload);
                socket.to(sockId).emit("message:delivered", statusPayload);
              }
            }
          }
        }

        // Broadcast to caller's other sockets (multi-device sync)
        if (io && typeof io.to === "function") {
          io.to(`user:${authenticatedUserId}`).emit("message:status_update", statusPayload);
        }

        return ack({ success: true, status: "DELIVERED", messageIds: targetIds });
      } catch (err) {
        return ack({ success: false, error: "DELIVERY_RECEIPT_FAILED", message: err.message });
      }
    };

    socket.on("message:delivered", handleDeliveryReceipt);
    socket.on("message:delivery_receipt", handleDeliveryReceipt);

    // Phase 5 Module 7: Read Receipt Event
    const handleReadReceipt = async (data, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      if (!authenticatedUserId) {
        return ack({ success: false, error: "UNAUTHORIZED", code: "AUTH_REQUIRED" });
      }

      const { messageId, messageIds, conversationId } = data || {};
      const targetIds = messageId ? [messageId] : (Array.isArray(messageIds) ? messageIds : []);

      try {
        let messages = [];
        let conv = null;

        if (conversationId) {
          conv = await ConversationModel.findById(conversationId);
          if (conv) {
            const isMember = (conv.participants || []).some(
              (p) => (p._id ? p._id.toString() : p.toString()) === authenticatedUserId.toString()
            );
            if (!isMember) {
              return ack({ success: false, error: "CONVERSATION_ACCESS_DENIED" });
            }
          }
        }

        if (targetIds.length > 0) {
          messages = await MessagesModel.find({ _id: { $in: targetIds } });
          if (!messages || messages.length === 0) {
            return ack({ success: false, error: "MESSAGE_NOT_FOUND" });
          }
          for (const msg of messages) {
            if (msg.sender && msg.sender.toString() === authenticatedUserId.toString()) {
              return ack({ success: false, error: "UNAUTHORIZED_RECEIPT_UPDATE", message: "Cannot mark own message as read" });
            }
          }
        } else if (conversationId) {
          messages = await MessagesModel.find({
            conversationId,
            sender: { $ne: authenticatedUserId },
            status: { $in: ["SENT", "DELIVERED"] },
          });
        } else {
          return ack({ success: false, error: "VALIDATION_ERROR", message: "messageId, messageIds, or conversationId required" });
        }

        const effectiveIds = messages.map((m) => m._id.toString());
        const now = new Date();

        if (effectiveIds.length > 0) {
          // Strictly prevent regressions: only update SENT or DELIVERED to READ
          await MessagesModel.updateMany(
            {
              _id: { $in: effectiveIds },
              sender: { $ne: authenticatedUserId },
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
        }

        // Reset unread count on conversation
        if (conv && conv.unreadCounts) {
          conv.unreadCounts.set(authenticatedUserId.toString(), 0);
          await conv.save();
        }

        // Check privacy setting for authenticated user
        let readReceiptsEnabled = true;
        try {
          const userSettings = await UserSettingsModel.findOne({ userId: authenticatedUserId });
          if (userSettings && userSettings.privacy && userSettings.privacy.readReceiptsEnabled === false) {
            readReceiptsEnabled = false;
          }
        } catch (_) {}

        const finalConvId = conversationId || (messages[0] ? messages[0].conversationId : null);
        const statusPayload = {
          messageIds: effectiveIds,
          messageId: effectiveIds[0],
          conversationId: finalConvId,
          status: "READ",
          readAt: now,
          updatedBy: authenticatedUserId,
        };

        // Multi-device sync for caller
        if (io && typeof io.to === "function") {
          io.to(`user:${authenticatedUserId}`).emit("message:status_update", statusPayload);
          io.to(`user:${authenticatedUserId}`).emit("message:read", statusPayload);
        }

        // If privacy allows, broadcast to sender(s)
        if (readReceiptsEnabled) {
          const affectedSenders = new Set();
          for (const msg of messages) {
            if (msg.sender) {
              affectedSenders.add(msg.sender.toString());
            }
          }

          for (const senderId of affectedSenders) {
            if (io && typeof io.to === "function") {
              io.to(`user:${senderId}`).emit("message:status_update", statusPayload);
              io.to(`user:${senderId}`).emit("message:read", statusPayload);
            }
            const senderSockets = userSockets.get(senderId);
            if (senderSockets) {
              for (const sockId of senderSockets) {
                if (socket.to && typeof socket.to === "function") {
                  socket.to(sockId).emit("message:status_update", statusPayload);
                  socket.to(sockId).emit("message:read", statusPayload);
                }
              }
            }
          }
        }

        return ack({
          success: true,
          status: "READ",
          messageIds: effectiveIds,
          suppressed: !readReceiptsEnabled,
        });
      } catch (err) {
        return ack({ success: false, error: "READ_RECEIPT_FAILED", message: err.message });
      }
    };

    socket.on("message:read", handleReadReceipt);
    socket.on("message:read_receipt", handleReadReceipt);

    // Phase 5 Module 9: Notification Socket Listeners
    socket.on("notification:mark_read", async (data, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      if (!authenticatedUserId) {
        return ack({ success: false, error: "UNAUTHORIZED" });
      }

      const { notificationId, notificationIds, markAll } = data || {};

      try {
        if (markAll) {
          const now = new Date();
          await NotificationModel.updateMany(
            { recipient: authenticatedUserId, isRead: false },
            { $set: { isRead: true, readAt: now } }
          );
          io.to(`user:${authenticatedUserId}`).emit("notification:count", { unreadCount: 0 });
          return ack({ success: true, unreadCount: 0 });
        }

        const ids = notificationId ? [notificationId] : (Array.isArray(notificationIds) ? notificationIds : []);
        if (ids.length > 0) {
          await NotificationModel.updateMany(
            { _id: { $in: ids }, recipient: authenticatedUserId },
            { $set: { isRead: true, readAt: new Date() } }
          );
        }

        const unreadCount = await NotificationModel.countDocuments({
          recipient: authenticatedUserId,
          isRead: false,
        });

        io.to(`user:${authenticatedUserId}`).emit("notification:count", { unreadCount });
        return ack({ success: true, unreadCount });
      } catch (err) {
        return ack({ success: false, error: "NOTIFICATION_UPDATE_FAILED", message: err.message });
      }
    });

    socket.on("notification:sync", async (_data, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      if (!authenticatedUserId) {
        return ack({ success: false, error: "UNAUTHORIZED" });
      }

      try {
        const [unreadCount, recentNotifications] = await Promise.all([
          NotificationModel.countDocuments({ recipient: authenticatedUserId, isRead: false }),
          NotificationModel.find({ recipient: authenticatedUserId })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean(),
        ]);

        return ack({
          success: true,
          unreadCount,
          notifications: recentNotifications,
        });
      } catch (err) {
        return ack({ success: false, error: "NOTIFICATION_SYNC_FAILED" });
      }
    });

    // Legacy event: send direct message
    // Authoritative sender: data.from is strictly bound to authenticatedUserId
    // Real-time delivery fan-out to all active recipient sockets
    socket.on("send-msg", (data) => {
      const sender = authenticatedUserId || (socket.user && socket.user.userId) || (data && data.from);
      if (data && data.to && sender) {
        const strSender = String(sender);
        const strTo = String(data.to);
        const payload = {
          to: strTo,
          from: strSender, // Server authoritative
          msg: data.msg,
        };

        if (io && typeof io.to === "function") {
          try {
            io.to(`user:${strTo}`).emit("msg-recieve", payload.msg);
          } catch (_) {}
        }

        const recipientSockets = userSockets.get(strTo) || userSockets.get(data.to);
        if (recipientSockets && recipientSockets.size > 0) {
          for (const sockId of recipientSockets) {
            socket.to(sockId).emit("msg-recieve", payload.msg);
          }
        } else {
          const sendUserSocket = onlineUsers.get(strTo) || onlineUsers.get(data.to);
          if (sendUserSocket) {
            socket.to(sendUserSocket).emit("msg-recieve", payload.msg);
          }
        }

        // Asynchronous non-blocking persistence
        (async () => {
          try {
            const hash = [strSender, strTo].sort().join(":");
            let conv = await ConversationModel.findOne({ participantHash: hash });
            if (!conv) {
              conv = await ConversationModel.create({
                participants: [strSender, strTo],
                participantHash: hash,
                type: "DIRECT",
              });
            }
            const savedMsg = await MessagesModel.create({
              conversationId: conv._id,
              message: { text: data.msg },
              users: [strSender, strTo],
              sender: strSender,
              status: "SENT",
            });
            conv.lastMessage = { text: data.msg, sender: strSender, createdAt: new Date() };
            conv.updatedAt = new Date();
            await conv.save();

            // Dispatch notification for legacy event
            await dispatchNotification({
              recipientId: strTo,
              senderId: strSender,
              type: "MESSAGE_RECEIVED",
              title: "New Message",
              body: data.msg.length > 100 ? `${data.msg.substring(0, 97)}...` : data.msg,
              conversationId: conv._id,
              messageId: savedMsg._id,
              dedupKey: `msg:${savedMsg._id}`,
              io,
              userSockets,
            });
          } catch (_) {}
        })();
      }
    });

    // Resilient Disconnect Lifecycle under Concurrent Sockets:
    // When one tab/socket disconnects, remove only that socket.
    // If the user still has other active sockets, onlineUsers is repointed to a remaining active socket.
    socket.on("disconnect", async () => {
      const activeId = authenticatedUserId || (socket.user && socket.user.userId);
      if (activeId) {
        const strId = String(activeId);
        const activeSet = userSockets.get(strId) || userSockets.get(activeId);
        if (activeSet) {
          activeSet.delete(socket.id);
          if (activeSet.size === 0) {
            userSockets.delete(strId);
            userSockets.delete(activeId);
            onlineUsers.delete(strId);
            onlineUsers.delete(activeId);
          } else {
            // Keep onlineUsers mapped to the most recent remaining socket
            const remaining = Array.from(activeSet);
            onlineUsers.set(strId, remaining[remaining.length - 1]);
          }
        } else if ((onlineUsers.get(strId) || onlineUsers.get(activeId)) === socket.id) {
          onlineUsers.delete(strId);
          onlineUsers.delete(activeId);
        }

        // Notify presenceEngine
        try {
          const { isLastSession, lastSeenDate } = await presenceEngine.unregisterConnection(
            strId,
            socket.id
          );
          if (isLastSession) {
            socket.broadcast.emit("presence:update", {
              userId: strId,
              isOnline: false,
              lastSeen: lastSeenDate,
            });
          }
        } catch (_) {}
      }
    });
  });

  console.log("⚡ Socket.IO Gateway initialized with authentication & strict origin validation");
  return io;
}

module.exports = {
  initSocketGateway,
};
