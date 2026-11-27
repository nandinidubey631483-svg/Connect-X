/**
 * ConnectX Real-Time Voice & Video Calling Modal (Module 11)
 * 
 * Renders:
 * - Incoming Call prompt (Accept / Reject)
 * - Outgoing Calling / Ringing screen (Cancel)
 * - Active Voice Call screen with duration timer and audio controls
 * - Active Video Call screen with remote stream and PiP local preview
 * - Status screens: Busy, Missed, Failed, Ended
 */
import React, { useEffect, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";
import { useCall } from "../../context/CallContext";
import Avatar from "../common/Avatar";
import {
  FiPhone,
  FiPhoneOff,
  FiVideo,
  FiVideoOff,
  FiMic,
  FiMicOff,
  FiRefreshCw,
  FiMaximize2,
  FiMinimize2,
  FiVolume2,
} from "react-icons/fi";

const pulse = keyframes`
  0% { transform: scale(0.98); box-shadow: 0 0 0 0 rgba(217, 139, 112, 0.5); }
  70% { transform: scale(1.04); box-shadow: 0 0 0 20px rgba(217, 139, 112, 0); }
  100% { transform: scale(0.98); box-shadow: 0 0 0 0 rgba(217, 139, 112, 0); }
`;

const ringPulse = keyframes`
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6); }
  70% { transform: scale(1.08); box-shadow: 0 0 0 24px rgba(34, 197, 94, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
`;

export default function CallModal({ socket }) {
  const {
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
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    toggleMicrophone,
    toggleCamera,
    switchCamera,
  } = useCall();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Bind local stream to local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  // Bind remote stream to remote video or audio element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callState]);

  if (callState === CALL_STATES.IDLE || !activeCall) {
    return null;
  }

  const otherUser = activeCall.otherUser || activeCall.caller || {};
  const isVideo = activeCall.callType === "VIDEO";
  const displayName = otherUser.displayName || otherUser.username || "ConnectX User";

  const formatDuration = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  return (
    <Overlay ref={containerRef} data-testid="call-modal-overlay">
      {/* Hidden audio element for remote audio stream during voice/video calls */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* 1. INCOMING CALL SCREEN */}
      {callState === CALL_STATES.INCOMING_CALL && (
        <Card data-testid="incoming-call-screen">
          <BadgePill>
            {isVideo ? <FiVideo size={13} /> : <FiPhone size={13} />} Incoming {activeCall.callType} Call
          </BadgePill>

          <AvatarWrapper className="ringing">
            <Avatar
              image={otherUser.avatarImage}
              name={displayName}
              size="xl"
              showStatus={false}
            />
          </AvatarWrapper>

          <UserName>{displayName}</UserName>
          <UserHandle>@{otherUser.username}</UserHandle>
          <StatusText>{statusMessage || "Incoming call..."}</StatusText>

          <ActionRow>
            <CircleButton
              variant="danger"
              title="Decline Call"
              data-testid="reject-call-btn"
              onClick={() => rejectCall(socket)}
            >
              <FiPhoneOff size={22} />
            </CircleButton>

            <CircleButton
              variant="success"
              title="Accept Call"
              data-testid="accept-call-btn"
              className="ringing"
              onClick={() => acceptCall(socket)}
            >
              {isVideo ? <FiVideo size={22} /> : <FiPhone size={22} />}
            </CircleButton>
          </ActionRow>
        </Card>
      )}

      {/* 2. OUTGOING CALL / RINGING SCREEN */}
      {(callState === CALL_STATES.OUTGOING_CALL || callState === CALL_STATES.RINGING) && (
        <Card data-testid="outgoing-call-screen">
          <BadgePill>
            {isVideo ? <FiVideo size={13} /> : <FiPhone size={13} />} Outgoing {activeCall.callType} Call
          </BadgePill>

          <AvatarWrapper className="pulsing">
            <Avatar
              image={otherUser.avatarImage}
              name={displayName}
              size="xl"
              showStatus={false}
            />
          </AvatarWrapper>

          <UserName>{displayName}</UserName>
          <UserHandle>@{otherUser.username}</UserHandle>
          <StatusText>{statusMessage || "Calling..."}</StatusText>

          <ActionRow>
            <CircleButton
              variant="danger"
              title="Cancel Call"
              data-testid="cancel-call-btn"
              onClick={() => cancelCall(socket)}
            >
              <FiPhoneOff size={22} />
            </CircleButton>
          </ActionRow>
        </Card>
      )}

      {/* 3. ACTIVE VOICE CALL SCREEN */}
      {!isVideo && (callState === CALL_STATES.CONNECTED || callState === CALL_STATES.CONNECTING || callState === CALL_STATES.RECONNECTING) && (
        <Card data-testid="active-voice-call-screen">
          <BadgePill>
            <FiPhone size={13} /> Voice Call
          </BadgePill>

          <AvatarWrapper>
            <Avatar
              image={otherUser.avatarImage}
              name={displayName}
              size="xl"
              showStatus={false}
            />
          </AvatarWrapper>

          <UserName>{displayName}</UserName>
          <UserHandle>@{otherUser.username}</UserHandle>

          <DurationBadge data-testid="call-duration-timer">
            {callState === CALL_STATES.CONNECTED ? formatDuration(callDuration) : statusMessage}
          </DurationBadge>

          <ControlsPill>
            <IconButton
              active={isMuted}
              onClick={toggleMicrophone}
              title={isMuted ? "Unmute microphone" : "Mute microphone"}
              data-testid="toggle-mic-btn"
            >
              {isMuted ? <FiMicOff size={18} /> : <FiMic size={18} />}
            </IconButton>

            <IconButton title="Speaker enabled">
              <FiVolume2 size={18} />
            </IconButton>

            <CircleButton
              variant="danger"
              title="End Call"
              data-testid="end-call-btn"
              onClick={() => endCall(socket, "NORMAL")}
            >
              <FiPhoneOff size={20} />
            </CircleButton>
          </ControlsPill>
        </Card>
      )}

      {/* 4. ACTIVE VIDEO CALL SCREEN */}
      {isVideo && (callState === CALL_STATES.CONNECTED || callState === CALL_STATES.CONNECTING || callState === CALL_STATES.RECONNECTING) && (
        <VideoContainer data-testid="active-video-call-screen">
          {/* Main Remote Video Stream */}
          <RemoteVideoWrapper>
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                data-testid="remote-video-stream"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <VideoPlaceholder>
                <Avatar image={otherUser.avatarImage} name={displayName} size="xl" />
                <p style={{ marginTop: "14px", color: "rgba(255,255,255,0.8)", fontSize: "14px" }}>
                  {statusMessage || "Connecting video stream..."}
                </p>
              </VideoPlaceholder>
            )}

            {/* Top Bar with Participant Info & Duration */}
            <VideoTopBar>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Avatar image={otherUser.avatarImage} name={displayName} size="sm" />
                <div>
                  <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#FFF" }}>
                    {displayName}
                  </h4>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)" }}>
                    @{otherUser.username}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <DurationBadge data-testid="video-call-duration">
                  {callState === CALL_STATES.CONNECTED ? formatDuration(callDuration) : statusMessage}
                </DurationBadge>
                <IconButton onClick={handleToggleFullscreen} title="Fullscreen" style={{ color: "#FFF" }}>
                  {isFullscreen ? <FiMinimize2 size={16} /> : <FiMaximize2 size={16} />}
                </IconButton>
              </div>
            </VideoTopBar>

            {/* Floating Picture-in-Picture Local Video Preview */}
            <LocalPipWrapper data-testid="local-video-preview">
              {isCameraOff ? (
                <div style={{ width: "100%", height: "100%", background: "#1E1E2E", display: "grid", placeItems: "center", color: "#9CA3AF" }}>
                  <FiVideoOff size={20} />
                </div>
              ) : (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                />
              )}
            </LocalPipWrapper>

            {/* Bottom Floating Video Controls */}
            <VideoControlsBar>
              <IconButton
                active={isMuted}
                onClick={toggleMicrophone}
                title={isMuted ? "Unmute microphone" : "Mute microphone"}
                data-testid="toggle-mic-btn"
              >
                {isMuted ? <FiMicOff size={20} /> : <FiMic size={20} />}
              </IconButton>

              <IconButton
                active={isCameraOff}
                onClick={toggleCamera}
                title={isCameraOff ? "Turn on camera" : "Turn off camera"}
                data-testid="toggle-camera-btn"
              >
                {isCameraOff ? <FiVideoOff size={20} /> : <FiVideo size={20} />}
              </IconButton>

              <IconButton onClick={switchCamera} title="Flip camera">
                <FiRefreshCw size={18} />
              </IconButton>

              <CircleButton
                variant="danger"
                title="End Video Call"
                data-testid="end-call-btn"
                onClick={() => endCall(socket, "NORMAL")}
              >
                <FiPhoneOff size={20} />
              </CircleButton>
            </VideoControlsBar>
          </RemoteVideoWrapper>
        </VideoContainer>
      )}

      {/* 5. CALL TERMINATION / STATUS OVERLAY (Busy, Rejected, Cancelled, Missed, Failed, Ended) */}
      {[
        CALL_STATES.BUSY,
        CALL_STATES.REJECTED,
        CALL_STATES.CANCELLED,
        CALL_STATES.MISSED,
        CALL_STATES.FAILED,
        CALL_STATES.ENDED,
      ].includes(callState) && (
        <Card data-testid="call-status-screen">
          <AvatarWrapper>
            <Avatar
              image={otherUser.avatarImage}
              name={displayName}
              size="lg"
              showStatus={false}
            />
          </AvatarWrapper>

          <UserName>{displayName}</UserName>
          <StatusText style={{ color: callState === CALL_STATES.FAILED ? "var(--bad, #DC2626)" : "var(--mut)" }}>
            {errorMessage || statusMessage || "Call ended"}
          </StatusText>
        </Card>
      )}
    </Overlay>
  );
}

