const { verifyAccessToken } = require("../utils/jwt");
const { error }             = require("../utils/apiResponse");
const logger                = require("../utils/logger");

/**
 * Require a valid Bearer access token.
 * On success sets req.user = { id, email }.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return error(res, {
      message: "Authentication required. Provide a Bearer token.",
      statusCode: 401,
      code: "MISSING_TOKEN",
    });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    const isExpired = err.name === "TokenExpiredError";
    logger.debug("Auth middleware rejected token", { reason: err.message });
    return error(res, {
      message: isExpired ? "Access token has expired" : "Invalid access token",
      statusCode: 401,
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
    });
  }
};

/**
 * Socket.IO middleware — authenticate a socket connection.
 * Expects token in socket.handshake.auth.token
 * or the Authorization header.
 *
 * @param {import('socket.io').Socket} socket
 * @param {Function} next
 */
const authenticateSocket = (socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.split(" ")[1];

  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    const payload = verifyAccessToken(token);
    socket.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    return next(new Error("Invalid or expired token"));
  }
};

module.exports = { authenticate, authenticateSocket };
