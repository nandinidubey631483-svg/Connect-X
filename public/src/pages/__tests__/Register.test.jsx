import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Register from "../Register";
import * as useAuthHook from "../../hooks/useAuth";

jest.mock("../../hooks/useAuth");
jest.mock("../../assets/logo.svg", () => "mock-logo.svg");

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

describe("ConnectX Register Page Integration", () => {
  const mockRegister = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthHook.useAuth.mockReturnValue({
      register: mockRegister,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  test("renders register form with all input fields", () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create user/i })).toBeInTheDocument();
  });

  test("submits valid registration through AuthContext register and navigates to /", async () => {
    mockRegister.mockResolvedValueOnce({
      success: true,
      user: { _id: "u2", username: "bob", email: "bob@example.com" },
    });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "bobuser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "bob@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        "bobuser",
        "bob@example.com",
        "password123"
      );
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });
});
