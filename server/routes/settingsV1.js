/**
 * ConnectX Settings Routes (v1 API)
 * 
 * - GET /api/v1/settings: Retrieve user settings
 * - PUT /api/v1/settings: Update user settings
 * - POST /api/v1/settings/reset: Revert to default settings
 */
const express = require("express");
const router = express.Router();

const settingsController = require("../controllers/settingsController");
const { authenticateToken, requireAuth } = require("../middleware/authMiddleware");
const { csrfProtection } = require("../middleware/csrfMiddleware");
const { validateOrigin } = require("../middleware/validateOrigin");

// All settings endpoints require active authentication
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", settingsController.getSettings);
router.put("/", validateOrigin, csrfProtection, settingsController.updateSettings);
router.post("/reset", validateOrigin, csrfProtection, settingsController.resetSettings);

module.exports = router;
