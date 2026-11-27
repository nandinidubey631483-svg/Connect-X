/**
 * ConnectX Comprehensive Validation Engine Tests
 * 
 * Verifies:
 * - Username format, boundary lengths (3-30), symbol boundaries, and reserved names
 * - Email format, length, lowercase normalization
 * - Password length (8-128), character requirements, rejection of null bytes / pure whitespace
 * - Profile field limits (displayName, bio, phoneNumber, statusMessage)
 * - Message sanitization, null byte removal, length limits (5000 chars)
 * - MongoDB ObjectId validation
 */
const { describe, test } = require("node:test");
const assert = require("node:assert");

const {
  validateUsername,
  validateEmail,
  validatePassword,
  validateProfileFields,
  validateMessageContent,
  isValidObjectId,
  sanitizeString,
  RESERVED_USERNAMES,
} = require("../utils/validators");

describe("ConnectX Validation & Sanitization Engine Tests", () => {
  describe("1. Username Validation", () => {
    test("accepts valid alphanumeric usernames with hyphens and underscores", () => {
      const validCases = ["alice", "bob_123", "charlie-dev", "user_name_99", "dev-master-1"];
      for (const u of validCases) {
        const res = validateUsername(u);
        assert.strictEqual(res.isValid, true, `Expected ${u} to be valid`);
        assert.strictEqual(res.error, null);
        assert.strictEqual(res.sanitized, u);
      }
    });

    test("rejects usernames shorter than 3 characters", () => {
      const res = validateUsername("ab");
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("between 3 and 30 characters"));
    });

    test("rejects usernames longer than 30 characters", () => {
      const res = validateUsername("a".repeat(31));
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("between 3 and 30 characters"));
    });

    test("rejects usernames starting or ending with underscores or hyphens", () => {
      const invalidBoundaries = ["_alice", "-bob", "alice_", "bob-"];
      for (const u of invalidBoundaries) {
        const res = validateUsername(u);
        assert.strictEqual(res.isValid, false, `Expected ${u} to be rejected`);
      }
    });

    test("rejects usernames with spaces or special characters", () => {
      const invalidChars = ["alice smith", "bob@work", "charlie#1", "user!name", "<script>"];
      for (const u of invalidChars) {
        const res = validateUsername(u);
        assert.strictEqual(res.isValid, false, `Expected ${u} to be rejected`);
      }
    });

    test("rejects reserved usernames case-insensitively", () => {
      const reserved = ["admin", "ADMIN", "System", "ConnectX", "support", "root", "api"];
      for (const u of reserved) {
        const res = validateUsername(u);
        assert.strictEqual(res.isValid, false, `Expected reserved ${u} to be rejected`);
        assert.ok(res.error.includes("reserved"));
      }
    });
  });

  describe("2. Email Validation", () => {
    test("accepts valid email addresses and normalizes to lowercase", () => {
      const validEmails = [
        "user@example.com",
        "Alice.Smith@Domain.co.uk",
        "first+last@test.org",
        "dev_123@sub.domain.io",
      ];
      for (const email of validEmails) {
        const res = validateEmail(email);
        assert.strictEqual(res.isValid, true, `Expected ${email} to be valid`);
        assert.strictEqual(res.sanitized, email.trim().toLowerCase());
      }
    });

    test("rejects malformed email formats", () => {
      const invalidEmails = [
        "plainaddress",
        "@missingusername.com",
        "missingatsign.net",
        "two@@signs.org",
        "spaces in@mail.com",
        "missingdomain@.com",
        "missingtld@domain.",
      ];
      for (const email of invalidEmails) {
        const res = validateEmail(email);
        assert.strictEqual(res.isValid, false, `Expected ${email} to be rejected`);
        assert.ok(res.error.includes("valid email address"));
      }
    });

    test("rejects email exceeding 254 characters", () => {
      const longEmail = "a".repeat(250) + "@test.com";
      const res = validateEmail(longEmail);
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("cannot exceed 254 characters"));
    });
  });

  describe("3. Password Validation", () => {
    test("accepts strong passwords containing letters and digits/symbols", () => {
      const validPasswords = [
        "Password123!",
        "securePass88",
        "p@ssw0rdSecure",
        "my_Secret_Key_99",
      ];
      for (const p of validPasswords) {
        const res = validatePassword(p);
        assert.strictEqual(res.isValid, true, `Expected ${p} to be valid`);
        assert.strictEqual(res.error, null);
      }
    });

    test("rejects password shorter than 8 characters", () => {
      const res = validatePassword("pass1");
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("at least 8 characters"));
    });

    test("rejects password longer than 128 characters", () => {
      const res = validatePassword("A1!" + "x".repeat(130));
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("cannot exceed 128 characters"));
    });

    test("rejects passwords lacking digits or symbols (all letters)", () => {
      const res = validatePassword("allletterspassword");
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("at least one letter and at least one number"));
    });

    test("rejects passwords lacking letters (all digits)", () => {
      const res = validatePassword("1234567890");
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("at least one letter and at least one number"));
    });

    test("rejects passwords with null bytes", () => {
      const res = validatePassword("Password\x00123");
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("invalid characters"));
    });
  });

  describe("4. Profile Fields & Sanitization", () => {
    test("sanitizes control characters and strips null bytes", () => {
      const dirty = "Hello\0World\x08!\x1F";
      const clean = sanitizeString(dirty);
      assert.strictEqual(clean, "HelloWorld!");
    });

    test("validates profile fields and enforces length limits", () => {
      const validFields = {
        displayName: "  Alice Wonder  ",
        bio: "Full stack engineer passionate about realtime systems.",
        phoneNumber: "+1 555-123-4567",
        statusMessage: "Available for collaboration",
      };

      const res = validateProfileFields(validFields);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.cleaned.displayName, "Alice Wonder");
      assert.strictEqual(res.cleaned.phoneNumber, "+1 555-123-4567");
    });

    test("rejects invalid phone numbers", () => {
      const res = validateProfileFields({ phoneNumber: "not-a-number-abc" });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors[0].includes("phone number format"));
    });
  });

  describe("5. Message Content Validation", () => {
    test("accepts valid text messages and trims whitespace", () => {
      const res = validateMessageContent("  Hello team, how is the deployment?  ");
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.sanitized, "Hello team, how is the deployment?");
    });

    test("rejects empty or whitespace-only messages", () => {
      const res = validateMessageContent("   \n\t  ");
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("cannot be empty"));
    });

    test("rejects messages exceeding 5000 characters", () => {
      const longMessage = "m".repeat(5001);
      const res = validateMessageContent(longMessage, 5000);
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error.includes("exceeds maximum limit"));
    });
  });

  describe("6. MongoDB ObjectId Validation", () => {
    test("validates 24-character hexadecimal ObjectIds", () => {
      assert.strictEqual(isValidObjectId("65b9e1234567890abcdef123"), true);
      assert.strictEqual(isValidObjectId("507f1f77bcf86cd799439011"), true);
    });

    test("rejects malformed ObjectIds", () => {
      assert.strictEqual(isValidObjectId("invalid-id"), false);
      assert.strictEqual(isValidObjectId("123"), false);
      assert.strictEqual(isValidObjectId("65b9e1234567890abcdef12Z"), false); // 'Z' is not hex
      assert.strictEqual(isValidObjectId(null), false);
      assert.strictEqual(isValidObjectId(undefined), false);
    });
  });
});
