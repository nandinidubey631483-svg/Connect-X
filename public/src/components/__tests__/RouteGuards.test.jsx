import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "../ProtectedRoute";
import GuestRoute from "../GuestRoute";
import * as useAuthHook from "../../hooks/useAuth";

jest.mock("../../hooks/useAuth");

describe("ConnectX Route Guarding Components", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("ProtectedRoute", () => {
    test("renders LoadingScreen when authentication state is loading", () => {
      useAuthHook.useAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
      });

      render(
        <MemoryRouter initialEntries={["/protected"]}>
          <Routes>
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>Secret Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByTestId("loading-screen")).toBeInTheDocument();
      expect(screen.queryByText("Secret Content")).not.toBeInTheDocument();
    });

    test("redirects unauthenticated users to /login", () => {
      useAuthHook.useAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Secret Dashboard</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText("Login Page")).toBeInTheDocument();
      expect(screen.queryByText("Secret Dashboard")).not.toBeInTheDocument();
    });

    test("renders protected children when authenticated", () => {
      useAuthHook.useAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { _id: "u123", username: "alice" },
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Secret Dashboard Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText("Secret Dashboard Content")).toBeInTheDocument();
    });
  });

  describe("GuestRoute", () => {
    test("renders LoadingScreen when authentication state is loading", () => {
      useAuthHook.useAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
      });

      render(
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <div>Login Form</div>
                </GuestRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByTestId("loading-screen")).toBeInTheDocument();
      expect(screen.queryByText("Login Form")).not.toBeInTheDocument();
    });

    test("redirects authenticated users away from guest routes to /", () => {
      useAuthHook.useAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { _id: "u123", username: "alice" },
      });

      render(
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <div>Login Form</div>
                </GuestRoute>
              }
            />
            <Route path="/" element={<div>Chat Home</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText("Chat Home")).toBeInTheDocument();
      expect(screen.queryByText("Login Form")).not.toBeInTheDocument();
    });

    test("renders guest children when unauthenticated", () => {
      useAuthHook.useAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      render(
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <div>Login Form</div>
                </GuestRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText("Login Form")).toBeInTheDocument();
    });
  });
});
