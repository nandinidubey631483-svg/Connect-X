import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Logout from "../Logout";
import SessionExpiryBanner from "../common/SessionExpiryBanner";
import * as useAuthHook from "../../hooks/useAuth";

jest.mock("../../hooks/useAuth");

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

describe("ConnectX Logout & Session Expiry Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Logout Component", () => {
    test("clicking logout triggers authContext logout and navigates to /login", async () => {
      const mockLogout = jest.fn().mockResolvedValue();
      useAuthHook.useAuth.mockReturnValue({
        logout: mockLogout,
      });

      render(
        <MemoryRouter>
          <Logout />
        </MemoryRouter>
      );

      const button = screen.getByTestId("logout-button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith("/login");
      });
    });
  });

  describe("SessionExpiryBanner Component", () => {
    test("renders banner when session expired error is present", () => {
      const mockLogout = jest.fn();
      useAuthHook.useAuth.mockReturnValue({
        error: "Your session has expired. Please log in again.",
        logout: mockLogout,
      });

      render(
        <MemoryRouter>
          <SessionExpiryBanner />
        </MemoryRouter>
      );

      expect(screen.getByTestId("session-expiry-banner")).toBeInTheDocument();
      expect(
        screen.getByText("Your session has expired. Please log in again.")
      ).toBeInTheDocument();
    });

    test("does not render when there is no session expiry error", () => {
      useAuthHook.useAuth.mockReturnValue({
        error: null,
        logout: jest.fn(),
      });

      render(
        <MemoryRouter>
          <SessionExpiryBanner />
        </MemoryRouter>
      );

      expect(screen.queryByTestId("session-expiry-banner")).not.toBeInTheDocument();
    });
  });
});
