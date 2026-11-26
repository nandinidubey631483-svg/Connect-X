/**
 * ConnectX Token Manager Unit Tests
 * Verifies strict in-memory storage invariants.
 */
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getCsrfToken,
  setCsrfToken,
  clearCsrfToken,
  clearAuthTokens,
} from "../tokenManager";

describe("ConnectX In-Memory Token Manager", () => {
  beforeEach(() => {
    clearAuthTokens();
    localStorage.clear();
    sessionStorage.clear();
  });

  test("stores and retrieves access token in memory", () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken("test_access_token_123");
    expect(getAccessToken()).toBe("test_access_token_123");
  });

  test("clears access token from memory", () => {
    setAccessToken("temp_token");
    expect(getAccessToken()).toBe("temp_token");
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  test("stores and retrieves CSRF token in memory", () => {
    expect(getCsrfToken()).toBeNull();
    setCsrfToken("csrf_token_xyz");
    expect(getCsrfToken()).toBe("csrf_token_xyz");
  });

  test("clears CSRF token from memory", () => {
    setCsrfToken("csrf_temp");
    clearCsrfToken();
    expect(getCsrfToken()).toBeNull();
  });

  test("clearAuthTokens resets both access and CSRF tokens", () => {
    setAccessToken("jwt_token");
    setCsrfToken("csrf_token");
    clearAuthTokens();
    expect(getAccessToken()).toBeNull();
    expect(getCsrfToken()).toBeNull();
  });

  test("CRITICAL SECURITY INVARIANT: never stores tokens in localStorage or sessionStorage", () => {
    setAccessToken("super_secret_jwt_token");
    setCsrfToken("super_secret_csrf_token");

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("csrfToken")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("csrfToken")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