// Styled Components
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 23, 0.75);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeIn 0.2s ease;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

const Card = styled.div`
  width: 100%;
  max-width: 360px;
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, #E5E7EB);
  border-radius: 24px;
  padding: 28px 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;

const BadgePill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 99px;
  background: var(--acc2, #FBF3EF);
  color: var(--acc, #D98B70);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 20px;
`;

const AvatarWrapper = styled.div`
  position: relative;
  border-radius: 50%;
  padding: 4px;
  margin-bottom: 16px;

  &.pulsing {
    animation: ${pulse} 2s infinite;
  }

  &.ringing {
    animation: ${ringPulse} 2s infinite;
  }
`;

const UserName = styled.h3`
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  color: var(--ink, #111827);
`;

const UserHandle = styled.p`
  margin: 2px 0 10px;
  font-size: 13px;
  color: var(--mut, #6B7280);
`;

const StatusText = styled.p`
  margin: 0 0 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--mut, #6B7280);
`;

const DurationBadge = styled.div`
  padding: 4px 14px;
  border-radius: 99px;
  background: var(--bg, #F3F4F6);
  color: var(--ink, #111827);
  font-family: monospace;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin-bottom: 24px;
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  width: 100%;
  margin-top: 10px;
`;

const CircleButton = styled.button`
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: grid;
  place-items: center;
  color: #ffffff;
  transition: transform 0.15s ease, background 0.15s ease;
  background: ${(props) => (props.variant === "success" ? "#10B981" : "#EF4444")};

  &.ringing {
    animation: ${ringPulse} 2s infinite;
  }

  &:hover {
    transform: scale(1.08);
    background: ${(props) => (props.variant === "success" ? "#059669" : "#DC2626")};
  }

  &:active {
    transform: scale(0.95);
  }
`;

