/**
 * ConnectX Notifications Routes (v1 API)
 * 
 * - GET /api/v1/notifications: List user notifications (paginated)
 * - GET /api/v1/notifications/unread-count: Get unread count
 * - PUT /api/v1/notifications/read-all: Mark all notifications as read
 * - PUT /api/v1/notifications/:id/read: Mark single notification as read
 * - DELETE /api/v1/notifications/:id: Delete single notification
 */
const express = require("express");
const router = express.Router();

const notificationController = require("../controllers/notificationController");
const { authenticateToken, requireAuth } = require("../middleware/authMiddleware");
const { csrfProtection } = require("../middleware/csrfMiddleware");
const { validateOrigin } = require("../middleware/validateOrigin");

// All notification routes require active authentication
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", notificationController.getUserNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.put("/read-all", validateOrigin, csrfProtection, notificationController.markAllNotificationsAsRead);
router.put("/:id/read", validateOrigin, csrfProtection, notificationController.markNotificationAsRead);
router.delete("/:id", validateOrigin, csrfProtection, notificationController.deleteNotification);

module.exports = router;
