/**
 * ConnectX Call Controller (Module 11: Real-Time Voice & Video Calling)
 * 
 * Provides HTTP endpoints for call history, call session inspection,
 * ICE server configuration dispatch, and authoritative call status updates.
 */
const Call = require("../models/callModel");
const User = require("../models/userModel");
const Conversation = require("../models/conversationModel");
const AppError = require("../utils/appError");

/**
 * GET /api/v1/calls/ice-servers
 * Delivers secure STUN and optional TURN server configuration to authenticated clients
 */
async function getIceServers(req, res, next) {
  try {
    const iceServers = [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
        ],
      },
    ];

    // Optional TURN configuration from environment (never hardcoded in code)
    if (process.env.TURN_URL) {
      const turnConfig = {
        urls: process.env.TURN_URL.split(",").map((u) => u.trim()),
      };
      if (process.env.TURN_USERNAME) {
        turnConfig.username = process.env.TURN_USERNAME;
      }
      if (process.env.TURN_CREDENTIAL) {
        turnConfig.credential = process.env.TURN_CREDENTIAL;
      }
      iceServers.push(turnConfig);
    }

    return res.status(200).json({
      success: true,
      data: {
        iceServers,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/calls
 * Retrieves paginated call history for the authenticated caller
 */
async function getCallHistory(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { type, status, conversationId } = req.query;

    const filter = {
      $or: [{ caller: userId }, { receiver: userId }],
    };

    if (type && ["VOICE", "VIDEO"].includes(type.toUpperCase())) {
      filter.callType = type.toUpperCase();
    }

    if (status) {
      filter.status = status.toUpperCase();
    }

    if (conversationId) {
      filter.conversationId = conversationId;
    }

    const [total, calls] = await Promise.all([
      Call.countDocuments(filter),
      Call.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("caller", "_id username displayName avatarImage isOnline")
        .populate("receiver", "_id username displayName avatarImage isOnline")
        .lean(),
    ]);

    const formattedCalls = calls.map((c) => {
      const isCaller = String(c.caller?._id || c.caller) === String(userId);
      const otherParty = isCaller ? c.receiver : c.caller;
      const direction = isCaller ? "OUTGOING" : "INCOMING";
      const isMissed = c.status === "MISSED";

      return {
        _id: c._id,
        callType: c.callType,
        status: c.status,
        direction,
        isMissed,
        caller: c.caller,
        receiver: c.receiver,
        otherParty,
        conversationId: c.conversationId,
        startedAt: c.startedAt,
        answeredAt: c.answeredAt,
        connectedAt: c.connectedAt,
        endedAt: c.endedAt,
        duration: c.duration || 0,
        terminationReason: c.terminationReason,
        createdAt: c.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedCalls,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: skip + calls.length < total,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/calls/:callId
 * Retrieves detailed session data for a specific call (authorized participants only)
 */
async function getCallById(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { callId } = req.params;
    const call = await Call.findById(callId)
      .populate("caller", "_id username displayName avatarImage isOnline")
      .populate("receiver", "_id username displayName avatarImage isOnline");

    if (!call) {
      return next(new AppError("Call session not found", 404, "CALL_NOT_FOUND"));
    }

    const isParticipant =
      String(call.caller?._id || call.caller) === String(userId) ||
      String(call.receiver?._id || call.receiver) === String(userId);

    if (!isParticipant) {
      return next(
        new AppError("You are not an authorized participant in this call", 403, "CALL_ACCESS_DENIED")
      );
    }

    const isCaller = String(call.caller?._id || call.caller) === String(userId);
    const otherParty = isCaller ? call.receiver : call.caller;

    return res.status(200).json({
      success: true,
      data: {
        ...call.toObject(),
        direction: isCaller ? "OUTGOING" : "INCOMING",
        otherParty,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/calls/initiate
 * Optional HTTP initiation endpoint validating participants and creating an initial call session
 */
async function initiateCall(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return next(new AppError("Authentication required", 401, "TOKEN_MISSING"));
    }

    const { receiverId, callType = "VOICE", conversationId } = req.body || {};

    if (!receiverId) {
      return next(new AppError("Receiver ID is required to initiate a call", 400, "VALIDATION_ERROR"));
    }

    if (String(userId) === String(receiverId)) {
      return next(new AppError("Cannot initiate a call to yourself", 400, "SELF_CALL_PROHIBITED"));
    }

    const cleanType = String(callType).toUpperCase();
    if (!["VOICE", "VIDEO"].includes(cleanType)) {
      return next(new AppError("Invalid callType. Allowed: VOICE, VIDEO", 400, "VALIDATION_ERROR"));
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return next(new AppError("Target user not found", 404, "USER_NOT_FOUND"));
    }

    // Check if receiver is already engaged in an active call
    const activeCall = await Call.findOne({
      $or: [
        { caller: receiverId, status: { $in: ["RINGING", "ACCEPTED", "CONNECTING", "CONNECTED"] } },
        { receiver: receiverId, status: { $in: ["RINGING", "ACCEPTED", "CONNECTING", "CONNECTED"] } },
      ],
    });

    if (activeCall) {
      const busyCall = await Call.create({
        caller: userId,
        receiver: receiverId,
        conversationId: conversationId || null,
        callType: cleanType,
        status: "BUSY",
        startedAt: new Date(),
        endedAt: new Date(),
        duration: 0,
        terminationReason: "RECEIVER_BUSY",
      });

      return res.status(409).json({
        success: false,
        code: "USER_BUSY",
        message: "The requested user is currently in another call",
        data: { callId: busyCall._id },
      });
    }

    // Create session
    const callSession = await Call.create({
      caller: userId,
      receiver: receiverId,
      conversationId: conversationId || null,
      callType: cleanType,
      status: "RINGING",
      startedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Call session initiated successfully",
      data: callSession,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getIceServers,
  getCallHistory,
  getCallById,
  initiateCall,
};
