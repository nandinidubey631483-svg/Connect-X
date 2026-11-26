const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true, // e.g. "auth_fencing_sequence"
    },
    seq: {
      type: Number,
      default: 0,
      required: true,
    },
  },
  {
    timestamps: true,
    _id: false,
  }
);

module.exports =
  mongoose.models.Counter || mongoose.model("Counter", counterSchema);
