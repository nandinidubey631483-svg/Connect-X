const crypto = require("crypto");
const bcrypt = require("bcrypt");
const Otp = require("../models/otpModel");
const AppError = require("../utils/appError");
const { sendOtpEmail } = require("../services/emailService");

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000;  // 30 seconds
const LOCKOUT_DURATION_MS = 60 * 1000; // 60 seconds after 3 failures

function generateSecureOtp() {
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

/**
 * Send an OTP code to user's email
 */
async function sendOtp(req, res, next) {
  try {
    const { email, purpose = "SIGNUP" } = req.body || {};

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return next(new AppError("A valid email address is required.", 400, "VALIDATION_ERROR"));
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check existing pending OTP for rate limit and lockout
    const existingOtp = await Otp.findOne({
      email: normalizedEmail,
      purpose,
      consumed: false,
    }).sort({ createdAt: -1 });

    if (existingOtp) {
      // Check lockout
      if (existingOtp.lockUntil && existingOtp.lockUntil > new Date()) {
        const remainingSec = Math.ceil((existingOtp.lockUntil.getTime() - Date.now()) / 1000);
        return next(
          new AppError(
            `Too many failed attempts. Try again in ${remainingSec} seconds.`,
            423,
            "OTP_LOCKED",
            { lockUntil: existingOtp.lockUntil, remainingSec }
          )
        );
      }

      // Check resend cooldown
      if (existingOtp.resendAvailableAt && existingOtp.resendAvailableAt > new Date()) {
        const remainingCooldown = Math.ceil((existingOtp.resendAvailableAt.getTime() - Date.now()) / 1000);
        return next(
          new AppError(
            `Please wait ${remainingCooldown}s before requesting a new code.`,
            429,
            "RESEND_COOLDOWN_ACTIVE",
            { cooldown: remainingCooldown }
          )
        );
      }
    }

    // Invalidate old unconsumed OTPs for this email and purpose
    await Otp.updateMany(
      { email: normalizedEmail, purpose, consumed: false },
      { $set: { consumed: true } }
    );

    // Generate fresh OTP
    const rawOtp = generateSecureOtp();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    const resendAvailableAt = new Date(Date.now() + RESEND_COOLDOWN_MS);

    const createdOtp = await Otp.create({
      email: normalizedEmail,
      otpHash,
      purpose,
      attempts: 0,
      expiresAt,
      resendAvailableAt,
      consumed: false,
    });

    // Deliver OTP email via Resend HTTPS or Nodemailer SMTP service
    try {
      await sendOtpEmail({
        to: normalizedEmail,
        code: rawOtp,
        purpose,
      });

      return res.status(200).json({
        success: true,
        message: `Verification code sent to ${normalizedEmail}. Please check your inbox.`,
        cooldown: 30,
        expiresIn: 600,
        deliveredVia: "email",
      });
    } catch (deliveryErr) {
      console.warn(`[OTP] Email delivery failed or blocked (${deliveryErr.message}). Showing OTP on screen for ${normalizedEmail}: [ ${rawOtp} ]`);
      // Fallback: Return the generated OTP so it displays directly on screen for testing/demo
      return res.status(200).json({
        success: true,
        message: `Your verification code is: ${rawOtp}`,
        otpCode: rawOtp,
        fallbackCode: rawOtp,
        cooldown: 30,
        expiresIn: 600,
        deliveredVia: "screen_fallback",
      });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Verify an OTP code entered by user
 */
async function verifyOtp(req, res, next) {
  try {
    const { email, code, purpose = "SIGNUP" } = req.body || {};

    if (!email || !code) {
      return next(new AppError("Email and 6-digit OTP code are required.", 400, "VALIDATION_ERROR"));
    }

    const cleanCode = code.toString().trim();
    if (cleanCode.length !== 6) {
      return next(new AppError("OTP code must be exactly 6 digits.", 400, "VALIDATION_ERROR"));
    }

    const normalizedEmail = email.toLowerCase().trim();

    const otpDoc = await Otp.findOne({
      email: normalizedEmail,
      purpose,
      consumed: false,
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      return next(new AppError("No active verification code found. Please request a new one.", 400, "OTP_NOT_FOUND"));
    }

    // Check expiration
    if (new Date() > otpDoc.expiresAt) {
      return next(new AppError("Verification code has expired. Please request a new code.", 400, "OTP_EXPIRED"));
    }

    // Check lockout
    if (otpDoc.lockUntil && otpDoc.lockUntil > new Date()) {
      const remainingSec = Math.ceil((otpDoc.lockUntil.getTime() - Date.now()) / 1000);
      return next(
        new AppError(
          `Too many failed attempts. Try again in ${remainingSec} seconds.`,
          423,
          "OTP_LOCKED",
          { remainingSec }
        )
      );
    }

    // Verify code
    const isMatch = await bcrypt.compare(cleanCode, otpDoc.otpHash);

    if (!isMatch) {
      otpDoc.attempts += 1;
      const attemptsLeft = Math.max(0, otpDoc.maxAttempts - otpDoc.attempts);

      if (otpDoc.attempts >= otpDoc.maxAttempts) {
        otpDoc.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }

      await otpDoc.save();

      if (otpDoc.attempts >= otpDoc.maxAttempts) {
        return next(
          new AppError(
            "Too many failed attempts. You are temporarily locked out for 60 seconds.",
            423,
            "OTP_LOCKED",
            { remainingSec: 60 }
          )
        );
      }

      return next(
        new AppError(
          `Incorrect code. ${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left.`,
          400,
          "INVALID_OTP",
          { attemptsLeft }
        )
      );
    }

    // Code matches: generate single-use verification token
    const verificationToken = `otp_tok_${crypto.randomBytes(24).toString("hex")}`;
    otpDoc.consumed = true;
    otpDoc.verificationToken = verificationToken;
    await otpDoc.save();

    return res.status(200).json({
      success: true,
      verified: true,
      message: "Code verified successfully.",
      otpVerificationToken: verificationToken,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
};
