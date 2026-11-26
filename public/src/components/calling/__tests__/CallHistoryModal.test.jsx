import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CallHistoryModal from "../CallHistoryModal";
import apiClient from "../../../services/apiClient";

jest.mock("../../../services/apiClient");

describe("CallHistoryModal Component", () => {
  const mockCalls = [
    {
      _id: "c1",
      callType: "VOICE",
      status: "ENDED",
      direction: "outgoing",
      duration: 120,
      createdAt: new Date().toISOString(),
      otherParty: {
        _id: "u1",
        username: "alice",
        displayName: "Alice",
        avatarImage: "",
      },
    },
    {
      _id: "c2",
      callType: "VIDEO",
      status: "MISSED",
      direction: "incoming",
      duration: 0,
      createdAt: new Date().toISOString(),
      otherParty: {
        _id: "u2",
        username: "bob",
        displayName: "Bob",
        avatarImage: "",
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("does not render when isOpen is false", () => {
    const { container } = render(
      <CallHistoryModal isOpen={false} onClose={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  test("fetches and renders call records when opened", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            ...mockCalls[0],
            duration: 120, // 2m 0s
          },
          {
            ...mockCalls[1],
            isMissed: true,
          },
        ],
      },
    });

    render(<CallHistoryModal isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByText("Call History")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    expect(screen.getByText("2m 0s")).toBeInTheDocument();
    expect(screen.getAllByText("Missed").length).toBeGreaterThanOrEqual(1);
  });

  test("filters calls by tab selection", async () => {
    apiClient.get
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: mockCalls,
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [
            {
              ...mockCalls[1],
              isMissed: true,
            },
          ],
        },
      });

    render(<CallHistoryModal isOpen={true} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    // Switch to Missed tab
    const missedTab = screen.getByRole("button", { name: "Missed" });
    fireEvent.click(missedTab);

    // After re-fetch with filter, only Bob should be displayed under Missed
    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });
});
