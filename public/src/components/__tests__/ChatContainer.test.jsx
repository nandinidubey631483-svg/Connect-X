import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import ChatContainer from "../ChatContainer";
import apiClient from "../../services/apiClient";
import axios from "axios";

// Mock child components to isolate ChatContainer
jest.mock("../Logout", () => () => <button data-testid="logout-btn">Logout</button>);
jest.mock("emoji-picker-react", () => () => <div data-testid="emoji-picker" />);

jest.mock("../../services/apiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe("ChatContainer Component (Module 6 Messaging)", () => {
  const mockCurrentChat = {
    _id: "user_bob_123",
    username: "bob_ross",
    displayName: "Bob Ross",
    avatarImage: "bob_avatar_base64",
    conversationId: "conv_alice_bob_456",
  };

  let mockSocket;
  let socketListeners = {};

  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    socketListeners = {};
    mockSocket = {
      current: {
        emit: jest.fn(),
        on: jest.fn((event, callback) => {
          socketListeners[event] = callback;
        }),
        off: jest.fn((event) => {
          delete socketListeners[event];
        }),
      },
    };

    // Setup localStorage mock user
    const mockUser = { _id: "user_alice_789", username: "alice" };
    localStorage.setItem(
      process.env.REACT_APP_LOCALHOST_KEY || "chat-app-current-user",
      JSON.stringify(mockUser)
    );
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("loads messages using v1 endpoint when conversationId is present", async () => {
    const mockMessages = [
      { _id: "m1", fromSelf: false, message: "Hello Alice!", createdAt: "2026-11-26T00:00:00Z" },
      { _id: "m2", fromSelf: true, message: "Hey Bob!", createdAt: "2026-11-26T00:01:00Z" },
    ];

    apiClient.get.mockResolvedValueOnce({
      data: { success: true, messages: mockMessages },
    });

    render(<ChatContainer currentChat={mockCurrentChat} socket={mockSocket} />);

    expect(screen.getByText("Bob Ross")).toBeInTheDocument();

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/messages/${mockCurrentChat.conversationId}`)
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Hello Alice!")).toBeInTheDocument();
      expect(screen.getByText("Hey Bob!")).toBeInTheDocument();
    });
  });

  test("falls back to legacy endpoint if v1 API fails or conversationId is missing", async () => {
    const chatWithoutConv = {
      _id: "user_bob_123",
      username: "bob_ross",
      avatarImage: "bob_avatar",
    };

    const legacyMessages = [
      { fromSelf: false, message: "Legacy message from Bob" },
    ];

    axios.post.mockResolvedValueOnce({
      data: legacyMessages,
    });

    render(<ChatContainer currentChat={chatWithoutConv} socket={mockSocket} />);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
      expect(screen.getByText("Legacy message from Bob")).toBeInTheDocument();
    });
  });

  test("sends message via optimistic state, socket.emit and API persist", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: { success: true, messages: [] },
    });
    apiClient.post.mockResolvedValueOnce({
      data: { success: true, data: { _id: "m_new" } },
    });

    const { container } = render(
      <ChatContainer currentChat={mockCurrentChat} socket={mockSocket} />
    );

    const input = screen.getByPlaceholderText("type your message here");
    fireEvent.change(input, { target: { value: "Let's paint trees" } });

    const form = container.querySelector(".input-container");
    fireEvent.submit(form);

    // Optimistically rendered
    await waitFor(() => {
      expect(screen.getByText("Let's paint trees")).toBeInTheDocument();
    });

    // Emitted to socket
    expect(mockSocket.current.emit).toHaveBeenCalledWith(
      "message:send",
      expect.objectContaining({
        conversationId: "conv_alice_bob_456",
        to: "user_bob_123",
        text: "Let's paint trees",
      })
    );

    // Emitted legacy socket event
    expect(mockSocket.current.emit).toHaveBeenCalledWith(
      "send-msg",
      expect.objectContaining({
        to: "user_bob_123",
        msg: "Let's paint trees",
      })
    );

    // Persisted via v1 HTTP API
    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/messages"),
      expect.objectContaining({
        conversationId: "conv_alice_bob_456",
        to: "user_bob_123",
        text: "Let's paint trees",
      })
    );
  });

  test("receives real-time message via socket 'message:receive' and prevents duplicates", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: { success: true, messages: [] },
    });

    render(<ChatContainer currentChat={mockCurrentChat} socket={mockSocket} />);

    expect(socketListeners["message:receive"]).toBeDefined();

    // Trigger incoming message from bob
    const incomingPayload = {
      _id: "m_incoming_1",
      sender: "user_bob_123",
      text: "Happy little clouds",
      createdAt: new Date().toISOString(),
    };

    act(() => {
      socketListeners["message:receive"](incomingPayload);
    });

    await waitFor(() => {
      expect(screen.getByText("Happy little clouds")).toBeInTheDocument();
    });

    // Receive duplicate event with same ID
    act(() => {
      socketListeners["message:receive"](incomingPayload);
    });

    // Assert only one exists
    const renderedMessages = screen.getAllByText("Happy little clouds");
    expect(renderedMessages).toHaveLength(1);
  });

  test("renders message receipt indicators (SENT, DELIVERED, READ) and updates on socket event", async () => {
    const mockMessages = [
      {
        _id: "m_sent_1",
        fromSelf: true,
        message: "Sent message",
        status: "SENT",
        createdAt: "2026-11-26T00:00:00Z",
      },
      {
        _id: "m_read_1",
        fromSelf: true,
        message: "Read message",
        status: "READ",
        createdAt: "2026-11-26T00:01:00Z",
      },
    ];

    apiClient.get.mockResolvedValueOnce({
      data: { success: true, messages: mockMessages },
    });

    render(<ChatContainer currentChat={mockCurrentChat} socket={mockSocket} />);

    await waitFor(() => {
      expect(screen.getByText("Sent message")).toBeInTheDocument();
      expect(screen.getByText("Read message")).toBeInTheDocument();
    });

    // Check initial receipt badges
    expect(screen.getByTestId("receipt-sent")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-read")).toBeInTheDocument();

    // Bob delivers m_sent_1: receive message:status_update
    act(() => {
      socketListeners["message:status_update"]({
        messageId: "m_sent_1",
        status: "DELIVERED",
        deliveredAt: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("receipt-delivered")).toBeInTheDocument();
    });

    // Outdated regression event (SENT) must NOT regress DELIVERED
    act(() => {
      socketListeners["message:status_update"]({
        messageId: "m_sent_1",
        status: "SENT",
      });
    });

    // Status remains delivered
    expect(screen.getByTestId("receipt-delivered")).toBeInTheDocument();
  });

  test("emits message:delivered and message:read when incoming message is received", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: { success: true, messages: [] },
    });

    render(<ChatContainer currentChat={mockCurrentChat} socket={mockSocket} />);

    const incoming = {
      _id: "m_incoming_ack",
      sender: "user_bob_123",
      text: "Testing receipts",
      createdAt: new Date().toISOString(),
    };

    act(() => {
      socketListeners["message:receive"](incoming);
    });

    await waitFor(() => {
      expect(screen.getByText("Testing receipts")).toBeInTheDocument();
    });

    // Assert delivery receipt was emitted
    expect(mockSocket.current.emit).toHaveBeenCalledWith(
      "message:delivered",
      expect.objectContaining({
        messageId: "m_incoming_ack",
        conversationId: "conv_alice_bob_456",
      })
    );

    // Assert read receipt was emitted
    expect(mockSocket.current.emit).toHaveBeenCalledWith(
      "message:read",
      expect.objectContaining({
        messageId: "m_incoming_ack",
        conversationId: "conv_alice_bob_456",
      })
    );
  });

  test("renders image preview and file card for media messages", async () => {
    const mockMediaMessages = [
      {
        _id: "m_img_1",
        fromSelf: false,
        message: "[Image]",
        messageType: "IMAGE",
        media: {
          filename: "sunset.jpg",
          mimeType: "image/jpeg",
          data: "fakebase64jpeg",
        },
        createdAt: "2026-11-26T00:00:00Z",
      },
      {
        _id: "m_file_1",
        fromSelf: true,
        message: "[File] document.pdf",
        messageType: "FILE",
        media: {
          filename: "document.pdf",
          originalName: "My Document.pdf",
          mimeType: "application/pdf",
          size: 20480,
          url: "/api/v1/messages/media/m_file_1",
        },
        status: "DELIVERED",
        createdAt: "2026-11-26T00:01:00Z",
      },
    ];

    apiClient.get.mockResolvedValueOnce({
      data: { success: true, messages: mockMediaMessages },
    });

    render(<ChatContainer currentChat={mockCurrentChat} socket={mockSocket} />);

    // Image preview must be rendered
    await waitFor(() => {
      expect(screen.getByTestId("media-image-preview")).toBeInTheDocument();
    });

    // File card must be rendered with filename, size, and download link
    expect(screen.getByTestId("media-file-card")).toBeInTheDocument();
    expect(screen.getByText("My Document.pdf")).toBeInTheDocument();
    expect(screen.getByText("20.0 KB")).toBeInTheDocument();
    expect(screen.getByTestId("file-download-link")).toHaveAttribute(
      "href",
      "/api/v1/messages/media/m_file_1"
    );
  });
});
