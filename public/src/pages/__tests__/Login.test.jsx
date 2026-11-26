import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../Login";
import * as useAuthHook from "../../hooks/useAuth";

jest.mock("../../hooks/useAuth");
jest.mock("../../assets/logo.svg", () => "mock-logo.svg");

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

describe("ConnectX Login Page Integration", () => {
  const mockLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthHook.useAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  test("renders login form with username and password inputs", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  test("submits valid credentials through AuthContext login and navigates to /", async () => {
    mockLogin.mockResolvedValueOnce({
      success: true,
      user: { _id: "u1", username: "alice" },
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("alice", "password123");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  test("handles login failure and keeps user on page", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "wrongpassword" },
    });

    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("alice", "wrongpassword");
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
