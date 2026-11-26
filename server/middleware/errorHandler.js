/**
 * ConnectX Centralized Error Handler Middleware
 * Catches all operational and unexpected errors, returning standard JSON.
 */
const AppError = require("../utils/appError");
const config = require("../config/env");

function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "An unexpected error occurred.";
  let code = err.code || "INTERNAL_SERVER_ERROR";
  let details = err.details || null;

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_IDENTIFIER";
    message = `Resource not found with id: ${err.value}`;
  }

  // Handle Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    statusCode = 409;
    code = "DUPLICATE_KEY_ERROR";
    const field = Object.keys(err.keyValue || {})[0];
    message = `${field || "Field"} already exists.`;
  }

  // Handle Mongoose ValidationError
  if (err.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    details = Object.values(err.errors).map((val) => val.message);
    message = "Request validation failed.";
  }

  const response = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details) response.error.details = details;

  // Never leak internal stack traces in production
  if (!config.isProduction && err.stack) {
    response.error.stack = err.stack;
  }

  return res.status(statusCode).json(response);
}

module.exports = errorHandler;
