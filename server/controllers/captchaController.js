const crypto = require("crypto");
const Captcha = require("../models/captchaModel");
const AppError = require("../utils/appError");

const CAPTCHA_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateRandomCode(length = 5) {
  let result = "";
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, CAPTCHA_CHARS.length);
    result += CAPTCHA_CHARS[idx];
  }
  return result;
}

function generateCaptchaSvg(code) {
  const width = 200;
  const height = 70;
  
  // Random noise lines
  let lines = "";
  for (let i = 0; i < 4; i++) {
    const x1 = crypto.randomInt(5, 50);
    const y1 = crypto.randomInt(10, 60);
    const x2 = crypto.randomInt(150, 195);
    const y2 = crypto.randomInt(10, 60);
    const stroke = ["#6366f1", "#a855f7", "#ec4899", "#3b82f6"][crypto.randomInt(0, 4)];
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${crypto.randomInt(1, 3)}" stroke-opacity="0.6"/>`;
  }

  // Random noise dots
  let dots = "";
  for (let i = 0; i < 20; i++) {
    const cx = crypto.randomInt(5, 195);
    const cy = crypto.randomInt(5, 65);
    const r = crypto.randomInt(1, 3);
    dots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#94a3b8" opacity="0.4"/>`;
  }

  // Distorted characters
  let chars = "";
  const charSpacing = 32;
  const startX = 28;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const x = startX + i * charSpacing + crypto.randomInt(-3, 4);
    const y = 46 + crypto.randomInt(-4, 5);
    const rotate = crypto.randomInt(-18, 19);
    const fill = ["#1e293b", "#334155", "#0f172a", "#3730a3"][crypto.randomInt(0, 4)];
    chars += `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-weight="bold" font-size="28" fill="${fill}" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color: #f1f5f9; border-radius: 8px;">
    ${lines}
    ${dots}
    ${chars}
  </svg>`;

  return svg;
}

/**
 * Generate a new CAPTCHA challenge
 */
async function generateCaptcha(req, res, next) {
  try {
    const captchaId = `cpt_${crypto.randomBytes(16).toString("hex")}`;
    const code = generateRandomCode(5);
    const svg = generateCaptchaSvg(code);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL
    await Captcha.create({
      captchaId,
      solution: code,
      consumed: false,
      expiresAt,
    });

    const isDev = process.env.NODE_ENV !== "production";

    return res.status(200).json({
      success: true,
      captchaId,
      svg,
      // For canvas rendering directly on client
      code: isDev ? code : undefined,
      expiresIn: 300,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Verify a CAPTCHA challenge
 */
async function verifyCaptcha(req, res, next) {
  try {
    const { captchaId, solution } = req.body || {};

    if (!captchaId || !solution) {
      return next(new AppError("Captcha ID and solution are required.", 400, "CAPTCHA_REQUIRED"));
    }

    const captcha = await Captcha.findOne({ captchaId });

    if (!captcha) {
      return next(new AppError("Captcha challenge not found or expired. Please refresh.", 400, "CAPTCHA_NOT_FOUND"));
    }

    if (captcha.consumed) {
      return next(new AppError("Captcha has already been used. Please refresh.", 400, "CAPTCHA_ALREADY_USED"));
    }

    if (new Date() > captcha.expiresAt) {
      return next(new AppError("Captcha expired. Please refresh.", 400, "CAPTCHA_EXPIRED"));
    }

    if (captcha.solution.toUpperCase() !== solution.trim().toUpperCase()) {
      return next(new AppError("Incorrect captcha characters. Please try again.", 400, "CAPTCHA_MISMATCH"));
    }

    captcha.consumed = true;
    await captcha.save();

    const verifiedToken = `cap_ok_${crypto.randomBytes(16).toString("hex")}`;

    return res.status(200).json({
      success: true,
      message: "Captcha verified successfully.",
      verifiedToken,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generateCaptcha,
  verifyCaptcha,
};
