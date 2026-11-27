/**
 * ConnectX Call Signaling Gateway (Module 11: Real-Time Voice & Video Calling)
 * 
 * Manages WebRTC signaling, peer-to-peer negotiation, call lifecycle state machine,
 * automated timeouts, and authoritative call session termination.
 */
const Call = require("../models/callModel");
const User = require("../models/userModel");
const { dispatchNotification } = require("../models/notificationService");

// In-memory active call registry for fast O(1) busy status lookups
// Key: userId (String) -> Value: callId (String)
const activeUserCalls = new Map();

// In-memory timeouts for unanswered calls
// Key: callId (String) -> Value: NodeJS.Timeout
const ringingTimeouts = new Map();

const RINGING_TIMEOUT_MS = 35000; // 35 seconds no-answer timeout

/**
 * Registers all call signaling socket handlers for an authenticated socket
 */
function registerCallSignaling(io, socket, options = {}) {
  const CallModel = options.callModel || Call;
  const UserModel = options.userModel || User;
  const activeCallsMap = options.activeCallsMap || activeUserCalls;
  const timeoutsMap = options.timeoutsMap || ringingTimeouts;

  const getActiveUserId = () => {
    return String((socket.user && socket.user.userId) || socket.handshake?.auth?.userId || socket.handshake?.query?.userId || "");
  };

  /**
   * Helper to safely emit to all sockets belonging to a user
   */
  const emitToUser = (targetUserId, eventName, payload) => {
    const targetStr = String(targetUserId);
    io.to(`user:${targetStr}`).emit(eventName, payload);

    // Also target direct socket IDs from global.userSockets if available
    if (global.userSockets && global.userSockets.has(targetStr)) {
      const socketSet = global.userSockets.get(targetStr);
      for (const sId of socketSet) {
        io.to(sId).emit(eventName, payload);
      }
    }
  };

  /**
   * 1. INITIATE CALL (caller -> server -> receiver)
   */
  socket.on("call:initiate", async (data, callback) => {
    try {
      const { receiverId, callType = "VOICE", conversationId, offer } = data || {};
      const callerId = getActiveUserId();

      if (!callerId) {
        if (typeof callback === "function") {
          return callback({ success: false, error: "Authentication required" });
        }
        return socket.emit("call:error", { message: "Authentication required" });
      }

      if (!receiverId || String(receiverId) === String(callerId)) {
        if (typeof callback === "function") {
          return callback({ success: false, error: "Invalid receiver ID" });
        }
        return socket.emit("call:error", { message: "Invalid call destination" });
      }

      // Check if caller is already in an active call
      if (activeCallsMap.has(callerId)) {
        if (typeof callback === "function") {
          return callback({ success: false, error: "You are already in an active call" });
        }
        return socket.emit("call:busy", { reason: "CALLER_BUSY" });
      }

      // Check if receiver is busy in another call
      if (activeCallsMap.has(String(receiverId))) {
        const busyCall = await CallModel.create({
          caller: callerId,
          receiver: receiverId,
          conversationId: conversationId || null,
          callType: callType.toUpperCase(),
          status: "BUSY",
          startedAt: new Date(),
          endedAt: new Date(),
          duration: 0,
          terminationReason: "RECEIVER_BUSY",
        });

        if (typeof callback === "function") {
          callback({ success: false, error: "User is currently in another call", callId: busyCall._id });
        }
        return socket.emit("call:busy", { callId: busyCall._id, reason: "RECEIVER_BUSY" });
      }

      // Fetch caller and receiver details
      const [callerUser, receiverUser] = await Promise.all([
        UserModel.findById(callerId).select("_id username displayName avatarImage"),
        UserModel.findById(receiverId).select("_id username displayName avatarImage"),
      ]);

      if (!receiverUser) {
        if (typeof callback === "function") {
          return callback({ success: false, error: "Receiver not found" });
        }
        return socket.emit("call:error", { message: "Receiver not found" });
      }

      // Persist call session in DB
      const newCall = await CallModel.create({
        caller: callerId,
        receiver: receiverId,
        conversationId: conversationId || null,
        callType: callType.toUpperCase(),
        status: "RINGING",
        startedAt: new Date(),
      });

      const callIdStr = String(newCall._id);
      activeCallsMap.set(callerId, callIdStr);
      activeCallsMap.set(String(receiverId), callIdStr);

      const callPayload = {
        callId: callIdStr,
        caller: {
          _id: callerUser._id,
          username: callerUser.username,
          displayName: callerUser.displayName || callerUser.username,
          avatarImage: callerUser.avatarImage,
        },
        receiver: {
          _id: receiverUser._id,
          username: receiverUser.username,
          displayName: receiverUser.displayName || receiverUser.username,
          avatarImage: receiverUser.avatarImage,
        },
        callType: newCall.callType,
        conversationId,
        offer: offer || null,
        startedAt: newCall.startedAt,
      };

      // Broadcast incoming call to receiver's devices
      emitToUser(receiverId, "call:incoming", callPayload);

      // Acknowledge caller
      if (typeof callback === "function") {
        callback({ success: true, data: callPayload });
      }
      socket.emit("call:ringing", { callId: callIdStr, status: "RINGING" });

      // Setup automated ringing timeout (35s)
      const timeoutHandle = setTimeout(async () => {
        try {
          timeoutsMap.delete(callIdStr);
          const currentCall = await CallModel.findById(callIdStr);
          if (currentCall && currentCall.status === "RINGING") {
            currentCall.status = "MISSED";
            currentCall.terminationReason = "NO_ANSWER_TIMEOUT";
            currentCall.endedAt = new Date();
            await currentCall.save();

            activeCallsMap.delete(callerId);
            activeCallsMap.delete(String(receiverId));

            emitToUser(callerId, "call:missed", { callId: callIdStr, reason: "NO_ANSWER" });
            emitToUser(receiverId, "call:missed", { callId: callIdStr, reason: "MISSED" });

            // Create persistent missed call notification for receiver
            await dispatchNotification({
              recipientId: receiverId,
              senderId: callerId,
              type: "MISSED_CALL",
              title: `Missed ${newCall.callType.toLowerCase()} call`,
              body: `${callerUser.displayName || callerUser.username} called you`,
              conversationId: conversationId || null,
              callId: newCall._id,
              dedupKey: `call:missed:${callIdStr}`,
              io,
            });
          }
        } catch (_) {}
      }, RINGING_TIMEOUT_MS);

      timeoutsMap.set(callIdStr, timeoutHandle);
    } catch (err) {
      console.error("[call:initiate error]", err);
      if (typeof callback === "function") {
        callback({ success: false, error: err.message });
      }
    }
  });

  /**
   * 2. ACCEPT CALL (receiver -> server -> caller)
   */
  socket.on("call:accept", async (data, callback) => {
    try {
      const { callId, answer } = data || {};
      if (!callId) return;

      const call = await CallModel.findById(callId);
      if (!call) {
        return socket.emit("call:error", { message: "Call not found" });
      }

      if (String(call.receiver) !== authenticatedUserId) {
        return socket.emit("call:error", { message: "Unauthorized to accept this call" });
      }

      if (call.status !== "RINGING") {
        return socket.emit("call:error", { message: `Call is already in state ${call.status}` });
      }

      // Clear ringing timeout
      const callIdStr = String(call._id);
      if (timeoutsMap.has(callIdStr)) {
        clearTimeout(timeoutsMap.get(callIdStr));
        timeoutsMap.delete(callIdStr);
      }

      const now = new Date();
      call.status = "ACCEPTED";
      call.answeredAt = now;
      await call.save();

      // Relay acceptance to caller
      emitToUser(String(call.caller), "call:accepted", {
        callId: callIdStr,
        receiverId: authenticatedUserId,
        answer: answer || null,
      });

      if (typeof callback === "function") {
        callback({ success: true, callId: callIdStr });
      }
    } catch (err) {
      console.error("[call:accept error]", err);
    }
  });

  /**
   * 3. REJECT CALL (receiver -> server -> caller)
   */
  socket.on("call:reject", async (data) => {
    try {
      const { callId, reason = "DECLINED" } = data || {};
      if (!callId) return;

      const call = await CallModel.findById(callId);
      if (!call) return;

      if (String(call.receiver) !== authenticatedUserId) return;

      const callIdStr = String(call._id);
      if (timeoutsMap.has(callIdStr)) {
        clearTimeout(timeoutsMap.get(callIdStr));
        timeoutsMap.delete(callIdStr);
      }

      call.status = "REJECTED";
      call.terminationReason = "RECEIVER_REJECTED";
      call.endedAt = new Date();
      await call.save();

      activeCallsMap.delete(String(call.caller));
      activeCallsMap.delete(String(call.receiver));

      emitToUser(String(call.caller), "call:rejected", {
        callId: callIdStr,
        reason,
      });
    } catch (err) {
      console.error("[call:reject error]", err);
    }
  });

  /**
   * 4. CANCEL OUTGOING CALL (caller -> server -> receiver)
   */
  socket.on("call:cancel", async (data) => {
    try {
      const { callId } = data || {};
      if (!callId) return;

      const call = await CallModel.findById(callId);
      if (!call) return;

      if (String(call.caller) !== authenticatedUserId) return;

      const callIdStr = String(call._id);
      if (timeoutsMap.has(callIdStr)) {
        clearTimeout(timeoutsMap.get(callIdStr));
        timeoutsMap.delete(callIdStr);
      }

      call.status = "CANCELLED";
      call.terminationReason = "CALLER_CANCELLED";
      call.endedAt = new Date();
      await call.save();

      activeCallsMap.delete(String(call.caller));
      activeCallsMap.delete(String(call.receiver));

      emitToUser(String(call.receiver), "call:cancelled", {
        callId: callIdStr,
      });
    } catch (err) {
      console.error("[call:cancel error]", err);
    }
  });

  /**
   * 5. SIGNALING: OFFER & ANSWER EXCHANGE
   */
  socket.on("call:offer", async (data) => {
    try {
      const { callId, targetUserId, offer } = data || {};
      if (!callId || !targetUserId || !offer) return;

      emitToUser(targetUserId, "call:offer", {
        callId,
        senderId: authenticatedUserId,
        offer,
      });
    } catch (err) {
      console.error("[call:offer error]", err);
    }
  });

  socket.on("call:answer", async (data) => {
    try {
      const { callId, targetUserId, answer } = data || {};
      if (!callId || !targetUserId || !answer) return;

      emitToUser(targetUserId, "call:answer", {
        callId,
        senderId: authenticatedUserId,
        answer,
      });
    } catch (err) {
      console.error("[call:answer error]", err);
    }
  });

  /**
   * 6. SIGNALING: ICE CANDIDATE EXCHANGE
   */
  socket.on("call:ice_candidate", async (data) => {
    try {
      const { callId, targetUserId, candidate } = data || {};
      if (!callId || !targetUserId || !candidate) return;

      emitToUser(targetUserId, "call:ice_candidate", {
        callId,
        senderId: authenticatedUserId,
        candidate,
      });
    } catch (err) {
      console.error("[call:ice_candidate error]", err);
    }
  });

  /**
   * 7. CALL CONNECTED (peer connection established)
   */
  socket.on("call:connected", async (data) => {
    try {
      const { callId } = data || {};
      if (!callId) return;

      const call = await CallModel.findById(callId);
      if (call && ["RINGING", "ACCEPTED", "CONNECTING"].includes(call.status)) {
        call.status = "CONNECTED";
        call.connectedAt = call.connectedAt || new Date();
        await call.save();
      }
    } catch (err) {
      console.error("[call:connected error]", err);
    }
  });

  /**
   * 8. END CALL (either party terminates active call)
   */
  socket.on("call:end", async (data) => {
    try {
      const { callId, reason = "NORMAL" } = data || {};
      if (!callId) return;

      const call = await CallModel.findById(callId);
      if (!call) return;

      const isParticipant =
        String(call.caller) === authenticatedUserId ||
        String(call.receiver) === authenticatedUserId;

      if (!isParticipant) return;

      const callIdStr = String(call._id);
      if (timeoutsMap.has(callIdStr)) {
        clearTimeout(timeoutsMap.get(callIdStr));
        timeoutsMap.delete(callIdStr);
      }

      const now = new Date();
      const startRef = call.connectedAt || call.answeredAt || call.startedAt;
      const durationSec = Math.max(0, Math.round((now.getTime() - startRef.getTime()) / 1000));

      call.status = "ENDED";
      call.endedAt = now;
      call.duration = durationSec;
      call.terminationReason = reason;
      await call.save();

      activeCallsMap.delete(String(call.caller));
      activeCallsMap.delete(String(call.receiver));

      const otherUserId =
        String(call.caller) === authenticatedUserId
          ? String(call.receiver)
          : String(call.caller);

      emitToUser(otherUserId, "call:ended", {
        callId: callIdStr,
        duration: durationSec,
        reason,
      });
    } catch (err) {
      console.error("[call:end error]", err);
    }
  });

  /**
   * 9. MEDIA STATE SYNC (mute mic, disable video)
   */
  socket.on("call:media_state", (data) => {
    try {
      const { callId, targetUserId, isMuted, isCameraOff } = data || {};
      if (!targetUserId) return;

      emitToUser(targetUserId, "call:media_state", {
        callId,
        senderId: authenticatedUserId,
        isMuted,
        isCameraOff,
      });
    } catch (err) {
      console.error("[call:media_state error]", err);
    }
  });

  /**
   * 10. DISCONNECT CLEANUP
   */
  socket.on("disconnect", async () => {
    try {
      if (activeCallsMap.has(authenticatedUserId)) {
        const activeCallId = activeCallsMap.get(authenticatedUserId);
        activeCallsMap.delete(authenticatedUserId);

        const call = await CallModel.findById(activeCallId);
        if (call && ["RINGING", "ACCEPTED", "CONNECTING", "CONNECTED"].includes(call.status)) {
          const now = new Date();
          const startRef = call.connectedAt || call.answeredAt || call.startedAt;
          const durationSec = Math.max(0, Math.round((now.getTime() - startRef.getTime()) / 1000));

          call.status = "ENDED";
          call.endedAt = now;
          call.duration = durationSec;
          call.terminationReason = "NETWORK_DISCONNECTED";
          await call.save();

          const otherUserId =
            String(call.caller) === authenticatedUserId
              ? String(call.receiver)
              : String(call.caller);

          activeCallsMap.delete(otherUserId);

          emitToUser(otherUserId, "call:ended", {
            callId: String(call._id),
            duration: durationSec,
            reason: "NETWORK_DISCONNECTED",
          });
        }
      }
    } catch (_) {}
  });
}

module.exports = {
  registerCallSignaling,
  activeUserCalls,
  ringingTimeouts,
};
