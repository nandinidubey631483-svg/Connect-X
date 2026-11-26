/**
 * ConnectX Call Routes (Module 11: Real-Time Voice & Video Calling)
 * 
 * - GET /api/v1/calls/ice-servers: STUN / TURN configuration
 * - GET /api/v1/calls: Paginated call history
 * - GET /api/v1/calls/:callId: Single call details
 * - POST /api/v1/calls/initiate: Create call session
 */
const express = require("express");
const router = express.Router();

const callController = require("../controllers/callController");
const { authenticateToken, requireAuth } = require("../middleware/authMiddleware");
const { csrfProtection } = require("../middleware/csrfMiddleware");
const { validateOrigin } = require("../middleware/validateOrigin");

router.use(authenticateToken);
router.use(requireAuth);

router.get("/ice-servers", callController.getIceServers);
router.get("/", callController.getCallHistory);
router.get("/:callId", callController.getCallById);
router.post("/initiate", validateOrigin, csrfProtection, callController.initiateCall);

module.exports = router;
