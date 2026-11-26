/**
 * ConnectX Notification Service (Phase 5 Module 9)
 * 
 * Central helper for dispatching notifications respecting:
 * - User notification preferences (pushNotifications, soundEnabled, desktopAlerts)
 * - Duplicate prevention via dedupKey
 * - Real-time Socket.IO fanout
 */
const Notification = require("./notificationModel");
const UserSettings = require("./userSettingsModel");

async function dispatchNotification({
  recipientId,
  senderId,
  type,
  title,
  body,
  conversationId,
  messageId,
  dedupKey,
  io,
  userSockets,
}) {
  if (!recipientId || !type || !title || !body || !dedupKey) {
    return null;
  }

  // Prevent sending notifications to oneself
  if (senderId && recipientId.toString() === senderId.toString()) {
    return null;
  }

  try {
    // 1. Check recipient user preferences
    let pushEnabled = true;
    let soundEnabled = true;
    let desktopAlerts = true;

    try {
      const settings = await UserSettings.findOne({ userId: recipientId });
      if (settings && settings.notifications) {
        if (settings.notifications.pushNotifications === false) {
          pushEnabled = false;
        }
        if (settings.notifications.soundEnabled === false) {
          soundEnabled = false;
        }
        if (settings.notifications.desktopAlerts === false) {
          desktopAlerts = false;
        }
      }
    } catch (_) {}

    // 2. Persist notification with duplicate protection
    let notificationDoc = null;
    try {
      notificationDoc = await Notification.create({
        recipient: recipientId,
        sender: senderId || null,
        type,
        title,
        body,
        conversationId: conversationId || null,
        messageId: messageId || null,
        dedupKey,
        isRead: false,
      });
    } catch (err) {
      // If duplicate key error (E11000), ignore and return existing
      if (err.code === 11000) {
        notificationDoc = await Notification.findOne({
          recipient: recipientId,
          dedupKey,
        });
      } else {
        throw err;
      }
    }

    if (!notificationDoc) return null;

    // 3. Count total unread notifications for recipient
    const unreadCount = await Notification.countDocuments({
      recipient: recipientId,
      isRead: false,
    });

    const payload = {
      _id: notificationDoc._id,
      recipient: notificationDoc.recipient,
      sender: notificationDoc.sender,
      type: notificationDoc.type,
      title: notificationDoc.title,
      body: notificationDoc.body,
      conversationId: notificationDoc.conversationId,
      messageId: notificationDoc.messageId,
      isRead: notificationDoc.isRead,
      createdAt: notificationDoc.createdAt,
      soundEnabled,
      desktopAlerts,
      pushEnabled,
    };

    // 4. Real-time broadcast if push notifications are enabled
    if (pushEnabled) {
      if (io && typeof io.to === "function") {
        io.to(`user:${recipientId}`).emit("notification:new", payload);
        io.to(`user:${recipientId}`).emit("notification:count", { unreadCount });
      }
      if (userSockets && typeof userSockets.get === "function") {
        const sockSet = userSockets.get(recipientId.toString());
        if (sockSet) {
          for (const sId of sockSet) {
            if (io && io.sockets && io.sockets.sockets && io.sockets.sockets.get) {
              const s = io.sockets.sockets.get(sId);
              if (s && typeof s.emit === "function") {
                s.emit("notification:new", payload);
                s.emit("notification:count", { unreadCount });
              }
            }
          }
        }
      }
    }

    return {
      notification: payload,
      unreadCount,
    };
  } catch (err) {
    console.error("[dispatchNotification error]", err.message);
    return null;
  }
}

module.exports = {
  dispatchNotification,
};
