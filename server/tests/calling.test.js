const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Call = require("../models/callModel");
const Notification = require("../models/notificationModel");
const User = require("../models/userModel");
const callController = require("../controllers/callController");

// Helper mock response
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.data = body;
      return this;
    },
  };
  return res;
}

test("Call Model - Schema validation and defaults", async (t) => {
  const callerId = new mongoose.Types.ObjectId();
  const receiverId = new mongoose.Types.ObjectId();

  const call = new Call({
    caller: callerId,
    receiver: receiverId,
    callType: "VOICE",
  });

  assert.equal(call.status, "RINGING");
  assert.equal(call.callType, "VOICE");
  assert.equal(call.duration, 0);
  assert.ok(call.startedAt instanceof Date);

  // Validation fails if callType is invalid
  const invalidCall = new Call({
    caller: callerId,
    receiver: receiverId,
    callType: "HOLOGRAPHIC",
  });
  let validationErr = null;
  try {
    await invalidCall.validate();
  } catch (err) {
    validationErr = err;
  }
  assert.ok(validationErr, "Should fail validation on invalid callType");
});

test("Call Controller - getIceServers returns valid STUN configurations", async (t) => {
  const req = {};
  const res = createMockRes();
  const next = (err) => {
    if (err) throw err;
  };

  await callController.getIceServers(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.data.success, true);
  assert.ok(Array.isArray(res.data.data.iceServers));
  assert.ok(res.data.data.iceServers.length > 0);
  assert.ok(res.data.data.iceServers.some((s) => s.urls.some((u) => u.includes("stun:"))));
});

test("Call Controller - initiateCall validation", async (t) => {
  const callerId = new mongoose.Types.ObjectId().toString();
  let capturedError = null;
  const next = (err) => {
    capturedError = err;
  };

  // 1. Missing receiverId
  const req1 = {
    user: { userId: callerId },
    body: { callType: "VOICE" },
  };
  const res1 = createMockRes();
  await callController.initiateCall(req1, res1, next);
  assert.ok(capturedError);
  assert.equal(capturedError.statusCode, 400);
  assert.equal(capturedError.code, "VALIDATION_ERROR");

  // 2. Self-calling is prohibited
  capturedError = null;
  const req2 = {
    user: { userId: callerId },
    body: { receiverId: callerId, callType: "VOICE" },
  };
  const res2 = createMockRes();
  await callController.initiateCall(req2, res2, next);
  assert.ok(capturedError);
  assert.equal(capturedError.statusCode, 400);
  assert.equal(capturedError.code, "SELF_CALL_PROHIBITED");
});

test("Notification Model - Supports INCOMING_CALL and MISSED_CALL types", async (t) => {
  const recipientId = new mongoose.Types.ObjectId();
  const senderId = new mongoose.Types.ObjectId();
  const callId = new mongoose.Types.ObjectId();

  const notif = new Notification({
    recipient: recipientId,
    sender: senderId,
    type: "MISSED_CALL",
    title: "Missed Call",
    body: "You missed a voice call",
    callId: callId,
  });

  assert.equal(notif.type, "MISSED_CALL");
  assert.equal(notif.callId.toString(), callId.toString());
});
