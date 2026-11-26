const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcrypt");

const Otp = require("../models/otpModel");
const Captcha = require("../models/captchaModel");
const captchaController = require("../controllers/captchaController");
const otpController = require("../controllers/otpController");
const authController = require("../controllers/authController");
const AppError = require("../utils/appError");

function createMockHttp({ body = {}, params = {}, query = {}, user = null } = {}) {
  const req = {
    body,
    params,
    query,
    user,
    ip: "127.0.0.1",
    method: "POST",
  };

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };

  let nextErr = null;
  const next = (err) => {
    nextErr = err;
  };

  return { req, res, next, getNextError: () => nextErr };
}

describe("OTP & CAPTCHA Engine Tests", () => {
  let origCaptchaCreate, origCaptchaFindOne;
  let origOtpFindOne, origOtpCreate, origOtpUpdateMany;

  beforeEach(() => {
    origCaptchaCreate = Captcha.create;
    origCaptchaFindOne = Captcha.findOne;
    origOtpFindOne = Otp.findOne;
    origOtpCreate = Otp.create;
    origOtpUpdateMany = Otp.updateMany;
  });

  afterEach(() => {
    Captcha.create = origCaptchaCreate;
    Captcha.findOne = origCaptchaFindOne;
    Otp.findOne = origOtpFindOne;
    Otp.create = origOtpCreate;
    Otp.updateMany = origOtpUpdateMany;
  });

  describe("CAPTCHA Verification", () => {
    test("generates a CAPTCHA challenge with captchaId, svg, and code", async () => {
      let createdDoc = null;
      Captcha.create = async (doc) => {
        createdDoc = doc;
        return doc;
      };

      const { req, res, next } = createMockHttp();
      await captchaController.generateCaptcha(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.captchaId.startsWith("cpt_"));
      assert.ok(res.body.svg.includes("<svg"));
      assert.ok(res.body.code);
      assert.ok(createdDoc);
      assert.strictEqual(createdDoc.solution, res.body.code);
    });

    test("rejects verification if captchaId or solution is missing", async () => {
      const { req, res, next, getNextError } = createMockHttp({ body: {} });
      await captchaController.verifyCaptcha(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "CAPTCHA_REQUIRED");
    });

    test("rejects incorrect CAPTCHA solution", async () => {
      Captcha.findOne = async () => ({
        captchaId: "cpt_123",
        solution: "ABCD2",
        consumed: false,
        expiresAt: new Date(Date.now() + 60000),
      });

      const { req, res, next, getNextError } = createMockHttp({
        body: { captchaId: "cpt_123", solution: "WRONG" },
      });
      await captchaController.verifyCaptcha(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "CAPTCHA_MISMATCH");
    });

    test("successfully verifies correct solution and prevents reuse", async () => {
      let saved = false;
      const mockCaptcha = {
        captchaId: "cpt_123",
        solution: "ABCD2",
        consumed: false,
        expiresAt: new Date(Date.now() + 60000),
        async save() {
          saved = true;
          this.consumed = true;
        },
      };

      Captcha.findOne = async () => mockCaptcha;

      const { req, res, next } = createMockHttp({
        body: { captchaId: "cpt_123", solution: "abcd2" }, // case-insensitive
      });
      await captchaController.verifyCaptcha(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.verifiedToken.startsWith("cap_ok_"));
      assert.strictEqual(saved, true);
      assert.strictEqual(mockCaptcha.consumed, true);

      // Subsequent attempt on consumed captcha
      const reuse = createMockHttp({
        body: { captchaId: "cpt_123", solution: "ABCD2" },
      });
      await captchaController.verifyCaptcha(reuse.req, reuse.res, reuse.next);
      assert.strictEqual(reuse.getNextError().statusCode, 400);
      assert.strictEqual(reuse.getNextError().code, "CAPTCHA_ALREADY_USED");
    });
  });

  describe("OTP Generation & Verification", () => {
    const testEmail = "test_user_otp@connectx.local";

    test("rejects invalid email address on sendOtp", async () => {
      const { req, res, next, getNextError } = createMockHttp({ body: { email: "invalid-email" } });
      await otpController.sendOtp(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
    });

    test("sends OTP and sets resend cooldown", async () => {
      Otp.findOne = () => ({
        sort: () => Promise.resolve(null),
      });
      Otp.updateMany = async () => ({ modifiedCount: 0 });
      let createdOtp = null;
      Otp.create = async (doc) => {
        createdOtp = doc;
        return doc;
      };

      const { req, res, next } = createMockHttp({ body: { email: testEmail } });
      await otpController.sendOtp(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.cooldown, 30);
      assert.ok(res.body.devCode);
      assert.strictEqual(res.body.devCode.length, 6);
      assert.ok(createdOtp);
      assert.strictEqual(createdOtp.email, testEmail);
    });

    test("enforces active resend cooldown with 429", async () => {
      const activeCooldownOtp = {
        email: testEmail,
        consumed: false,
        resendAvailableAt: new Date(Date.now() + 20000), // 20s remaining
      };

      Otp.findOne = () => ({
        sort: () => Promise.resolve(activeCooldownOtp),
      });

      const { req, res, next, getNextError } = createMockHttp({ body: { email: testEmail } });
      await otpController.sendOtp(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 429);
      assert.strictEqual(err.code, "RESEND_COOLDOWN_ACTIVE");
    });

    test("decrements attempts on wrong code and locks out on 3 failures", async () => {
      const hashed = await bcrypt.hash("123456", 10);
      const mockDoc = {
        email: testEmail,
        otpHash: hashed,
        attempts: 2, // already failed twice
        maxAttempts: 3,
        consumed: false,
        expiresAt: new Date(Date.now() + 600000),
        lockUntil: null,
        async save() {},
      };

      Otp.findOne = () => ({
        sort: () => Promise.resolve(mockDoc),
      });

      const { req, res, next, getNextError } = createMockHttp({
        body: { email: testEmail, code: "000000" },
      });
      await otpController.verifyOtp(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 423);
      assert.strictEqual(err.code, "OTP_LOCKED");
      assert.strictEqual(mockDoc.attempts, 3);
      assert.ok(mockDoc.lockUntil > new Date());
    });

    test("successfully verifies correct code and creates verification token", async () => {
      const hashed = await bcrypt.hash("852963", 10);
      let saved = false;
      const mockDoc = {
        email: testEmail,
        otpHash: hashed,
        attempts: 0,
        maxAttempts: 3,
        consumed: false,
        expiresAt: new Date(Date.now() + 600000),
        lockUntil: null,
        verificationToken: null,
        async save() {
          saved = true;
        },
      };

      Otp.findOne = () => ({
        sort: () => Promise.resolve(mockDoc),
      });

      const { req, res, next } = createMockHttp({
        body: { email: testEmail, code: "852963" },
      });
      await otpController.verifyOtp(req, res, next);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.verified, true);
      assert.ok(res.body.otpVerificationToken.startsWith("otp_tok_"));
      assert.strictEqual(saved, true);
      assert.strictEqual(mockDoc.consumed, true);
    });

    test("authController.register validates otpVerificationToken if provided", async () => {
      Otp.findOne = async (query) => {
        if (query.verificationToken === "valid_tok_123") {
          return { email: testEmail, verificationToken: "valid_tok_123", consumed: true };
        }
        return null;
      };

      const { req, res, next, getNextError } = createMockHttp({
        body: {
          username: "testuser",
          email: testEmail,
          password: "Password123!",
          otpVerificationToken: "bad_token",
        },
      });
      await authController.register(req, res, next);

      const err = getNextError();
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "INVALID_OTP_TOKEN");
    });
  });
});
