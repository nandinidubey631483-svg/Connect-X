/**
 * ConnectX 404 Not Found Middleware
 */
const AppError = require("../utils/appError");

function notFoundHandler(req, res, next) {
  next(new AppError(`Cannot ${req.method} ${req.originalUrl} on this server`, 404, "ROUTE_NOT_FOUND"));
}

module.exports = notFoundHandler;
