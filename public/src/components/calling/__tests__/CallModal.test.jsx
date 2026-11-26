import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import CallModal from "../CallModal";
import { CallContext, CALL_STATES } from "../../../context/CallContext";

// Simple helper to wrap CallModal with mock call context
function renderWithCallContext(contextValue) {
  return render(
    <CallContext.Provider value={contextValue}>
      <CallModal />
    </CallContext.Provider>
  );
}

describe("CallModal Component", () => {
  const defaultMockUser = {
    _id: "user-123",
    username: "john_doe",
    displayName: "John Doe",
    avatarImage: "",
  };

  test("does not render when callState is IDLE", () => {
    const mockContext = {
      callState: CALL_STATES.IDLE,
      CALL_STATES,
      activeCall: null,
      callDuration: 0,
      isMuted: false,
      isCameraOff: false,
    };

    const { container } = renderWithCallContext(mockContext);
    expect(container.firstChild).toBeNull();
  });

  test("renders Incoming Call screen with accept and reject buttons", () => {
    const handleAccept = jest.fn();
    const handleReject = jest.fn();

    const mockContext = {
      callState: CALL_STATES.INCOMING_CALL,
      CALL_STATES,
      activeCall: {
        callId: "c1",
        callType: "VOICE",
        caller: defaultMockUser,
        otherUser: defaultMockUser,
      },
      statusMessage: "Incoming call...",
      callDuration: 0,
      isMuted: false,
      isCameraOff: false,
      acceptCall: handleAccept,
      rejectCall: handleReject,
    };

    renderWithCallContext(mockContext);

    expect(screen.getByText("Incoming call...")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();

    const acceptBtn = screen.getByRole("button", { name: /accept call/i });
    const rejectBtn = screen.getByRole("button", { name: /decline call/i });

    expect(acceptBtn).toBeInTheDocument();
    expect(rejectBtn).toBeInTheDocument();

    fireEvent.click(acceptBtn);
    expect(handleAccept).toHaveBeenCalledTimes(1);

    fireEvent.click(rejectBtn);
    expect(handleReject).toHaveBeenCalledTimes(1);
  });

  test("renders Outgoing Call screen with cancel button", () => {
    const handleCancel = jest.fn();

    const mockContext = {
      callState: CALL_STATES.OUTGOING_CALL,
      CALL_STATES,
      activeCall: {
        callId: "c2",
        callType: "VIDEO",
        receiver: defaultMockUser,
        otherUser: defaultMockUser,
      },
      callDuration: 0,
      isMuted: false,
      isCameraOff: false,
      cancelCall: handleCancel,
    };

    renderWithCallContext(mockContext);

    expect(screen.getByText("Calling...")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();

    const cancelBtn = screen.getByRole("button", { name: /cancel call/i });
    expect(cancelBtn).toBeInTheDocument();

    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  test("renders Active Connected Voice Call with duration and controls", () => {
    const handleEnd = jest.fn();
    const handleToggleMute = jest.fn();

    const mockContext = {
      callState: CALL_STATES.CONNECTED,
      CALL_STATES,
      activeCall: {
        callId: "c3",
        callType: "VOICE",
        otherUser: defaultMockUser,
      },
      callDuration: 65, // 01:05
      isMuted: false,
      isCameraOff: false,
      endCall: handleEnd,
      toggleMicrophone: handleToggleMute,
      toggleCamera: jest.fn(),
      switchCamera: jest.fn(),
    };

    renderWithCallContext(mockContext);

    expect(screen.getByText("01:05")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByTestId("active-voice-call-screen")).toBeInTheDocument();

    const muteBtn = screen.getByRole("button", { name: /mute microphone/i });
    const endBtn = screen.getByRole("button", { name: /end call/i });

    expect(muteBtn).toBeInTheDocument();
    expect(endBtn).toBeInTheDocument();

    fireEvent.click(muteBtn);
    expect(handleToggleMute).toHaveBeenCalledTimes(1);

    fireEvent.click(endBtn);
    expect(handleEnd).toHaveBeenCalledTimes(1);
  });
});
