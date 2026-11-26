/**
 * ConnectX Messages Routes (v1 API)
 * 
 * - GET /api/v1/messages/:conversationId: Paginated message history (membership verified)
 * - POST /api/v1/messages: Send & persist message (server-authoritative sender)
 */
const express = require("express");
const router = express.Router();

const messageController = require("../controllers/messageController");
const { authenticateToken, requireAuth } = require("../middleware/authMiddleware");
const { csrfProtection } = require("../middleware/csrfMiddleware");
const { validateOrigin } = require("../middleware/validateOrigin");

// All message endpoints require active authentication
router.use(authenticateToken);
router.use(requireAuth);

// Module 8 Media Routes (mounted before /:conversationId to prevent route conflict)
router.get("/media/:messageId", messageController.getMediaFile);
router.get("/:messageId/download", messageController.getMediaFile);
router.post("/upload", validateOrigin, csrfProtection, messageController.uploadMedia);

router.get("/:conversationId", messageController.getConversationMessages);
router.post("/", validateOrigin, csrfProtection, messageController.sendMessage);

// Receipt and status endpoints (Module 7)
router.put("/status", validateOrigin, csrfProtection, messageController.updateMessageStatus);
router.put("/conversation/:conversationId/read", validateOrigin, csrfProtection, messageController.markConversationMessagesRead);
router.put("/:messageId/status", validateOrigin, csrfProtection, messageController.updateMessageStatus);

module.exports = router;
