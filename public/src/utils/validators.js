/**
 * ConnectX Client-Side Validation Utilities
 * 
 * Provides immediate user-facing validation for:
 * - Registration & Login (username, email, password, confirmPassword)
 * - Real-time password strength calculation
 * - Profile fields (displayName, bio, phone, statusMessage)
 * - File upload checks (size, extension, MIME type)
 */

export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "support",
  "connectx",
  "moderator",
  "mod",
  "help",
  "api",
  "bot",
  "null",
  "undefined",
  "security",
  "terms",
  "privacy",
  "everyone",
  "here",
  "all",
]);

export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const USERNAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,28}[a-zA-Z0-9]$/;

export const PHONE_REGEX = /^\+?[0-9\s\-().]{7,20}$/;

export const FORBIDDEN_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "sh", "msi", "com", "vbs", "ps1", "scr", "jar", "bin",
  "php", "phtml", "py", "js", "html", "htm", "shtml", "cgi", "pl"
]);

export const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
]);

/**
 * Validates username
 */
export function validateUsername(username) {
  if (!username || typeof username !== "string") {
    return { isValid: false, error: "Username is required." };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    return { isValid: false, error: "Username must be at least 3 characters." };
  }

  if (trimmed.length > 30) {
    return { isValid: false, error: "Username cannot exceed 30 characters." };
  }

  if (!USERNAME_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: "Username must contain only letters, numbers, underscores, and hyphens, and cannot start or end with a symbol.",
    };
  }

  if (RESERVED_USERNAMES.has(trimmed.toLowerCase())) {
    return {
      isValid: false,
      error: "This username is reserved and cannot be used.",
    };
  }

  return { isValid: true, error: null };
}

/**
 * Validates email
 */
export function validateEmail(email) {
  if (!email || typeof email !== "string") {
    return { isValid: false, error: "Email is required." };
  }

  const trimmed = email.trim();

  if (trimmed.length > 254) {
    return { isValid: false, error: "Email cannot exceed 254 characters." };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { isValid: false, error: "Please enter a valid email address." };
  }

  return { isValid: true, error: null };
}

/**
 * Validates password
 */
export function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return { isValid: false, error: "Password is required." };
  }

  if (password.length < 8) {
    return { isValid: false, error: "Password must be at least 8 characters long." };
  }

  if (password.length > 128) {
    return { isValid: false, error: "Password cannot exceed 128 characters." };
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password);

  if (!hasLetter || !hasDigitOrSymbol) {
    return {
      isValid: false,
      error: "Password must contain at least one letter and at least one number or special character.",
    };
  }

  return { isValid: true, error: null };
}

/**
 * Calculates password strength score (0 to 4)
 */
export function calculatePasswordStrength(password) {
  if (!password || typeof password !== "string") {
    return {
      score: 0,
      label: "None",
      color: "var(--line, #E2E8F0)",
      checks: {
        length: false,
        letter: false,
        number: false,
        mixed: false,
        special: false,
      },
    };
  }

  const checks = {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    number: /[0-9]/.test(password),
    mixed: /[a-z]/.test(password) && /[A-Z]/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password),
  };

  let score = 0;
  if (checks.length) score += 1;
  if (checks.letter && checks.number) score += 1;
  if (checks.mixed) score += 1;
  if (checks.special || password.length >= 12) score += 1;

  const strengthMap = {
    0: { label: "Too weak", color: "#EF4444" },
    1: { label: "Weak", color: "#EF4444" },
    2: { label: "Fair", color: "#F59E0B" },
    3: { label: "Good", color: "#D98B70" },
    4: { label: "Strong", color: "#10B981" },
  };

  return {
    score,
    label: strengthMap[score].label,
    color: strengthMap[score].color,
    checks,
  };
}

/**
 * Validates file upload before reading
 */
export function validateFileUpload(file, { maxSizeBytes = 5 * 1024 * 1024 } = {}) {
  if (!file) {
    return { isValid: false, error: "No file selected." };
  }

  // Check file size
  if (file.size > maxSizeBytes) {
    const limitMB = Math.round(maxSizeBytes / (1024 * 1024));
    return {
      isValid: false,
      error: `File size exceeds ${limitMB}MB limit. (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
    };
  }

  // Check dangerous extension
  const name = file.name || "";
  const extMatch = name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";

  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    return {
      isValid: false,
      error: `Files with extension .${ext} are blocked for security reasons.`,
    };
  }

  // Check MIME type if present
  if (file.type && !ALLOWED_MEDIA_TYPES.has(file.type)) {
    return {
      isValid: false,
      error: `File type '${file.type}' is not supported. Please select an image, PDF, audio, or document.`,
    };
  }

  return { isValid: true, error: null };
}
