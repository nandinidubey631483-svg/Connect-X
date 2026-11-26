/**
 * ConnectX Centralized Auth Context
 * 
 * Provides:
 * - Reactive authentication state (user, isAuthenticated, isLoading, error)
 * - In-memory access token management via tokenManager
 * - Silent session restoration via HttpOnly refresh cookie on application mount
 * - Login, Register, Logout, and Logout-All workflows
 * - Non-sensitive user profile synchronization with legacy localStorage key
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import apiClient, { setSessionExpiredHandler, fetchCsrfToken } from "../services/apiClient";
import {
  setAccessToken,
  setCsrfToken,
  clearAuthTokens,
  getAccessToken,
  getCsrfToken,
} from "../services/tokenManager";
import {
  v1LoginRoute,
  v1RegisterRoute,
  v1LogoutRoute,
  v1LogoutAllRoute,
  v1RefreshRoute,
  v1MeRoute,
} from "../services/apiRoutes";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const LOCALHOST_KEY = process.env.REACT_APP_LOCALHOST_KEY || "chat-app-current-user";

  // Session expiry handler triggered by apiClient 401 refresh failure
  const handleSessionExpired = useCallback(() => {
    clearAuthTokens();
    setUser(null);
    localStorage.removeItem(LOCALHOST_KEY);
    setError("Your session has expired. Please log in again.");
  }, [LOCALHOST_KEY]);

  useEffect(() => {
    setSessionExpiredHandler(handleSessionExpired);
  }, [handleSessionExpired]);

  // Initial silent auth check on mount
  useEffect(() => {
    let isMounted = true;

    async function initializeSession() {
      try {
        // 1. Fetch CSRF token for future mutating requests
        await fetchCsrfToken();

        // 2. Attempt silent refresh via partitioned HttpOnly refresh cookie
        const currentCsrf = getCsrfToken();
        const headers = { "Content-Type": "application/json" };
        if (currentCsrf) {
          headers["X-CSRF-Token"] = currentCsrf;
        }

        const refreshRes = await axios.post(
          v1RefreshRoute,
          {},
          {
            withCredentials: true,
            headers,
          }
        );

        if (refreshRes.data && refreshRes.data.accessToken) {
          setAccessToken(refreshRes.data.accessToken);
          if (refreshRes.data.csrfToken) {
            setCsrfToken(refreshRes.data.csrfToken);
          }

          // 3. Fetch authenticated user profile
          const meRes = await apiClient.get(v1MeRoute);
          if (isMounted && meRes.data && meRes.data.user) {
            const normalized = {
              ...meRes.data.user,
              _id: meRes.data.user._id || meRes.data.user.id,
              id: meRes.data.user.id || meRes.data.user._id,
              accessToken: refreshRes.data.accessToken,
            };
            setUser(normalized);
            localStorage.setItem(LOCALHOST_KEY, JSON.stringify(normalized));
          }
        }
      } catch (_) {
        // No active session or refresh expired: clear tokens cleanly
        clearAuthTokens();
        if (isMounted) {
          // If stored user exists in local dev, preserve non-sensitive profile but clear stale tokens
          const existing = localStorage.getItem(LOCALHOST_KEY);
          if (existing) {
            try {
              const parsed = JSON.parse(existing);
              setUser(parsed);
            } catch (_) {
              setUser(null);
            }
          } else {
            setUser(null);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initializeSession();

    return () => {
      isMounted = false;
    };
  }, [LOCALHOST_KEY]);

  // Login action
  const login = async (username, password) => {
    setError(null);
    try {
      const res = await apiClient.post(v1LoginRoute, { username, password });
      const { accessToken, csrfToken, user: authUser } = res.data;

      if (accessToken) setAccessToken(accessToken);
      if (csrfToken) setCsrfToken(csrfToken);

      const normalized = {
        ...authUser,
        _id: authUser._id || authUser.id,
        id: authUser.id || authUser._id,
        accessToken,
      };

      setUser(normalized);
      localStorage.setItem(LOCALHOST_KEY, JSON.stringify(normalized));

      return { success: true, user: normalized };
    } catch (err) {
      const message = err.message || "Login failed. Please check your credentials.";
      setError(message);
      throw err;
    }
  };

  // Register action
  const register = async (username, email, password, otpVerificationToken = null) => {
    setError(null);
    try {
      const payload = { username, email, password };
      if (otpVerificationToken) {
        payload.otpVerificationToken = otpVerificationToken;
      }
      const res = await apiClient.post(v1RegisterRoute, payload);
      const { accessToken, csrfToken, user: authUser } = res.data;

      if (accessToken) setAccessToken(accessToken);
      if (csrfToken) setCsrfToken(csrfToken);

      const normalized = {
        ...authUser,
        _id: authUser._id || authUser.id,
        id: authUser.id || authUser._id,
        accessToken,
      };

      setUser(normalized);
      localStorage.setItem(LOCALHOST_KEY, JSON.stringify(normalized));

      return { success: true, user: normalized };
    } catch (err) {
      const message = err.message || "Registration failed. Please try again.";
      setError(message);
      throw err;
    }
  };

  // Logout action (current device / session family)
  const logout = async () => {
    try {
      await apiClient.post(v1LogoutRoute);
    } catch (_) {
      // Proceed with local cleanup regardless of network status
    } finally {
      clearAuthTokens();
      setUser(null);
      localStorage.removeItem(LOCALHOST_KEY);
    }
  };

  // Logout all sessions across all devices
  const logoutAll = async () => {
    try {
      await apiClient.post(v1LogoutAllRoute);
    } catch (_) {
      // Proceed with local cleanup
    } finally {
      clearAuthTokens();
      setUser(null);
      localStorage.removeItem(LOCALHOST_KEY);
    }
  };

  // Update user profile in state & localStorage
  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem(LOCALHOST_KEY, JSON.stringify(updatedUser));
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    logoutAll,
    updateUser,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}

export default AuthContext;
