require("dotenv").config();
const http           = require("http");
const app            = require("./app");
const env            = require("./config/env");
const logger         = require("./utils/logger");
const socketManager  = require("./websocket/socketManager");
const { close: closeQueue } = require("./queues/taskQueue");
const { pool: dbPool }      = require("./config/database");
const { sharedClient: redis } = require("./config/redis");

const server = http.createServer(app);

// Attach Socket.IO
socketManager.init(server);

// In development, run the worker in-process for convenience.
// In production, run `npm run worker` as a separate process / container.
if (env.app.isDev) {
  logger.info("Dev mode: starting inline worker");
  require("./queues/taskWorker");
}

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(env.app.port, () => {
  logger.info(`Server listening`, {
    port: env.app.port,
    env:  env.app.env,
    pid:  process.pid,
  });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully…`);

  // Stop accepting new HTTP connections
  server.close(async () => {
    logger.info("HTTP server closed");

    try {
      await Promise.allSettled([
        closeQueue(),
        dbPool.end(),
        redis.quit(),
      ]);
      logger.info("All resources released. Exiting.");
      process.exit(0);
    } catch (err) {
      logger.error("Error during shutdown", { error: err.message });
      process.exit(1);
    }
  });

  // Force exit after 15 seconds if graceful shutdown stalls
  setTimeout(() => {
    logger.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 15_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason: String(reason) });
  // Don't crash immediately — log and continue
});

module.exports = server; // exported for integration tests
