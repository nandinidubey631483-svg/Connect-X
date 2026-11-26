/**
 * ConnectX Conversations Routes (v1 API)
 * 
 * - GET /api/v1/conversations: List user's conversations
 * - POST /api/v1/conversations: Create or retrieve one-to-one conversation
 * - GET /api/v1/conversations/:conversationId: Get conversation details (membership checked)
 * - PUT /api/v1/conversations/:conversationId/read: Mark conversation as read
 */
const express = require("express");
const router = express.Router();

const conversationController = require("../controllers/conversationController");
const { authenticateToken, requireAuth } = require("../middleware/authMiddleware");
const { csrfProtection } = require("../middleware/csrfMiddleware");
const { validateOrigin } = require("../middleware/validateOrigin");

// All conversation endpoints require authentication
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", conversationController.getUserConversations);
router.post("/", validateOrigin, csrfProtection, conversationController.createOrGetConversation);
router.get("/:conversationId", conversationController.getConversationById);
router.put("/:conversationId/read", validateOrigin, csrfProtection, conversationController.markConversationRead);

module.exports = router;
