/**
 * ConnectX API Client & Interceptor Engine Tests
 * Tests in-memory Bearer token injection, CSRF injection, and concurrency-safe 401 refresh queue.
 */
import axios from "axios";
import apiClient, {
  setSessionExpiredHandler,
  resetInterceptorState,
} from "../apiClient";
import {
  setAccessToken,
  setCsrfToken,
  clearAuthTokens,
  getAccessToken,
} from "../tokenManager";

jest.mock("axios", () => {
  const instance = jest.fn((config) => instance.request(config));
  instance.interceptors = {
    request: {
      use: jest.fn((fulfilled, rejected) => {
        instance.interceptors.request.handlers.push({ fulfilled, rejected });
      }),
      handlers: [],
    },
    response: {
      use: jest.fn((fulfilled, rejected) => {
        instance.interceptors.response.handlers.push({ fulfilled, rejected });
      }),
      handlers: [],
    },
  };
  instance.defaults = { headers: { common: {} } };
  instance.get = jest.fn();
  instance.post = jest.fn();
  instance.put = jest.fn();
  instance.delete = jest.fn();
  instance.request = jest.fn();

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

describe("ConnectX API Client & Interceptor Engine", () => {
  let requestInterceptor;
  let responseInterceptor;

  beforeEach(() => {
    clearAuthTokens();
    resetInterceptorState();
    jest.clearAllMocks();

    requestInterceptor = apiClient.interceptors.request.handlers[0];
    responseInterceptor = apiClient.interceptors.response.handlers[0];
  });

  describe("Request Interceptor", () => {
    test("injects Authorization Bearer header when access token is present", () => {
      setAccessToken("test_access_token");
      const config = { headers: {} };
      const modifiedConfig = requestInterceptor.fulfilled(config);

      expect(modifiedConfig.headers["Authorization"]).toBe("Bearer test_access_token");
    });

    test("does not inject Authorization header when access token is null", () => {
      const config = { headers: {} };
      const modifiedConfig = requestInterceptor.fulfilled(config);

      expect(modifiedConfig.headers["Authorization"]).toBeUndefined();
    });

    test("injects X-CSRF-Token header on mutating requests (POST, PUT, DELETE, PATCH)", () => {
      setCsrfToken("test_csrf_token");

      ["post", "put", "patch", "delete"].forEach((method) => {
        const config = { method, headers: {} };
        const modified = requestInterceptor.fulfilled(config);
        expect(modified.headers["X-CSRF-Token"]).toBe("test_csrf_token");
      });
    });

    test("does not inject X-CSRF-Token header on safe GET requests", () => {
      setCsrfToken("test_csrf_token");
      const config = { method: "get", headers: {} };
      const modified = requestInterceptor.fulfilled(config);

      expect(modified.headers["X-CSRF-Token"]).toBeUndefined();
    });
  });

  describe("Response Interceptor & Concurrency-Safe Refresh Queue", () => {
    test("passes successful 2xx responses through unmodified", () => {
      const response = { status: 200, data: { success: true } };
      expect(responseInterceptor.fulfilled(response)).toBe(response);
    });

    test("normalizes non-401 errors into Error objects", async () => {
      const error = {
        response: {
          status: 404,
          data: { error: { message: "Resource not found" } },
        },
      };

      await expect(responseInterceptor.rejected(error)).rejects.toThrow("Resource not found");
    });

    test("infinite loop guard: does not attempt refresh if 401 occurred on auth endpoint", async () => {
      const error = {
        config: { url: "/api/v1/auth/refresh", _retry: false },
        response: { status: 401, data: { msg: "Invalid session" } },
      };

      await expect(responseInterceptor.rejected(error)).rejects.toThrow();
      expect(axios.post).not.toHaveBeenCalled();
    });

    test("single 401 triggers refresh, updates token, and retries original request", async () => {
      setAccessToken("old_expired_token");
      axios.post.mockResolvedValueOnce({
        data: {
          accessToken: "new_refreshed_token",
          csrfToken: "new_csrf_token",
        },
      });

      const originalRequest = {
        url: "/api/v1/conversations",
        method: "get",
        headers: { Authorization: "Bearer old_expired_token" },
      };

      const error = {
        config: originalRequest,
        response: { status: 401 },
      };

      apiClient.request.mockResolvedValueOnce({ status: 200, data: ["conv1"] });

      const result = await responseInterceptor.rejected(error);

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(getAccessToken()).toBe("new_refreshed_token");
      expect(result.data).toEqual(["conv1"]);
    });

    test("concurrency handling: multiple simultaneous 401s queue behind single refresh and all retry", async () => {
      setAccessToken("stale_token");

      let resolveRefresh;
      axios.post.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          })
      );

      apiClient.request.mockResolvedValue({ status: 200, data: "ok" });

      const req1 = { url: "/api/v1/users", method: "get", headers: {} };
      const req2 = { url: "/api/v1/messages", method: "get", headers: {} };
      const req3 = { url: "/api/v1/notifications", method: "get", headers: {} };

      // Dispatch 3 concurrent 401 failures
      const p1 = responseInterceptor.rejected({ config: req1, response: { status: 401 } });
      const p2 = responseInterceptor.rejected({ config: req2, response: { status: 401 } });
      const p3 = responseInterceptor.rejected({ config: req3, response: { status: 401 } });

      // Verify only ONE refresh POST was issued!
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Now resolve the single refresh
      resolveRefresh({
        data: {
          accessToken: "concurrent_winner_token",
          csrfToken: "concurrent_csrf",
        },
      });

      // All 3 queued promises should receive the new token
      await Promise.all([p1, p2, p3]);

      expect(getAccessToken()).toBe("concurrent_winner_token");
      expect(req1.headers["Authorization"]).toBe("Bearer concurrent_winner_token");
      expect(req2.headers["Authorization"]).toBe("Bearer concurrent_winner_token");
      expect(req3.headers["Authorization"]).toBe("Bearer concurrent_winner_token");
    });

    test("refresh failure drains queued requests, clears tokens, and triggers sessionExpiredHandler", async () => {
      setAccessToken("token_to_fail");
      axios.post.mockRejectedValueOnce(new Error("Refresh token revoked"));

      const sessionExpiredMock = jest.fn();
      setSessionExpiredHandler(sessionExpiredMock);

      const req1 = { url: "/api/v1/users", method: "get", headers: {} };
      const req2 = { url: "/api/v1/messages", method: "get", headers: {} };

      const p1 = responseInterceptor.rejected({ config: req1, response: { status: 401 } });
      const p2 = responseInterceptor.rejected({ config: req2, response: { status: 401 } });

      await expect(p1).rejects.toThrow("Session expired. Please log in again.");
      await expect(p2).rejects.toThrow("Session expired. Please log in again.");

      expect(getAccessToken()).toBeNull();
      expect(sessionExpiredMock).toHaveBeenCalledTimes(1);
    });
  });
});
