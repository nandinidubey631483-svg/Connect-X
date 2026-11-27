/**
 * ConnectX Centralized API Client with Concurrency-Safe Refresh Interceptor
 * 
 * Features:
 * - withCredentials: true ensures HttpOnly refresh cookies are sent automatically.
 * - In-memory access token injection in Authorization header.
 * - In-memory CSRF token injection in X-CSRF-Token header on mutating requests.
 * - Single-refresh mutex with request queue for concurrent 401 responses.
 * - Infinite loop guard preventing refresh on auth lifecycle endpoints.
 * - Automatic session expiry handling.
 */
import axios from "axios";
import {
  getAccessToken,
  setAccessToken,
  getCsrfToken,
  setCsrfToken,
  clearAuthTokens,
} from "./tokenManager";
import { v1RefreshRoute, v1CsrfRoute } from "./apiRoutes";

const defaultApiHost =
  typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:5000"
    : (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost:5000");

const baseURL = process.env.REACT_APP_API_URL || defaultApiHost;

const apiClient = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Mutex & Queue for concurrent 401 refresh handling
let isRefreshing = false;
let failedQueue = [];
let sessionExpiredHandler = null;

export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = handler;
}

export function resetInterceptorState() {
  isRefreshing = false;
  failedQueue = [];
}

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * State-mutating HTTP methods requiring CSRF verification
 */
const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

/**
 * Fetches and stores a fresh CSRF token from the server
 */
export async function fetchCsrfToken() {
  try {
    const response = await axios.get(v1CsrfRoute, {
      baseURL,
      withCredentials: true,
    });
    if (response.data && response.data.csrfToken) {
      setCsrfToken(response.data.csrfToken);
      return response.data.csrfToken;
    }
  } catch (err) {
    console.error("Failed to fetch CSRF token:", err);
  }
  return null;
}

// Request Interceptor: Injects Bearer token and CSRF header
apiClient.interceptors.request.use(
  (config) => {
    // 1. Inject in-memory access token (hydrating from localStorage if needed)
    let token = getAccessToken();
    if (!token && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(process.env.REACT_APP_LOCALHOST_KEY || "chat-app-current-user");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.accessToken) {
            token = parsed.accessToken;
            setAccessToken(token);
          }
        }
      } catch (_) {}
    }
    if (token) {
      config.headers = config.headers || {};
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    // 2. Inject in-memory CSRF token for mutating requests
    const method = (config.method || "").toLowerCase();
    if (MUTATING_METHODS.has(method)) {
      const csrf = getCsrfToken();
      if (csrf) {
        config.headers = config.headers || {};
        config.headers["X-CSRF-Token"] = csrf;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Automatic single-refresh queue for 401s
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is not a 401, normalize message and reject
    if (!error.response || error.response.status !== 401 || !originalRequest) {
      let customMessage = "Network error. Please verify your connection.";
      if (error.response && error.response.data) {
        customMessage = error.response.data.error?.message || error.response.data.msg || customMessage;
      }
      return Promise.reject(new Error(customMessage));
    }

    const requestUrl = originalRequest.url || "";

    // Infinite loop guard: Do not attempt refresh if the failed request was an auth route
    const isAuthRoute =
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/csrf-token");

    if (isAuthRoute || originalRequest._retry) {
      let customMessage = "Authentication failed.";
      if (error.response && error.response.data) {
        customMessage = error.response.data.error?.message || error.response.data.msg || customMessage;
      }
      return Promise.reject(new Error(customMessage));
    }

    // If a refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((newToken) => {
          originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
          const currentCsrf = getCsrfToken();
          if (currentCsrf && MUTATING_METHODS.has((originalRequest.method || "").toLowerCase())) {
            originalRequest.headers["X-CSRF-Token"] = currentCsrf;
          }
          return apiClient(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    // First 401 encountered: mark retry and initiate single refresh
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const currentCsrf = getCsrfToken();
      const headers = { "Content-Type": "application/json" };
      if (currentCsrf) {
        headers["X-CSRF-Token"] = currentCsrf;
      }

      // Execute refresh via bare un-intercepted axios call
      const refreshResponse = await axios.post(
        v1RefreshRoute,
        {},
        {
          baseURL,
          withCredentials: true,
          headers,
        }
      );

      const { accessToken: newAccessToken, csrfToken: newCsrfToken } = refreshResponse.data || {};

      if (!newAccessToken) {
        throw new Error("No access token returned from refresh endpoint");
      }

      // Update in-memory tokens
      setAccessToken(newAccessToken);
      if (newCsrfToken) {
        setCsrfToken(newCsrfToken);
      }

      // Update default authorization header
      apiClient.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;

      // Notify all queued subscribers
      processQueue(null, newAccessToken);

      // Retry the original request
      originalRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
      if (newCsrfToken && MUTATING_METHODS.has((originalRequest.method || "").toLowerCase())) {
        originalRequest.headers["X-CSRF-Token"] = newCsrfToken;
      }

      return apiClient.request ? apiClient.request(originalRequest) : apiClient(originalRequest);
    } catch (refreshErr) {
      // Refresh failed (e.g. refresh token expired, reused, or revoked)
      const normalizedError = new Error("Session expired. Please log in again.");
      clearAuthTokens();
      processQueue(normalizedError, null);

      if (typeof sessionExpiredHandler === "function") {
        sessionExpiredHandler();
      }

      return Promise.reject(normalizedError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
