const mongoose = require("mongoose");

const captchaSchema = new mongoose.Schema(
  {
    captchaId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    solution: {
      type: String,
      required: true,
    },
    consumed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: "10m" },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Captcha", captchaSchema);
