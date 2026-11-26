/**
 * ConnectX Production Cookie Topology Handler
 * 
 * Supports 3 Topologies:
 * 1. "same-origin" (Option B: Reverse Proxy / BFF) -> SameSite: "Strict", Secure: isProduction, Path: "/api/v1/auth"
 * 2. "same-site"   (Option A: Custom Subdomain)    -> SameSite: "Lax", Secure: isProduction, Path: "/api/v1/auth", Domain: cookieDomain
 * 3. "cross-site"  (Fallback / Staging)           -> SameSite: "None", Secure: true (mandatory), Partitioned: true, Path: "/api/v1/auth"
 */
const config = require("../config/env");

const REFRESH_TOKEN_COOKIE = "connectx_rt";
const CSRF_TOKEN_COOKIE = "connectx_csrf";
const DEFAULT_AUTH_PATH = "/api/v1/auth";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Resolves standard cookie options based on configured deployment topology.
 */
function getCookieOptions({
  topology = null,
  isProduction = null,
  maxAge = SEVEN_DAYS_MS,
  path = DEFAULT_AUTH_PATH,
  domain = null,
} = {}) {
  const activeTopology = topology || config.cookieTopology || (config.isProduction ? "same-site" : "same-origin");
  const prod = isProduction !== null ? isProduction : config.isProduction;

  let sameSite = "Strict";
  let secure = prod;
  let partitioned = false;

  if (activeTopology === "same-site") {
    sameSite = "Lax";
    secure = prod;
  } else if (activeTopology === "cross-site" || config.crossSiteCookies) {
    sameSite = "None";
    secure = true; // Browsers require Secure: true for SameSite: None
    partitioned = true; // Chromium Partitioned (CHIPS) support
  } else {
    // "same-origin"
    sameSite = "Strict";
    secure = prod;
  }

  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path,
  };

  if (maxAge !== undefined && maxAge !== null) {
    options.maxAge = maxAge;
  }

  const resolvedDomain = domain || config.cookieDomain;
  if (resolvedDomain) {
    options.domain = resolvedDomain;
  }

  if (partitioned) {
    options.partitioned = true;
  }

  return options;
}

/**
 * Safely parses cookie header string into an object dictionary without throwing exceptions.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return cookies;
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;

    const key = pair.slice(0, idx).trim();
    let val = pair.slice(idx + 1).trim();

    if (!key) continue;

    // Remove quotes if present
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }

    try {
      cookies[key] = decodeURIComponent(val);
    } catch (_) {
      cookies[key] = val; // Fallback to raw value on decode failure
    }
  }

  return cookies;
}

/**
 * Express middleware populating req.cookies from raw req.headers.cookie.
 */
function cookieMiddleware(req, res, next) {
  if (!req.cookies) {
    req.cookies = parseCookies(req.headers.cookie);
  }
  next();
}

/**
 * Sets standard authentication cookies on the outgoing response.
 */
function setAuthCookies(res, { refreshToken = null, csrfSignedCookie = null, topology = null } = {}) {
  const rtOptions = getCookieOptions({ topology, maxAge: SEVEN_DAYS_MS, path: DEFAULT_AUTH_PATH });
  if (refreshToken) {
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, rtOptions);
  }

  // CSRF cookie is scoped to root path so all API routes can transmit it
  const csrfOptions = getCookieOptions({ topology, maxAge: SEVEN_DAYS_MS, path: "/" });
  if (csrfSignedCookie) {
    res.cookie(CSRF_TOKEN_COOKIE, csrfSignedCookie, csrfOptions);
  }
}

/**
 * Clears authentication cookies with identical topology attributes on logout.
 */
function clearAuthCookies(res, { topology = null } = {}) {
  const rtOptions = getCookieOptions({ topology, maxAge: 0, path: DEFAULT_AUTH_PATH });
  delete rtOptions.maxAge;
  res.clearCookie(REFRESH_TOKEN_COOKIE, rtOptions);

  const csrfOptions = getCookieOptions({ topology, maxAge: 0, path: "/" });
  delete csrfOptions.maxAge;
  res.clearCookie(CSRF_TOKEN_COOKIE, csrfOptions);
}

module.exports = {
  REFRESH_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
  DEFAULT_AUTH_PATH,
  SEVEN_DAYS_MS,
  getCookieOptions,
  parseCookies,
  cookieMiddleware,
  setAuthCookies,
  clearAuthCookies,
};
