const { error } = require("../utils/apiResponse");
const logger    = require("../utils/logger");

// ─── Custom Application Error ─────────────────────────────────────────────────

class AppError extends Error {
  /**
   * @param {string} message   Human-readable description
   * @param {number} statusCode HTTP status (default 400)
   * @param {string} code       Machine-readable error code
   */
  constructor(message, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.name       = "AppError";
    this.statusCode = statusCode;
    this.code       = code;
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Known operational errors — safe to surface details to client
  if (err instanceof AppError) {
    return error(res, {
      message:    err.message,
      statusCode: err.statusCode,
      code:       err.code,
    });
  }

  // Postgres unique-constraint violation (code 23505)
  if (err.code === "23505") {
    const detail = err.detail || "";
    const field  = detail.match(/\(([^)]+)\)/)?.[1] || "field";
    return error(res, {
      message:    `A record with this ${field} already exists`,
      statusCode: 409,
      code:       "CONFLICT",
    });
  }

  // express-validator — body validation errors arrive as arrays
  if (Array.isArray(err)) {
    return error(res, {
      message:    "Validation failed",
      statusCode: 422,
      code:       "VALIDATION_ERROR",
      errors:     err,
    });
  }

  // Unhandled / programming errors — log in full, hide internals from client
  logger.error("Unhandled server error", {
    message: err.message,
    stack:   err.stack,
    path:    req.path,
    method:  req.method,
  });

  return error(res, {
    message:    "An unexpected error occurred",
    statusCode: 500,
    code:       "INTERNAL_ERROR",
  });
};

// 404 handler — place before errorHandler in app.js
const notFound = (req, res) =>
  error(res, {
    message:    `Route ${req.method} ${req.path} not found`,
    statusCode: 404,
    code:       "NOT_FOUND",
  });

module.exports = { errorHandler, notFound, AppError };
