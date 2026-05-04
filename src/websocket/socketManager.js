const { Server }              = require("socket.io");
const { authenticateSocket }  = require("../middleware/auth");
const logger                  = require("../utils/logger");
const env                     = require("../config/env");

// /** @type {import('socket.io').Server | null} */
let io = null;

// /**
//  * Attach Socket.IO to an existing HTTP/HTTPS server.
//  *
//  * @param {import('http').Server} httpServer
//  * @returns {import('socket.io').Server}
//  */
const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:      env.cors.origin,
      methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],   // Frontend may use any of these methods in API calls triggered by socket events
      credentials: true,
    },
    // Use long-polling as fallback for environments that block WebSocket
    transports: ["websocket", "polling"],
  });

  // ── Authentication middleware ──────────────────────────────────────────────
  io.use(authenticateSocket);

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const { id: userId, email } = socket.user;

    // Join private user room — worker sends events here
    socket.join(`user:${userId}`);
    logger.info("Socket connected", { socketId: socket.id, userId, email });

    // Allow client to subscribe to a specific task's updates
    socket.on("subscribe:task", (taskId) => {
      if (typeof taskId === "string" && taskId.length > 0) {
        socket.join(`task:${taskId}`);
        logger.debug("Socket subscribed to task", { socketId: socket.id, taskId });
      }
    });

    socket.on("unsubscribe:task", (taskId) => {
      socket.leave(`task:${taskId}`);
    });

    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected", { socketId: socket.id, userId, reason });
    });

    socket.on("error", (err) => {
      logger.error("Socket error", { socketId: socket.id, error: err.message });
    });
  });

  logger.info("Socket.IO initialised");
  return io;
};

/**
 * Returns the singleton Socket.IO server.
 * Throws if called before init().
 *
 * @returns {import('socket.io').Server}
 */
const getSocketServer = () => {
  if (!io) throw new Error("Socket.IO has not been initialised. Call init() first.");
  return io;
};

module.exports = { init, getSocketServer };
