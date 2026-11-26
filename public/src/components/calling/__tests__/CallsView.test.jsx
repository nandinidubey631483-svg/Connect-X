import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CallsView from "../CallsView";
import apiClient from "../../../services/apiClient";

jest.mock("../../../services/apiClient");

describe("CallsView Component", () => {
  const mockCalls = [
    {
      _id: "c1",
      callType: "VOICE",
      status: "ENDED",
      direction: "OUTGOING",
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
      direction: "INCOMING",
      duration: 0,
      createdAt: new Date().toISOString(),
      isMissed: true,
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

  test("renders CallsView header and fetches calls on mount", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: mockCalls,
      },
    });

    render(<CallsView onBack={jest.fn()} />);

    expect(screen.getByText("Call History")).toBeInTheDocument();
    expect(
      screen.getByText("View recent voice and video call logs and return missed calls")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    expect(screen.getByText("2m 0s")).toBeInTheDocument();
  });

  test("filters calls list when searching by name", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: mockCalls,
      },
    });

    render(<CallsView onBack={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search call logs...");
    fireEvent.change(searchInput, { target: { value: "bob" } });

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  test("triggers onBack handler when back button is clicked", async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [],
      },
    });

    const handleBack = jest.fn();
    render(<CallsView onBack={handleBack} />);

    const backBtn = screen.getByTitle("Back to Chats");
    fireEvent.click(backBtn);

    expect(handleBack).toHaveBeenCalledTimes(1);
  });
});
