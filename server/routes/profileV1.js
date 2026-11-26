/**
 * ConnectX Profile Routes (v1 API)
 * 
 * - GET /api/v1/profile/me: Fetch own profile (requires auth)
 * - PUT /api/v1/profile/me: Update own profile (requires auth + CSRF)
 * - POST /api/v1/profile/avatar: Update avatar image (requires auth + CSRF)
 * - GET /api/v1/profile/:id: Fetch public profile of user (requires auth)
 */
const express = require("express");
const router = express.Router();

const profileController = require("../controllers/profileController");
const { authenticateToken, requireAuth } = require("../middleware/authMiddleware");
const { csrfProtection } = require("../middleware/csrfMiddleware");
const { validateOrigin } = require("../middleware/validateOrigin");

// All profile endpoints require authenticated session
router.use(authenticateToken);
router.use(requireAuth);

router.get("/me", profileController.getMyProfile);
router.put("/me", validateOrigin, csrfProtection, profileController.updateMyProfile);
router.post("/avatar", validateOrigin, csrfProtection, profileController.updateAvatar);
router.get("/:id", profileController.getUserPublicProfile);

module.exports = router;
