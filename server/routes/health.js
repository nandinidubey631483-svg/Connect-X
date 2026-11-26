/**
 * ConnectX System Health Route
 * Provides system status, uptime, and database connectivity state.
 */
const express = require("express");
const router = express.Router();
const { isDatabaseConnected } = require("../config/database");
const { sendSuccess } = require("../utils/apiResponse");

router.get("/", (req, res) => {
  const dbConnected = isDatabaseConnected();
  const uptime = process.uptime();

  return sendSuccess(res, {
    status: dbConnected ? "healthy" : "degraded",
    uptimeSeconds: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    services: {
      database: dbConnected ? "connected" : "disconnected",
      api: "operational",
    },
  });
});

module.exports = router;
