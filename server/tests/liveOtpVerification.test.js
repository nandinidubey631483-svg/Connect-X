const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Otp = require("../models/otpModel");
const User = require("../models/userModel");
const otpController = require("../controllers/otpController");
const authController = require("../controllers/authController");
const AppError = require("../utils/appError");

function createMockHttp({ body = {}, ip = "127.0.0.1" } = {}) {
  const req = {
    body,
    ip,
    method: "POST",
    headers: { origin: "http://localhost:3000" },
  };

  const res = {
    statusCode: 200,
    body: null,
    cookies: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    cookie(name, val, opts) {
      this.cookies[name] = { val, opts };
      return this;
    },
  };

  let nextErr = null;
  const next = (err) => {
    nextErr = err;
  };

  return { req, res, next, getNextError: () => nextErr };
}

test.before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect("mongodb://127.0.0.1:27017/chat");
  }
});

test.after(async () => {
  await Otp.deleteMany({ email: /@test-otp-lifecycle\.local$/i });
  await User.deleteMany({ email: /@test-otp-lifecycle\.local$/i });
  await mongoose.disconnect();
});

test("OTP Full End-to-End Lifecycle Verification", async (t) => {
  const testEmail = `user_${Date.now()}@test-otp-lifecycle.local`;

  // 1. Generate & Send OTP
  const sendHttp = createMockHttp({ body: { email: testEmail, purpose: "SIGNUP" } });
  await otpController.sendOtp(sendHttp.req, sendHttp.res, sendHttp.next);

  assert.equal(sendHttp.res.statusCode, 200);
  assert.equal(sendHttp.res.body.success, true);
  assert.ok(sendHttp.res.body.devCode, "devCode should be returned in development");
  assert.equal(sendHttp.res.body.devCode.length, 6);
  const otpCode = sendHttp.res.body.devCode;

  // Verify OTP persisted securely in MongoDB as a hash (not plaintext)
  const otpDoc = await Otp.findOne({ email: testEmail, consumed: false });
  assert.ok(otpDoc);
  assert.notEqual(otpDoc.otpHash, otpCode);
  assert.equal(otpDoc.consumed, false);

  // 2. Cooldown check - immediate resend must fail with 429
  const resendHttp = createMockHttp({ body: { email: testEmail, purpose: "SIGNUP" } });
  await otpController.sendOtp(resendHttp.req, resendHttp.res, resendHttp.next);
  const resendErr = resendHttp.getNextError();
  assert.ok(resendErr instanceof AppError);
  assert.equal(resendErr.statusCode, 429);
  assert.equal(resendErr.code, "RESEND_COOLDOWN_ACTIVE");

  // 3. Invalid OTP attempt
  const badCodeHttp = createMockHttp({ body: { email: testEmail, code: "000000", purpose: "SIGNUP" } });
  await otpController.verifyOtp(badCodeHttp.req, badCodeHttp.res, badCodeHttp.next);
  const badErr = badCodeHttp.getNextError();
  assert.ok(badErr instanceof AppError);
  assert.equal(badErr.statusCode, 400);
  assert.equal(badErr.code, "INVALID_OTP");

  // Check attempt counter was incremented
  const docAfterBad = await Otp.findById(otpDoc._id);
  assert.equal(docAfterBad.attempts, 1);

  // 4. Rate-limit / Lockout check (fail 2 more times to reach maxAttempts 3)
  for (let i = 0; i < 2; i++) {
    const retryHttp = createMockHttp({ body: { email: testEmail, code: "000000", purpose: "SIGNUP" } });
    await otpController.verifyOtp(retryHttp.req, retryHttp.res, retryHttp.next);
  }
  const lockedDoc = await Otp.findById(otpDoc._id);
  assert.equal(lockedDoc.attempts, 3);
  assert.ok(lockedDoc.lockUntil > new Date());

  // Subsequent verification during lockout returns 423
  const lockedHttp = createMockHttp({ body: { email: testEmail, code: otpCode, purpose: "SIGNUP" } });
  await otpController.verifyOtp(lockedHttp.req, lockedHttp.res, lockedHttp.next);
  const lockErr = lockedHttp.getNextError();
  assert.ok(lockErr instanceof AppError);
  assert.equal(lockErr.statusCode, 423);
  assert.equal(lockErr.code, "OTP_LOCKED");

  // 5. Expiration check
  const expiredEmail = `expired_${Date.now()}@test-otp-lifecycle.local`;
  const sendExpHttp = createMockHttp({ body: { email: expiredEmail, purpose: "SIGNUP" } });
  await otpController.sendOtp(sendExpHttp.req, sendExpHttp.res, sendExpHttp.next);
  const expCode = sendExpHttp.res.body.devCode;

  // Artificially expire the OTP
  await Otp.updateOne({ email: expiredEmail }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

  const verifyExpHttp = createMockHttp({ body: { email: expiredEmail, code: expCode, purpose: "SIGNUP" } });
  await otpController.verifyOtp(verifyExpHttp.req, verifyExpHttp.res, verifyExpHttp.next);
  const expErr = verifyExpHttp.getNextError();
  assert.ok(expErr instanceof AppError);
  assert.equal(expErr.statusCode, 400);
  assert.equal(expErr.code, "OTP_EXPIRED");

  // 6. Valid OTP verification
  const validEmail = `valid_${Date.now()}@test-otp-lifecycle.local`;
  const sendValidHttp = createMockHttp({ body: { email: validEmail, purpose: "SIGNUP" } });
  await otpController.sendOtp(sendValidHttp.req, sendValidHttp.res, sendValidHttp.next);
  const validCode = sendValidHttp.res.body.devCode;

  const verifyValidHttp = createMockHttp({ body: { email: validEmail, code: validCode, purpose: "SIGNUP" } });
  await otpController.verifyOtp(verifyValidHttp.req, verifyValidHttp.res, verifyValidHttp.next);

  assert.equal(verifyValidHttp.res.statusCode, 200);
  assert.equal(verifyValidHttp.res.body.verified, true);
  assert.ok(verifyValidHttp.res.body.otpVerificationToken.startsWith("otp_tok_"));
  const verificationToken = verifyValidHttp.res.body.otpVerificationToken;

  // Verify OTP was marked as consumed
  const consumedDoc = await Otp.findOne({ email: validEmail, verificationToken });
  assert.ok(consumedDoc);
  assert.equal(consumedDoc.consumed, true);

  // 7. Replay / Reuse prevention - attempting to verify the same code again fails
  const reuseCodeHttp = createMockHttp({ body: { email: validEmail, code: validCode, purpose: "SIGNUP" } });
  await otpController.verifyOtp(reuseCodeHttp.req, reuseCodeHttp.res, reuseCodeHttp.next);
  const reuseCodeErr = reuseCodeHttp.getNextError();
  assert.ok(reuseCodeErr instanceof AppError);
  assert.equal(reuseCodeErr.statusCode, 400);
  assert.equal(reuseCodeErr.code, "OTP_NOT_FOUND"); // consumed OTPs are excluded

  // 8. Registration using the verification token
  const regHttp = createMockHttp({
    body: {
      username: `user_${Date.now()}`,
      email: validEmail,
      password: "StrongPassword123!",
      otpVerificationToken: verificationToken,
    },
  });
  await authController.register(regHttp.req, regHttp.res, regHttp.next);
  if (regHttp.getNextError()) {
    console.error("regHttp error:", regHttp.getNextError());
  }
  assert.equal(regHttp.res.statusCode, 201);
  assert.equal(regHttp.res.body.success, true);
  assert.ok(regHttp.res.body.user);
  assert.equal(regHttp.res.body.user.email, validEmail);

  // 9. Replay prevention for registration: attempting to register again with the same token fails
  const replayRegHttp = createMockHttp({
    body: {
      username: `user_replay_${Date.now()}`,
      email: validEmail,
      password: "StrongPassword123!",
      otpVerificationToken: verificationToken,
    },
  });
  await authController.register(replayRegHttp.req, replayRegHttp.res, replayRegHttp.next);
  const replayErr = replayRegHttp.getNextError();
  assert.ok(replayErr instanceof AppError);
  assert.equal(replayErr.statusCode, 400);
  assert.equal(replayErr.code, "INVALID_OTP_TOKEN");
});
