/**
 * ConnectX AuthContext & useAuth Unit Tests
 * Verifies centralized auth state, login/logout workflows, and silent refresh initialization.
 */
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import axios from "axios";
import { AuthProvider } from "../AuthContext";
import useAuth from "../../hooks/useAuth";
import apiClient from "../../services/apiClient";
import { clearAuthTokens, getAccessToken } from "../../services/tokenManager";

jest.mock("axios", () => {
  const instance = {
    interceptors: {
      request: { use: jest.fn(), handlers: [] },
      response: { use: jest.fn(), handlers: [] },
    },
    defaults: { headers: { common: {} } },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    request: jest.fn(),
  };

  return {
    __esModule: true,
    default: {
      create: jest.fn(() => instance),
      post: jest.fn(),
      get: jest.fn(),
    },
    create: jest.fn(() => instance),
    post: jest.fn(),
    get: jest.fn(),
  };
});

// Test consumer component
function TestConsumer() {
  const { user, isAuthenticated, isLoading, error, login, logout } = useAuth();

  if (isLoading) return <div>Loading Auth...</div>;

  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? "Authenticated" : "Unauthenticated"}</div>
      <div data-testid="user-name">{user ? user.username : "No User"}</div>
      {error && <div data-testid="auth-error">{error}</div>}
      <button onClick={() => login("testuser", "Password123!")}>Login Button</button>
      <button onClick={() => logout()}>Logout Button</button>
    </div>
  );
}

describe("ConnectX AuthContext & useAuth", () => {
  beforeEach(() => {
    clearAuthTokens();
    localStorage.clear();
    jest.clearAllMocks();
  });

  test("initial mount attempts silent refresh and restores session on valid cookie", async () => {
    // 1. Mock CSRF fetch
    axios.get.mockResolvedValueOnce({ data: { csrfToken: "initial_csrf" } });
    // 2. Mock silent refresh
    axios.post.mockResolvedValueOnce({
      data: {
        accessToken: "restored_access_token",
        csrfToken: "restored_csrf",
      },
    });
    // 3. Mock me endpoint
    apiClient.get.mockResolvedValueOnce({
      data: {
        user: { _id: "u123", username: "restoredAlice", email: "alice@test.com" },
      },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Initial loading indicator
    expect(screen.getByText("Loading Auth...")).toBeInTheDocument();

    // After resolution:
    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Authenticated");
      expect(screen.getByTestId("user-name")).toHaveTextContent("restoredAlice");
    });

    expect(getAccessToken()).toBe("restored_access_token");
    expect(localStorage.getItem("chat-app-current-user")).toContain("restoredAlice");
  });

  test("initial mount transitions to unauthenticated if silent refresh fails", async () => {
    axios.get.mockResolvedValueOnce({ data: { csrfToken: "csrf" } });
    axios.post.mockRejectedValueOnce(new Error("No active session"));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Unauthenticated");
      expect(screen.getByTestId("user-name")).toHaveTextContent("No User");
    });

    expect(getAccessToken()).toBeNull();
  });

  test("login action updates tokens, sets user state, and synchronizes profile to localStorage", async () => {
    axios.get.mockRejectedValueOnce(new Error("No session"));
    axios.post.mockRejectedValueOnce(new Error("No session"));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Unauthenticated");
    });

    // Mock login endpoint call
    apiClient.post.mockResolvedValueOnce({
      data: {
        accessToken: "login_jwt_token",
        csrfToken: "login_csrf_token",
        user: { _id: "u456", username: "loggedInBob", email: "bob@test.com" },
      },
    });

    await act(async () => {
      screen.getByText("Login Button").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Authenticated");
      expect(screen.getByTestId("user-name")).toHaveTextContent("loggedInBob");
    });

    expect(getAccessToken()).toBe("login_jwt_token");
    expect(localStorage.getItem("chat-app-current-user")).toContain("loggedInBob");
  });

  test("logout action clears tokens, resets user state, and removes localStorage profile", async () => {
    // Initial mount without session
    axios.get.mockRejectedValueOnce(new Error("No session"));
    axios.post.mockRejectedValueOnce(new Error("No session"));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Unauthenticated");
    });

    // Login first
    apiClient.post.mockResolvedValueOnce({
      data: {
        accessToken: "tok",
        csrfToken: "csrf",
        user: { _id: "u789", username: "charlie" },
      },
    });

    await act(async () => {
      screen.getByText("Login Button").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Authenticated");
    });

    // Now trigger logout
    apiClient.post.mockResolvedValueOnce({ data: { success: true } });

    await act(async () => {
      screen.getByText("Logout Button").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Unauthenticated");
      expect(screen.getByTestId("user-name")).toHaveTextContent("No User");
    });

    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem("chat-app-current-user")).toBeNull();
  });
});
