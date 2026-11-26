/**
 * ConnectX Call Context & State Machine (Module 11)
 * 
 * Manages call lifecycle transitions:
 * IDLE -> OUTGOING_CALL -> RINGING -> ACCEPTED -> CONNECTING -> CONNECTED -> ENDED
 * Handlers for: INCOMING_CALL, REJECTED, CANCELLED, MISSED, BUSY, FAILED
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import webrtcService from "../services/webrtcService";

export const CallContext = createContext(null);

export const CALL_STATES = {
  IDLE: "IDLE",
  OUTGOING_CALL: "OUTGOING_CALL",
  INCOMING_CALL: "INCOMING_CALL",
  RINGING: "RINGING",
  ACCEPTED: "ACCEPTED",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  RECONNECTING: "RECONNECTING",
  ENDED: "ENDED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  MISSED: "MISSED",
  BUSY: "BUSY",
  FAILED: "FAILED",
};

export function CallProvider({ children, currentSocket }) {
  const [callState, setCallState] = useState(CALL_STATES.IDLE);
  const [activeCall, setActiveCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activeCallRef = useRef(null);
  activeCallRef.current = activeCall;

  const callStateRef = useRef(callState);
  callStateRef.current = callState;

  const timerRef = useRef(null);

  // Call duration counter when connected
  useEffect(() => {
    if (callState === CALL_STATES.CONNECTED) {
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [callState]);

  // Clean tear down helper
  const resetCallState = useCallback((delayMs = 0) => {
    webrtcService.cleanup();
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraOff(false);

    if (delayMs > 0) {
      setTimeout(() => {
        setCallState(CALL_STATES.IDLE);
        setActiveCall(null);
        setStatusMessage("");
        setErrorMessage("");
        setCallDuration(0);
      }, delayMs);
    } else {
      setCallState(CALL_STATES.IDLE);
      setActiveCall(null);
      setStatusMessage("");
      setErrorMessage("");
      setCallDuration(0);
    }
  }, []);

  /**
   * INITIATE CALL (Voice or Video)
   */
  const startCall = useCallback(
    async ({ targetUser, callType = "VOICE", conversationId, socket }) => {
      const activeSock = socket?.current || socket || currentSocket?.current || currentSocket;
      if (!activeSock) {
        setErrorMessage("Network socket not ready");
        setCallState(CALL_STATES.FAILED);
        resetCallState(2500);
        return;
      }

      if (!targetUser || !targetUser._id) {
        return;
      }

      try {
        setErrorMessage("");
        setStatusMessage(`Calling ${targetUser.displayName || targetUser.username}...`);
        setCallState(CALL_STATES.OUTGOING_CALL);

        setActiveCall({
          callType: callType.toUpperCase(),
          otherUser: targetUser,
          conversationId,
          direction: "OUTGOING",
        });

        // 1. Acquire local media
        const stream = await webrtcService.getLocalMedia({ callType });
        setLocalStream(stream);

        // 2. Initialize PeerConnection
        webrtcService.createPeerConnection({
          onRemoteStream: (rStream) => {
            setRemoteStream(rStream);
          },
          onConnectionStateChange: (state) => {
            if (state === "connected") {
              setCallState(CALL_STATES.CONNECTED);
              setStatusMessage("Connected");
              activeSock.emit("call:connected", { callId: activeCallRef.current?.callId });
            } else if (state === "connecting") {
              setCallState(CALL_STATES.CONNECTING);
              setStatusMessage("Connecting media...");
            } else if (state === "disconnected" || state === "reconnecting") {
              setCallState(CALL_STATES.RECONNECTING);
              setStatusMessage("Reconnecting...");
            } else if (state === "failed") {
              setCallState(CALL_STATES.FAILED);
              setStatusMessage("Connection failed");
              resetCallState(2500);
            }
          },
          onIceCandidate: (candidate) => {
            if (activeCallRef.current?.callId) {
              activeSock.emit("call:ice_candidate", {
                callId: activeCallRef.current.callId,
                targetUserId: targetUser._id,
                candidate,
              });
            }
          },
        });

        // 3. Create WebRTC Offer
        const offer = await webrtcService.createOffer();

        // 4. Emit call:initiate to server
        activeSock.emit(
          "call:initiate",
          {
            receiverId: targetUser._id,
            callType: callType.toUpperCase(),
            conversationId,
            offer,
          },
          (res) => {
            if (res && res.success && res.data) {
              setActiveCall((prev) => ({
                ...prev,
                callId: res.data.callId,
              }));
              setCallState(CALL_STATES.RINGING);
              setStatusMessage("Ringing...");
            } else if (res && !res.success) {
              setErrorMessage(res.error || "User is unavailable");
              setCallState(CALL_STATES.FAILED);
              resetCallState(2500);
            }
          }
        );
      } catch (err) {
        console.error("Failed to start call:", err);
        setErrorMessage(err.message || "Failed to access audio/video hardware");
        setCallState(CALL_STATES.FAILED);
        resetCallState(3000);
      }
    },
    [currentSocket, resetCallState]
  );

  const startVoiceCall = useCallback(
    (targetUser, conversationId, socket) => {
      startCall({ targetUser, callType: "VOICE", conversationId, socket });
    },
    [startCall]
  );

  const startVideoCall = useCallback(
    (targetUser, conversationId, socket) => {
      startCall({ targetUser, callType: "VIDEO", conversationId, socket });
    },
    [startCall]
  );

  /**
   * ACCEPT INCOMING CALL
   */
  const acceptCall = useCallback(
    async (socket) => {
      const activeSock = socket?.current || socket || currentSocket?.current || currentSocket;
      if (!activeCallRef.current || !activeSock) return;

      const { callId, callType, caller, otherUser, offer } = activeCallRef.current;
      const targetUser = otherUser || caller;

      try {
        setCallState(CALL_STATES.CONNECTING);
        setStatusMessage("Connecting...");

        // 1. Acquire local media
        const stream = await webrtcService.getLocalMedia({ callType: callType || "VOICE" });
        setLocalStream(stream);

        // 2. Create peer connection
        webrtcService.createPeerConnection({
          onRemoteStream: (rStream) => {
            setRemoteStream(rStream);
          },
          onConnectionStateChange: (state) => {
            if (state === "connected") {
              setCallState(CALL_STATES.CONNECTED);
              setStatusMessage("Connected");
              activeSock.emit("call:connected", { callId });
            } else if (state === "connecting") {
              setCallState(CALL_STATES.CONNECTING);
              setStatusMessage("Connecting media...");
            } else if (state === "disconnected") {
              setCallState(CALL_STATES.RECONNECTING);
              setStatusMessage("Reconnecting...");
            } else if (state === "failed") {
              setCallState(CALL_STATES.FAILED);
              setStatusMessage("Connection failed");
              resetCallState(2500);
            }
          },
          onIceCandidate: (candidate) => {
            activeSock.emit("call:ice_candidate", {
              callId,
              targetUserId: targetUser._id,
              candidate,
            });
          },
        });

        // 3. Handle offer and generate answer
        let answer = null;
        if (offer) {
          answer = await webrtcService.handleOfferAndCreateAnswer(offer);
        }

        // 4. Emit call:accept to server
        activeSock.emit("call:accept", { callId, answer });
      } catch (err) {
        console.error("Failed to accept call:", err);
        setErrorMessage(err.message || "Failed to access camera/microphone");
        setCallState(CALL_STATES.FAILED);
        resetCallState(3000);
      }
    },
    [currentSocket, resetCallState]
  );

  /**
   * REJECT INCOMING CALL
   */
  const rejectCall = useCallback(
    (socket) => {
      const activeSock = socket?.current || socket || currentSocket?.current || currentSocket;
      if (activeCallRef.current?.callId && activeSock) {
        activeSock.emit("call:reject", { callId: activeCallRef.current.callId });
      }
      setCallState(CALL_STATES.REJECTED);
      setStatusMessage("Call declined");
      resetCallState(1500);
    },
    [currentSocket, resetCallState]
  );

  /**
   * CANCEL OUTGOING CALL
   */
  const cancelCall = useCallback(
    (socket) => {
      const activeSock = socket?.current || socket || currentSocket?.current || currentSocket;
      if (activeCallRef.current?.callId && activeSock) {
        activeSock.emit("call:cancel", { callId: activeCallRef.current.callId });
      }
      setCallState(CALL_STATES.CANCELLED);
      setStatusMessage("Call cancelled");
      resetCallState(1500);
    },
    [currentSocket, resetCallState]
  );

  /**
   * END ACTIVE CALL
   */
  const endCall = useCallback(
    (socket, reason = "NORMAL") => {
      const activeSock = socket?.current || socket || currentSocket?.current || currentSocket;
      if (activeCallRef.current?.callId && activeSock) {
        activeSock.emit("call:end", { callId: activeCallRef.current.callId, reason });
      }
      setCallState(CALL_STATES.ENDED);
      setStatusMessage("Call ended");
      resetCallState(1500);
    },
    [currentSocket, resetCallState]
  );

  /**
   * MEDIA CONTROLS
   */
  const toggleMicrophone = useCallback(() => {
    const muted = webrtcService.toggleMicrophone();
    setIsMuted(muted);
    const activeSock = currentSocket?.current || currentSocket;
    if (activeSock && activeCallRef.current) {
      activeSock.emit("call:media_state", {
        callId: activeCallRef.current.callId,
        targetUserId: activeCallRef.current.otherUser?._id,
        isMuted: muted,
        isCameraOff,
      });
    }
  }, [currentSocket, isCameraOff]);

  const toggleCamera = useCallback(() => {
    const camOff = webrtcService.toggleCamera();
    setIsCameraOff(camOff);
    const activeSock = currentSocket?.current || currentSocket;
    if (activeSock && activeCallRef.current) {
      activeSock.emit("call:media_state", {
        callId: activeCallRef.current.callId,
        targetUserId: activeCallRef.current.otherUser?._id,
        isMuted,
        isCameraOff: camOff,
      });
    }
  }, [currentSocket, isMuted]);

  const switchCamera = useCallback(async () => {
    return await webrtcService.switchCamera();
  }, []);

  /**
   * SOCKET EVENT SUBSCRIPTIONS
   */
  useEffect(() => {
    const activeSock = currentSocket?.current || currentSocket;
    if (!activeSock || typeof activeSock.on !== "function") return;

    // Incoming Call
    const handleIncomingCall = (payload) => {
      if (callStateRef.current !== CALL_STATES.IDLE) {
        activeSock.emit("call:busy", { callId: payload.callId, reason: "BUSY" });
        return;
      }
      setActiveCall({
        callId: payload.callId,
        callType: payload.callType,
        caller: payload.caller,
        otherUser: payload.caller,
        conversationId: payload.conversationId,
        offer: payload.offer,
        direction: "INCOMING",
      });
      setCallState(CALL_STATES.INCOMING_CALL);
      setStatusMessage(`Incoming ${payload.callType?.toLowerCase()} call...`);
    };

    // Caller: Receiver is ringing
    const handleRinging = () => {
      setCallState(CALL_STATES.RINGING);
      setStatusMessage("Ringing...");
    };

    // Caller: Receiver accepted
    const handleAccepted = async (payload) => {
      setCallState(CALL_STATES.CONNECTING);
      setStatusMessage("Connecting audio/video...");
      if (payload.answer) {
        await webrtcService.handleAnswer(payload.answer);
      }
    };

    // Caller: Receiver rejected
    const handleRejected = () => {
      setCallState(CALL_STATES.REJECTED);
      setStatusMessage("Call was declined");
      resetCallState(2000);
    };

    // Receiver: Caller cancelled
    const handleCancelled = () => {
      setCallState(CALL_STATES.CANCELLED);
      setStatusMessage("Call was cancelled");
      resetCallState(2000);
    };

    // Caller: Receiver is busy
    const handleBusy = () => {
      setCallState(CALL_STATES.BUSY);
      setStatusMessage("User is currently busy on another call");
      resetCallState(2500);
    };

    // Missed call timeout
    const handleMissed = () => {
      setCallState(CALL_STATES.MISSED);
      setStatusMessage("No answer (Call missed)");
      resetCallState(2500);
    };

    // Call Ended
    const handleEnded = (payload) => {
      setCallState(CALL_STATES.ENDED);
      setStatusMessage(`Call ended (${payload?.duration || 0}s)`);
      resetCallState(2000);
    };

    // WebRTC Offer/Answer/ICE
    const handleRemoteOffer = async (payload) => {
      if (payload.offer) {
        const answer = await webrtcService.handleOfferAndCreateAnswer(payload.offer);
        activeSock.emit("call:answer", {
          callId: payload.callId,
          targetUserId: payload.senderId,
          answer,
        });
      }
    };

    const handleRemoteAnswer = async (payload) => {
      if (payload.answer) {
        await webrtcService.handleAnswer(payload.answer);
      }
    };

    const handleRemoteIceCandidate = async (payload) => {
      if (payload.candidate) {
        await webrtcService.addIceCandidate(payload.candidate);
      }
    };

    // Remote media state updates
    const handleRemoteMediaState = (payload) => {
      // Could show toast or indicator "Remote user muted their microphone"
    };

    activeSock.on("call:incoming", handleIncomingCall);
    activeSock.on("call:ringing", handleRinging);
    activeSock.on("call:accepted", handleAccepted);
    activeSock.on("call:rejected", handleRejected);
    activeSock.on("call:cancelled", handleCancelled);
    activeSock.on("call:busy", handleBusy);
    activeSock.on("call:missed", handleMissed);
    activeSock.on("call:ended", handleEnded);
    activeSock.on("call:offer", handleRemoteOffer);
    activeSock.on("call:answer", handleRemoteAnswer);
    activeSock.on("call:ice_candidate", handleRemoteIceCandidate);
    activeSock.on("call:media_state", handleRemoteMediaState);

    return () => {
      if (typeof activeSock.off === "function") {
        activeSock.off("call:incoming", handleIncomingCall);
        activeSock.off("call:ringing", handleRinging);
        activeSock.off("call:accepted", handleAccepted);
        activeSock.off("call:rejected", handleRejected);
        activeSock.off("call:cancelled", handleCancelled);
        activeSock.off("call:busy", handleBusy);
        activeSock.off("call:missed", handleMissed);
        activeSock.off("call:ended", handleEnded);
        activeSock.off("call:offer", handleRemoteOffer);
        activeSock.off("call:answer", handleRemoteAnswer);
        activeSock.off("call:ice_candidate", handleRemoteIceCandidate);
        activeSock.off("call:media_state", handleRemoteMediaState);
      }
    };
  }, [currentSocket, resetCallState]);

  const value = {
    callState,
    CALL_STATES,
    activeCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    callDuration,
    statusMessage,
    errorMessage,
    startVoiceCall,
    startVideoCall,
    startCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    toggleMicrophone,
    toggleCamera,
    switchCamera,
    resetCallState,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    return {
      callState: CALL_STATES.IDLE,
      CALL_STATES,
      activeCall: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isCameraOff: false,
      callDuration: 0,
      statusMessage: "",
      errorMessage: "",
      startVoiceCall: () => {},
      startVideoCall: () => {},
      startCall: () => {},
      acceptCall: () => {},
      rejectCall: () => {},
      cancelCall: () => {},
      endCall: () => {},
      toggleMicrophone: () => {},
      toggleCamera: () => {},
      switchCamera: () => Promise.resolve(null),
      resetCallState: () => {},
    };
  }
  return context;
}
