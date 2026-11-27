/**
 * ConnectX Authentication Routes (v1 API)
 * 
 * Provides:
 * - Public Registration & Login with rate limiting and origin validation
 * - Public CSRF token issuance
 * - CSRF-protected Refresh and Logout
 * - Bearer-token protected Logout-All and Me endpoints
 */
const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const captchaController = require("../controllers/captchaController");
const otpController = require("../controllers/otpController");
const { validateOrigin } = require("../middleware/validateOrigin");
const { csrfProtection } = require("../middleware/csrfMiddleware");
const {
  authRegisterRateLimiter,
  authLoginRateLimiter,
  authRefreshRateLimiter,
  csrfTokenRateLimiter,
  otpSendRateLimiter,
  otpVerifyRateLimiter,
} = require("../middleware/rateLimiter");
const { authenticateToken, requireAuth } = require("../middleware/authMiddleware");

// Public authentication endpoints
router.post("/register", validateOrigin, authRegisterRateLimiter, authController.register);
router.post("/login", validateOrigin, authLoginRateLimiter, authController.login);
router.get("/csrf-token", csrfTokenRateLimiter, authController.getCsrfToken);

// CAPTCHA endpoints
router.post("/captcha/generate", validateOrigin, captchaController.generateCaptcha);
router.post("/captcha/verify", validateOrigin, captchaController.verifyCaptcha);

// OTP endpoints
router.post("/otp/send", validateOrigin, otpSendRateLimiter, otpController.sendOtp);
router.post("/otp/verify", validateOrigin, otpVerifyRateLimiter, otpController.verifyOtp);

// Session endpoints protected by CSRF verification
router.post("/refresh", validateOrigin, csrfProtection, authRefreshRateLimiter, authController.refresh);
router.post("/logout", validateOrigin, csrfProtection, authController.logout);

// Protected endpoints requiring valid Bearer access token
router.post(
  "/logout-all",
  authenticateToken,
  requireAuth,
  validateOrigin,
  csrfProtection,
  authController.logoutAll
);
router.get("/me", authenticateToken, requireAuth, authController.getMe);

module.exports = router;
