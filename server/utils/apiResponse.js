/**
 * ConnectX Standard API Response Utilities
 * Enforces uniform envelopes across all REST endpoints.
 */
function sendSuccess(res, data = {}, statusCode = 200, message = null) {
  const response = {
    success: true,
    data,
  };
  if (message) response.message = message;
  return res.status(statusCode).json(response);
}

function sendError(res, message, statusCode = 500, code = "INTERNAL_ERROR", details = null) {
  const response = {
    success: false,
    error: {
      code,
      message,
    },
  };
  if (details) response.error.details = details;
  return res.status(statusCode).json(response);
}

module.exports = {
  sendSuccess,
  sendError,
};
