/**
 * ConnectX Express Application Setup
 * Decouples Express application routing and middleware from server listen lifecycle.
 */
const express = require("express");
const cors = require("cors");
const config = require("./config/env");
const requestLogger = require("./middleware/requestLogger");
const notFoundHandler = require("./middleware/notFoundHandler");
const errorHandler = require("./middleware/errorHandler");

// Import Route Handlers
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const authV1Routes = require("./routes/authV1");
const profileV1Routes = require("./routes/profileV1");
const settingsV1Routes = require("./routes/settingsV1");
const contactsV1Routes = require("./routes/contactsV1");
const conversationsV1Routes = require("./routes/conversationsV1");
const messagesV1Routes = require("./routes/messagesV1");
const notificationsV1Routes = require("./routes/notificationsV1");
const messageRoutes = require("./routes/messages");

const app = express();

// Trust Proxy Configuration for Accurate IP Governance
if (config.trustProxy !== undefined) {
  app.set("trust proxy", config.trustProxy);
}

// Security & Parsing Middleware
const { cookieMiddleware } = require("./middleware/cookieConfig");
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
  exposedHeaders: ["Content-Disposition"],
}));
app.use(cookieMiddleware);
app.use(express.json());

// Development Request Logger
if (!config.isProduction) {
  app.use(requestLogger);
}

// Legacy Ping Endpoint (Preserved for backward compatibility)
app.get("/ping", (_req, res) => {
  return res.json({ msg: "Ping Successful" });
});

// System Health Endpoints
app.use("/health", healthRoutes);
app.use("/api/v1/health", healthRoutes);

// Application Domain Routes
app.use("/api/auth", authRoutes);
app.use("/api/v1/auth", authV1Routes);
app.use("/api/v1/profile", profileV1Routes);
app.use("/api/v1/settings", settingsV1Routes);
app.use("/api/v1/contacts", contactsV1Routes);
app.use("/api/v1/conversations", conversationsV1Routes);
app.use("/api/v1/messages", messagesV1Routes);
app.use("/api/v1/notifications", notificationsV1Routes);
app.use("/api/messages", messageRoutes);

// Catch-all 404 & Centralized Error Handler
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
