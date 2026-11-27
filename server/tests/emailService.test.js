const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const emailService = require("../services/emailService");
const AppError = require("../utils/appError");

describe("Email Delivery Service Tests", () => {
  beforeEach(() => {
    emailService.clearLastDispatchedEmail();
    emailService.setMockTransporter(null);
  });

  afterEach(() => {
    emailService.clearLastDispatchedEmail();
    emailService.setMockTransporter(null);
  });

  test("renderOtpEmailTemplate generates branded HTML and plain-text for SIGNUP", () => {
    const template = emailService.renderOtpEmailTemplate({
      code: "741852",
      purpose: "SIGNUP",
      email: "user@example.com",
    });

    assert.ok(template.subject.includes("741852"));
    assert.ok(template.html.includes("741852"));
    assert.ok(template.html.includes("ConnectX"));
    assert.ok(template.html.includes("user@example.com"));
    assert.ok(template.text.includes("741852"));
    assert.ok(template.text.includes("10 minutes"));
  });

  test("renderOtpEmailTemplate customizes subject and heading for LOGIN and PASSWORD_RESET", () => {
    const loginTpl = emailService.renderOtpEmailTemplate({
      code: "123456",
      purpose: "LOGIN",
      email: "user@example.com",
    });
    assert.ok(loginTpl.subject.toLowerCase().includes("sign-in"));

    const resetTpl = emailService.renderOtpEmailTemplate({
      code: "654321",
      purpose: "PASSWORD_RESET",
      email: "user@example.com",
    });
    assert.ok(resetTpl.subject.toLowerCase().includes("reset"));
  });

  test("sendOtpEmail validates required recipient and code", async () => {
    await assert.rejects(
      async () => {
        await emailService.sendOtpEmail({ to: "", code: "123456" });
      },
      (err) => err instanceof AppError && err.statusCode === 400
    );

    await assert.rejects(
      async () => {
        await emailService.sendOtpEmail({ to: "user@example.com", code: "" });
      },
      (err) => err instanceof AppError && err.statusCode === 400
    );
  });

  test("sendOtpEmail delivers successfully via mock transporter", async () => {
    let sentPayload = null;
    emailService.setMockTransporter({
      sendMail: async (payload) => {
        sentPayload = payload;
        return { messageId: "msg_test_12345", accepted: [payload.to] };
      },
    });

    const res = await emailService.sendOtpEmail({
      to: "test.delivery@example.com",
      code: "987654",
      purpose: "SIGNUP",
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.messageId, "msg_test_12345");
    assert.ok(sentPayload);
    assert.strictEqual(sentPayload.to, "test.delivery@example.com");
    assert.ok(sentPayload.html.includes("987654"));

    const last = emailService.getLastDispatchedEmail();
    assert.ok(last);
    assert.strictEqual(last.code, "987654");
  });

  test("sendOtpEmail handles delivery failures with 502 EMAIL_DELIVERY_FAILED", async () => {
    emailService.setMockTransporter({
      sendMail: async () => {
        const err = new Error("Connection timed out to SMTP host");
        err.code = "ETIMEDOUT";
        throw err;
      },
    });

    await assert.rejects(
      async () => {
        await emailService.sendOtpEmail({
          to: "test.failed@example.com",
          code: "112233",
          purpose: "SIGNUP",
        });
      },
      (err) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 502);
        assert.strictEqual(err.code, "EMAIL_DELIVERY_FAILED");
        return true;
      }
    );
  });
});
