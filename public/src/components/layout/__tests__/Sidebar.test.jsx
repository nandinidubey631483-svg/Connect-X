import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Sidebar from "../Sidebar";

describe("ConnectX Sidebar Component", () => {
  const mockContacts = [
    {
      _id: "u_alice",
      username: "alice",
      displayName: "Alice Wonderland",
      avatarImage: "avatar_alice",
      isOnline: true,
      lastMessage: {
        text: "Let's meet tomorrow",
        createdAt: new Date().toISOString(),
      },
    },
    {
      _id: "u_bob",
      username: "bob_ross",
      displayName: "Bob Painter",
      avatarImage: "avatar_bob",
      isOnline: false,
      lastMessage: {
        text: "Painting complete",
        createdAt: "2026-11-20T10:00:00.000Z",
      },
    },
  ];

  const mockOnSelectChat = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders empty state when no contacts exist", () => {
    render(<Sidebar contacts={[]} onSelectChat={mockOnSelectChat} />);
    expect(screen.getByText("No other users registered yet.")).toBeInTheDocument();
  });

  test("renders contact list with displayName, presence, and last message snippet", () => {
    render(
      <Sidebar
        contacts={mockContacts}
        currentChat={null}
        onSelectChat={mockOnSelectChat}
      />
    );

    expect(screen.getByText("Alice Wonderland")).toBeInTheDocument();
    expect(screen.getByText("Let's meet tomorrow")).toBeInTheDocument();
    expect(screen.getByText("Bob Painter")).toBeInTheDocument();
    expect(screen.getByText("Painting complete")).toBeInTheDocument();
    expect(screen.getByText("DIRECT MESSAGES (2)")).toBeInTheDocument();
  });

  test("filters contacts by query matching username or displayName", () => {
    render(
      <Sidebar
        contacts={mockContacts}
        currentChat={null}
        onSelectChat={mockOnSelectChat}
      />
    );

    const searchInput = screen.getByTestId("sidebar-search-input");
    fireEvent.change(searchInput, { target: { value: "Painter" } });

    expect(screen.queryByText("Alice Wonderland")).not.toBeInTheDocument();
    expect(screen.getByText("Bob Painter")).toBeInTheDocument();
    expect(screen.getByText("DIRECT MESSAGES (1)")).toBeInTheDocument();
  });

  test("calls onSelectChat with contact payload when card is clicked", () => {
    render(
      <Sidebar
        contacts={mockContacts}
        currentChat={null}
        onSelectChat={mockOnSelectChat}
      />
    );

    const aliceCard = screen.getByTestId("contact-card-alice");
    fireEvent.click(aliceCard);

    expect(mockOnSelectChat).toHaveBeenCalledTimes(1);
    expect(mockOnSelectChat).toHaveBeenCalledWith(mockContacts[0]);
  });
});
