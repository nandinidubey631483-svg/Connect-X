import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NotificationDropdown from "../NotificationDropdown";
import apiClient from "../../../services/apiClient";

jest.mock("../../../services/apiClient");

describe("NotificationDropdown Component", () => {
  const mockNotifications = [
    {
      _id: "notif_1",
      title: "New Message",
      body: "Hello from Alice",
      isRead: false,
      createdAt: new Date().toISOString(),
    },
    {
      _id: "notif_2",
      title: "Contact Request",
      body: "Bob sent you a contact request",
      isRead: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const mockSocket = {
    current: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockImplementation((url) => {
      if (url.includes("/unread-count")) {
        return Promise.resolve({ data: { success: true, unreadCount: 1 } });
      }
      return Promise.resolve({
        data: { success: true, notifications: mockNotifications, unreadCount: 1 },
      });
    });
    apiClient.put.mockResolvedValue({ data: { success: true } });
    apiClient.delete.mockResolvedValue({ data: { success: true } });
  });

  test("renders notification button and displays unread badge", async () => {
    render(<NotificationDropdown socket={mockSocket} />);

    const button = screen.getByTestId("header-notifications-btn");
    expect(button).toBeInTheDocument();

    await waitFor(() => {
      const badge = screen.getByTestId("notification-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("1");
    });
  });

  test("toggles dropdown and lists notifications on click", async () => {
    render(<NotificationDropdown socket={mockSocket} />);

    const button = screen.getByTestId("header-notifications-btn");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("notification-dropdown")).toBeInTheDocument();
      expect(screen.getByText("Hello from Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob sent you a contact request")).toBeInTheDocument();
    });
  });

  test("marks all notifications as read when button is clicked", async () => {
    render(<NotificationDropdown socket={mockSocket} />);

    const button = screen.getByTestId("header-notifications-btn");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("mark-all-read-btn")).toBeInTheDocument();
    });

    const markAllBtn = screen.getByTestId("mark-all-read-btn");
    fireEvent.click(markAllBtn);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining("/read-all")
      );
      expect(mockSocket.current.emit).toHaveBeenCalledWith("notification:mark_read", {
        markAll: true,
      });
    });
  });
});
