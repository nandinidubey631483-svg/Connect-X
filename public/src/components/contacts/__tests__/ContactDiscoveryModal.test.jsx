import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ContactDiscoveryModal from "../ContactDiscoveryModal";
import apiClient from "../../../services/apiClient";

jest.mock("../../../services/apiClient");

describe("ConnectX ContactDiscoveryModal Component", () => {
  const mockOnClose = jest.fn();
  const mockOnContactsUpdated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("does not render when isOpen is false", () => {
    const { container } = render(
      <ContactDiscoveryModal isOpen={false} onClose={mockOnClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders modal, searches users, and displays relationship actions", async () => {
    apiClient.get.mockImplementation((url) => {
      if (url.includes("/api/v1/contacts/search")) {
        return Promise.resolve({
          data: {
            success: true,
            users: [
              {
                _id: "u_alice",
                username: "alice",
                displayName: "Alice W",
                relationship: "NONE",
              },
              {
                _id: "u_bob",
                username: "bob",
                displayName: "Bob M",
                relationship: "PENDING_SENT",
                requestId: "req_bob",
              },
              {
                _id: "u_charlie",
                username: "charlie",
                displayName: "Charlie",
                relationship: "CONTACT",
              },
            ],
            pagination: { total: 3, page: 1, limit: 10, totalPages: 1 },
          },
        });
      }
      if (url.includes("/api/v1/contacts/requests")) {
        return Promise.resolve({
          data: {
            success: true,
            incoming: [],
            outgoing: [],
          },
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(
      <ContactDiscoveryModal
        isOpen={true}
        onClose={mockOnClose}
        onContactsUpdated={mockOnContactsUpdated}
      />
    );

    expect(screen.getByText("Contacts & Discovery")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Alice W")).toBeInTheDocument();
      expect(screen.getByText("Bob M")).toBeInTheDocument();
      expect(screen.getByText("Charlie")).toBeInTheDocument();
      expect(screen.getByTestId("btn-add-alice")).toBeInTheDocument();
      expect(screen.getByTestId("btn-cancel-bob")).toBeInTheDocument();
      expect(screen.getByTestId("btn-remove-charlie")).toBeInTheDocument();
    });
  });

  test("sends contact request when Add is clicked", async () => {
    apiClient.get.mockImplementation((url) => {
      if (url.includes("/api/v1/contacts/search")) {
        return Promise.resolve({
          data: {
            success: true,
            users: [
              {
                _id: "u_alice",
                username: "alice",
                displayName: "Alice W",
                relationship: "NONE",
              },
            ],
            pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
          },
        });
      }
      return Promise.resolve({ data: { success: true, incoming: [], outgoing: [] } });
    });

    apiClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        request: { _id: "req_alice", status: "PENDING" },
      },
    });

    render(
      <ContactDiscoveryModal
        isOpen={true}
        onClose={mockOnClose}
        onContactsUpdated={mockOnContactsUpdated}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("btn-add-alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-add-alice"));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/contacts/request"),
        { recipientId: "u_alice" }
      );
    });
  });

  test("switches to Requests tab and allows accepting incoming requests", async () => {
    apiClient.get.mockImplementation((url) => {
      if (url.includes("/api/v1/contacts/requests")) {
        return Promise.resolve({
          data: {
            success: true,
            incoming: [
              {
                _id: "req_incoming_1",
                requester: { _id: "u_dave", username: "dave", displayName: "Dave D" },
              },
            ],
            outgoing: [
              {
                _id: "req_outgoing_1",
                recipient: { _id: "u_eve", username: "eve", displayName: "Eve E" },
              },
            ],
          },
        });
      }
      return Promise.resolve({
        data: { success: true, users: [], pagination: { total: 0, totalPages: 1 } },
      });
    });

    apiClient.post.mockResolvedValueOnce({
      data: { success: true, message: "Accepted" },
    });

    render(
      <ContactDiscoveryModal
        isOpen={true}
        onClose={mockOnClose}
        onContactsUpdated={mockOnContactsUpdated}
      />
    );

    // Switch to requests tab
    fireEvent.click(screen.getByTestId("tab-requests"));

    await waitFor(() => {
      expect(screen.getByText("Dave D")).toBeInTheDocument();
      expect(screen.getByText("Eve E")).toBeInTheDocument();
      expect(screen.getByText("Accept")).toBeInTheDocument();
      expect(screen.getByText("Decline")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Accept"));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/contacts/request/req_incoming_1/accept")
      );
      expect(mockOnContactsUpdated).toHaveBeenCalled();
    });
  });
});
