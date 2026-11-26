/**
 * ConnectX In-Memory Token Manager
 * 
 * Strict Security Invariants:
 * 1. Access tokens are stored ONLY in closure memory (never in localStorage or sessionStorage).
 * 2. Refresh tokens are never handled in JavaScript (held in HttpOnly partitioned cookies).
 * 3. CSRF tokens are maintained in memory and transmitted via the X-CSRF-Token header.
 */

let inMemoryAccessToken = null;
let inMemoryCsrfToken = null;

/**
 * Returns current access token from memory.
 */
export function getAccessToken() {
  return inMemoryAccessToken;
}

/**
 * Sets access token in memory.
 */
export function setAccessToken(token) {
  inMemoryAccessToken = token ? String(token) : null;
}

/**
 * Clears in-memory access token.
 */
export function clearAccessToken() {
  inMemoryAccessToken = null;
}

/**
 * Returns current CSRF token from memory.
 */
export function getCsrfToken() {
  return inMemoryCsrfToken;
}

/**
 * Sets CSRF token in memory.
 */
export function setCsrfToken(token) {
  inMemoryCsrfToken = token ? String(token) : null;
}

/**
 * Clears in-memory CSRF token.
 */
export function clearCsrfToken() {
  inMemoryCsrfToken = null;
}

/**
 * Resets all authentication and CSRF tokens from memory.
 */
export function clearAuthTokens() {
  inMemoryAccessToken = null;
  inMemoryCsrfToken = null;
}

const tokenManager = {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getCsrfToken,
  setCsrfToken,
  clearCsrfToken,
  clearAuthTokens,
};

export default tokenManager;
