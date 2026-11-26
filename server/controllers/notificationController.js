/**
 * ConnectX Notification Controller (Phase 5 Module 9)
 * 
 * Provides:
 * - getUserNotifications: Paginated notification list for authenticated user
 * - getUnreadCount: Fast unread count for badge indicators
 * - markAsRead: Marks single notification or set of IDs as read
 * - markAllAsRead: Marks all notifications for user as read
 * - deleteNotification: Deletes notification belonging to user
 * 
 * Invariants:
 * - Strict user authorization: Only req.user.userId can view or modify their notifications
 * - Fast idempotent read marking
 */
const Notification = require("../models/notificationModel");
const AppError = require("../utils/appError");

/**
 * GET /api/v1/notifications
 * Paginated query for authenticated user notifications
 */
async function getUserNotifications(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const unreadOnly = req.query.unread === "true";
    const filter = { recipient: userId };
    if (unreadOnly) {
      filter.isRead = false;
    }

    const [total, unreadCount, rawNotifications] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: userId, isRead: false }),
      Notification.find(filter)
        .populate("sender", "username displayName avatarImage isAvatarImageSet")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const notifications = rawNotifications.map((n) => ({
      _id: n._id,
      recipient: n.recipient,
      sender: n.sender || null,
      type: n.type,
      title: n.title,
      body: n.body,
      conversationId: n.conversationId || null,
      messageId: n.messageId || null,
      isRead: n.isRead,
      readAt: n.readAt || null,
      createdAt: n.createdAt,
    }));

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: skip + notifications.length < total,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/notifications/unread-count
 * Returns unread notification count
 */
async function getUnreadCount(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/notifications/:id/read
 * Marks a single notification as read
 */
async function markNotificationAsRead(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { id } = req.params;
    const notification = await Notification.findById(id);

    if (!notification) {
      return next(new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND"));
    }

    // Ownership validation
    if (notification.recipient.toString() !== userId.toString()) {
      return next(
        new AppError("You are not authorized to modify this notification", 403, "NOTIFICATION_ACCESS_DENIED")
      );
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      notification: {
        _id: notification._id,
        isRead: notification.isRead,
        readAt: notification.readAt,
      },
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/notifications/read-all
 * Marks all notifications for the user as read
 */
async function markAllNotificationsAsRead(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const now = new Date();
    const result = await Notification.updateMany(
      { recipient: userId, isRead: false },
      { $set: { isRead: true, readAt: now } }
    );

    return res.status(200).json({
      success: true,
      markedCount: result.modifiedCount || 0,
      unreadCount: 0,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/notifications/:id
 * Deletes a notification belonging to the user
 */
async function deleteNotification(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { id } = req.params;
    const notification = await Notification.findById(id);

    if (!notification) {
      return next(new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND"));
    }

    if (notification.recipient.toString() !== userId.toString()) {
      return next(
        new AppError("You are not authorized to delete this notification", 403, "NOTIFICATION_ACCESS_DENIED")
      );
    }

    await Notification.deleteOne({ _id: id });

    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
};
