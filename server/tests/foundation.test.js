/**
 * ConnectX Backend Foundation Unit Tests
 * Uses Node.js native test runner (zero external dependencies required)
 */
const { test, describe } = require("node:test");
const assert = require("node:assert");
const AppError = require("../utils/appError");
const { sendSuccess, sendError } = require("../utils/apiResponse");

describe("ConnectX Backend Foundation Tests", () => {
  test("AppError initializes operational error attributes correctly", () => {
    const error = new AppError("Invalid resource identifier", 400, "INVALID_ID");
    assert.strictEqual(error.message, "Invalid resource identifier");
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(error.code, "INVALID_ID");
    assert.strictEqual(error.isOperational, true);
    assert.strictEqual(error.status, "fail");
  });

  test("AppError correctly marks 500 status codes as error", () => {
    const error = new AppError("Internal crash", 500, "SERVER_ERROR");
    assert.strictEqual(error.status, "error");
    assert.strictEqual(error.statusCode, 500);
  });

  test("sendSuccess formats standard JSON envelope", () => {
    let capturedStatus = null;
    let capturedJson = null;

    const mockRes = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      },
    };

    sendSuccess(mockRes, { user: "alice" }, 200, "User fetched");

    assert.strictEqual(capturedStatus, 200);
    assert.strictEqual(capturedJson.success, true);
    assert.strictEqual(capturedJson.data.user, "alice");
    assert.strictEqual(capturedJson.message, "User fetched");
  });

  test("sendError formats standard error envelope without leaking details when omitted", () => {
    let capturedStatus = null;
    let capturedJson = null;

    const mockRes = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      },
    };

    sendError(mockRes, "Access denied", 403, "FORBIDDEN");

    assert.strictEqual(capturedStatus, 403);
    assert.strictEqual(capturedJson.success, false);
    assert.strictEqual(capturedJson.error.code, "FORBIDDEN");
    assert.strictEqual(capturedJson.error.message, "Access denied");
    assert.strictEqual(capturedJson.error.details, undefined);
  });
});
