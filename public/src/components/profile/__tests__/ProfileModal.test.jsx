import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProfileModal from "../ProfileModal";
import * as useAuthHook from "../../../hooks/useAuth";
import apiClient from "../../../services/apiClient";

jest.mock("../../../hooks/useAuth");
jest.mock("../../../services/apiClient");

describe("ConnectX ProfileModal Component", () => {
  const mockUpdateUser = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthHook.useAuth.mockReturnValue({
      user: {
        _id: "u123",
        username: "johndoe",
        displayName: "John Doe",
        bio: "Original bio",
        avatarImage: "avatar_123",
        statusMessage: "Hey there!",
      },
      updateUser: mockUpdateUser,
    });
  });

  test("renders profile form with populated user fields", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        profile: {
          username: "johndoe",
          displayName: "John Doe",
          bio: "Original bio",
          phoneNumber: "+1234567890",
          statusMessage: "Hey there!",
        },
      },
    });

    render(<ProfileModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
      expect(screen.getByDisplayValue("johndoe")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Original bio")).toBeInTheDocument();
    });
  });

  test("submits profile updates and updates auth context", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        profile: {
          username: "johndoe",
          displayName: "John Doe",
          bio: "Original bio",
        },
      },
    });

    apiClient.put.mockResolvedValueOnce({
      data: {
        success: true,
        profile: {
          username: "johndoe",
          displayName: "John Updated",
          bio: "Brand new bio",
        },
      },
    });

    render(<ProfileModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "John Updated" },
    });
    fireEvent.change(screen.getByLabelText(/about \/ bio/i), {
      target: { value: "Brand new bio" },
    });

    fireEvent.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/profile/me"),
        expect.objectContaining({
          displayName: "John Updated",
          bio: "Brand new bio",
        })
      );
      expect(mockUpdateUser).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test("closes modal when Cancel button is clicked", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: { success: true, profile: { username: "johndoe" } },
    });

    render(<ProfileModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("johndoe")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });
});
