/**
 * ConnectX Contacts & Social Graph Routes (v1 API)
 * 
 * - GET /api/v1/contacts: List confirmed contacts
 * - GET /api/v1/contacts/search: Search & discover users with pagination
 * - GET /api/v1/contacts/requests: List incoming and outgoing pending requests
 * - POST /api/v1/contacts/request: Send contact request
 * - POST /api/v1/contacts/request/:requestId/accept: Accept contact request
 * - POST /api/v1/contacts/request/:requestId/reject: Reject contact request
 * - POST /api/v1/contacts/request/:requestId/cancel: Cancel contact request
 * - DELETE /api/v1/contacts/request/:requestId: Cancel contact request (RESTful alias)
 * - DELETE /api/v1/contacts/:contactId: Remove confirmed contact
 */
const express = require("express");
const router = express.Router();

const contactController = require("../controllers/contactController");
const { authenticateToken, requireAuth } = require("../middleware/authMiddleware");
const { csrfProtection } = require("../middleware/csrfMiddleware");
const { validateOrigin } = require("../middleware/validateOrigin");

// All contacts endpoints require active authentication
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", contactController.getContacts);
router.get("/search", contactController.searchUsers);
router.get("/requests", contactController.getContactRequests);

router.post("/request", validateOrigin, csrfProtection, contactController.sendContactRequest);
router.post("/request/:requestId/accept", validateOrigin, csrfProtection, contactController.acceptContactRequest);
router.post("/request/:requestId/reject", validateOrigin, csrfProtection, contactController.rejectContactRequest);
router.post("/request/:requestId/cancel", validateOrigin, csrfProtection, contactController.cancelContactRequest);
router.delete("/request/:requestId", validateOrigin, csrfProtection, contactController.cancelContactRequest);
router.delete("/:contactId", validateOrigin, csrfProtection, contactController.removeContact);

module.exports = router;