const ControlsPill = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px;
  border-radius: 99px;
  background: var(--bg, #F3F4F6);
  border: 1px solid var(--line, #E5E7EB);
`;

const IconButton = styled.button`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid ${(props) => (props.active ? "var(--bad, #EF4444)" : "var(--line, #E5E7EB)")};
  background: ${(props) => (props.active ? "rgba(239, 68, 68, 0.12)" : "var(--surf, #FFFFFF)")};
  color: ${(props) => (props.active ? "var(--bad, #EF4444)" : "var(--ink, #111827)")};
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${(props) => (props.active ? "rgba(239, 68, 68, 0.2)" : "var(--bg, #F9FAFB)")};
    transform: scale(1.05);
  }
`;

// Video Calling Styled Components
const VideoContainer = styled.div`
  width: 100%;
  max-width: 900px;
  height: 80vh;
  max-height: 640px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  background: #000000;
  position: relative;
  display: flex;
  flex-direction: column;
`;

const RemoteVideoWrapper = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  background: #111827;
  overflow: hidden;
`;

const VideoPlaceholder = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, #1F2937 0%, #111827 100%);
`;

const VideoTopBar = styled.div`
  position: absolute;
  top: 16px;
  left: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 10;
  padding: 8px 16px;
  border-radius: 14px;
  background: rgba(17, 24, 39, 0.65);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const LocalPipWrapper = styled.div`
  position: absolute;
  bottom: 90px;
  right: 20px;
  width: 160px;
  height: 110px;
  border-radius: 14px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  z-index: 15;
  background: #000;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.03);
  }
`;

const VideoControlsBar = styled.div`
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 24px;
  border-radius: 99px;
  background: rgba(17, 24, 39, 0.75);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  z-index: 20;

  ${IconButton} {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.2);
    color: #FFFFFF;

    &:hover {
      background: rgba(255, 255, 255, 0.25);
    }
  }
`;
