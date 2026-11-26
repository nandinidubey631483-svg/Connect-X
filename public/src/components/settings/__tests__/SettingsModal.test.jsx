import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsModal from "../SettingsModal";
import apiClient from "../../../services/apiClient";

jest.mock("../../../services/apiClient");

describe("ConnectX SettingsModal Component", () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockResolvedValue({
      data: {
        success: true,
        settings: {
          notifications: {
            emailNotifications: true,
            pushNotifications: false,
            soundEnabled: true,
            desktopAlerts: false,
          },
          privacy: {
            lastSeenVisibility: "contacts",
            readReceiptsEnabled: true,
            typingIndicatorVisibility: false,
          },
          chat: {
            enterToSend: true,
            fontSize: "medium",
            mediaAutoDownload: false,
            soundTheme: "default",
          },
        },
      },
    });
  });

  test("renders settings modal with tabs and fetched preferences", async () => {
    render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("tab-notifications")).toBeInTheDocument();
      expect(screen.getByTestId("tab-privacy")).toBeInTheDocument();
      expect(screen.getByTestId("tab-chat")).toBeInTheDocument();
      expect(screen.getByTestId("toggle-emailNotifications")).toBeChecked();
      expect(screen.getByTestId("toggle-pushNotifications")).not.toBeChecked();
    });
  });

  test("switches tabs and displays category-specific controls", async () => {
    render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("toggle-emailNotifications")).toBeInTheDocument();
    });

    // Switch to Privacy tab
    fireEvent.click(screen.getByTestId("tab-privacy"));
    expect(screen.getByTestId("select-lastSeenVisibility")).toHaveValue("contacts");
    expect(screen.getByTestId("toggle-readReceiptsEnabled")).toBeChecked();

    // Switch to Chat Preferences tab
    fireEvent.click(screen.getByTestId("tab-chat"));
    expect(screen.getByTestId("select-fontSize")).toHaveValue("medium");
    expect(screen.getByTestId("toggle-enterToSend")).toBeChecked();
  });

  test("toggles setting, saves preferences, and calls onClose", async () => {
    apiClient.put.mockResolvedValueOnce({
      data: {
        success: true,
        settings: {
          notifications: { emailNotifications: false },
          privacy: {},
          chat: {},
        },
      },
    });

    render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("toggle-emailNotifications")).toBeChecked();
    });

    // Toggle email notifications off
    fireEvent.click(screen.getByTestId("toggle-emailNotifications"));
    expect(screen.getByTestId("toggle-emailNotifications")).not.toBeChecked();

    fireEvent.click(screen.getByTestId("save-settings-btn"));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/settings"),
        expect.objectContaining({
          notifications: expect.objectContaining({ emailNotifications: false }),
        })
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test("clicking Reset Defaults calls reset endpoint", async () => {
    apiClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        settings: {
          notifications: { emailNotifications: true },
          privacy: { lastSeenVisibility: "everyone" },
          chat: { fontSize: "medium" },
        },
      },
    });

    render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("reset-settings-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("reset-settings-btn"));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/settings/reset")
      );
    });
  });
});
