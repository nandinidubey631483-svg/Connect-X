/**
 * ConnectX Frontend Validators Test Suite
 */
import {
  validateUsername,
  validateEmail,
  validatePassword,
  calculatePasswordStrength,
  validateFileUpload,
} from "../validators";

describe("ConnectX Frontend Validation Utilities", () => {
  describe("validateUsername", () => {
    test("validates compliant username", () => {
      const res = validateUsername("john_doe");
      expect(res.isValid).toBe(true);
      expect(res.error).toBeNull();
    });

    test("flags short username", () => {
      const res = validateUsername("ab");
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/at least 3 characters/);
    });

    test("flags long username", () => {
      const res = validateUsername("a".repeat(31));
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/cannot exceed 30 characters/);
    });

    test("flags invalid characters", () => {
      const res = validateUsername("john doe!");
      expect(res.isValid).toBe(false);
    });

    test("flags reserved usernames", () => {
      const res = validateUsername("Admin");
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/reserved/);
    });
  });

  describe("validateEmail", () => {
    test("validates valid email", () => {
      const res = validateEmail("user@example.com");
      expect(res.isValid).toBe(true);
      expect(res.error).toBeNull();
    });

    test("flags malformed email", () => {
      const res = validateEmail("not-an-email");
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/valid email/);
    });
  });

  describe("validatePassword", () => {
    test("validates password with length >= 8 and mixed chars", () => {
      const res = validatePassword("Password123");
      expect(res.isValid).toBe(true);
      expect(res.error).toBeNull();
    });

    test("flags password under 8 chars", () => {
      const res = validatePassword("pass1");
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/at least 8 characters/);
    });

    test("flags password without letters or numbers", () => {
      const res = validatePassword("123456789");
      expect(res.isValid).toBe(false);
    });
  });

  describe("calculatePasswordStrength", () => {
    test("scores empty password as 0", () => {
      const res = calculatePasswordStrength("");
      expect(res.score).toBe(0);
      expect(res.label).toBe("None");
    });

    test("scores weak password as 1", () => {
      const res = calculatePasswordStrength("12345678");
      expect(res.score).toBeLessThanOrEqual(2);
      expect(res.checks.length).toBe(true);
    });

    test("scores strong password with uppercase, numbers, symbols", () => {
      const res = calculatePasswordStrength("C0nnectX#2026!Secure");
      expect(res.score).toBe(4);
      expect(res.label).toBe("Strong");
      expect(res.checks.special).toBe(true);
      expect(res.checks.mixed).toBe(true);
    });
  });

  describe("validateFileUpload", () => {
    test("accepts valid image file under 5MB", () => {
      const validFile = new File(["dummy content"], "photo.png", { type: "image/png" });
      const res = validateFileUpload(validFile);
      expect(res.isValid).toBe(true);
    });

    test("rejects dangerous extension .exe", () => {
      const dangerousFile = new File(["malware"], "virus.exe", { type: "application/x-msdownload" });
      const res = validateFileUpload(dangerousFile);
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/blocked for security reasons/);
    });

    test("rejects oversized file (> 5MB)", () => {
      const bigFile = { name: "big.png", size: 6 * 1024 * 1024, type: "image/png" };
      const res = validateFileUpload(bigFile, { maxSizeBytes: 5 * 1024 * 1024 });
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/exceeds 5MB limit/);
    });
  });
});
