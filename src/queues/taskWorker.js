require("dotenv").config();
const { Worker } = require("bullmq");
const env                   = require("../config/env");
const { createRedisClient } = require("../config/redis");
const taskModel             = require("../models/taskModel");
const db                    = require("../config/database");
const logger                = require("../utils/logger");
const processors            = require("./processors");
const { getSocketServer }   = require("../websocket/socketManager");

// Worker gets its own connection (BullMQ requirement)
const workerConnection = createRedisClient();

// ─── Worker definition ────────────────────────────────────────────────────────

const worker = new Worker(
  env.queue.name,
  async (job) => {
    const { taskId, type, payload } = job.data;

    logger.info("Processing job", { jobId: job.id, taskId, type, attempt: job.attemptsMade + 1 });

    // ── 1. Fetch current task & transition to 'processing' ──────────────────
    const task = await taskModel.findById(taskId);
    if (!task) {
      // Task was deleted — skip silently
      logger.warn("Task not found, skipping job", { taskId, jobId: job.id });
      return;
    }

    await db.withTransaction(async (client) => {
      await taskModel.updateStatus(taskId, {
        status:     "processing",
        startedAt:  new Date(),
        queueJobId: String(job.id),
        attempts:   (task.attempts || 0) + 1,
      }, client);

      await taskModel.appendLog({
        taskId,
        fromStatus: task.status,
        toStatus:   "processing",
        message:    `Attempt ${job.attemptsMade + 1} of ${job.opts.attempts}`,
      }, client);
    });

    emitStatusUpdate(task.user_id, taskId, "processing");

    // ── 2. Run processor ──────────────────────────────────────────────────────
    const processor = processors[type];
    if (!processor) {
      throw new Error(`No processor registered for task type "${type}"`);
    }

    const result = await processor({ payload, job });

    // ── 3. Mark completed ────────────────────────────────────────────────────
    await db.withTransaction(async (client) => {
      await taskModel.updateStatus(taskId, {
        status:      "completed",
        result,
        completedAt: new Date(),
      }, client);

      await taskModel.appendLog({
        taskId,
        fromStatus: "processing",
        toStatus:   "completed",
        message:    "Task completed successfully",
        metadata:   { durationMs: Date.now() - new Date(task.created_at).getTime() },
      }, client);
    });

    emitStatusUpdate(task.user_id, taskId, "completed", result);
    logger.info("Job completed", { jobId: job.id, taskId });
  },
  {
    connection:  workerConnection,
    concurrency: env.queue.workerConcurrency,
    // Process jobs from highest priority first
    stalledInterval: 30_000,
  }
);

// ─── Failure handler ─────────────────────────────────────────────────────────

worker.on("failed", async (job, err) => {
  if (!job) return;

  const { taskId } = job.data;
  const isFinal = job.attemptsMade >= job.opts.attempts;

  logger.error("Job failed", {
    jobId:  job.id,
    taskId,
    attempt: job.attemptsMade,
    final:   isFinal,
    error:   err.message,
  });

  if (isFinal) {
    try {
      const task = await taskModel.findById(taskId);
      if (task) {
        await db.withTransaction(async (client) => {
          await taskModel.updateStatus(taskId, {
            status:       "failed",
            errorMessage: err.message,
            completedAt:  new Date(),
          }, client);

          await taskModel.appendLog({
            taskId,
            fromStatus: task.status,
            toStatus:   "failed",
            message:    `All ${job.opts.attempts} attempts exhausted: ${err.message}`,
          }, client);
        });

        emitStatusUpdate(task.user_id, taskId, "failed", null, err.message);
      }
    } catch (dbErr) {
      logger.error("Failed to update task status after final failure", {
        taskId,
        error: dbErr.message,
      });
    }
  }
});

worker.on("error", (err) =>
  logger.error("Worker error", { error: err.message })
);

// ─── Real-time helper ─────────────────────────────────────────────────────────

/**
 * Emit a task:status_update event to the user's private room.
 * No-ops gracefully if the Socket.IO server isn't initialised
 * (e.g. when running the worker as a standalone process without the HTTP server).
 */
function emitStatusUpdate(userId, taskId, status, result = null, errorMessage = null) {
  try {
    const io = getSocketServer();
    io.to(`user:${userId}`).emit("task:status_update", {
      taskId,
      status,
      result,
      errorMessage,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Socket.IO server not available in standalone worker mode
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal) => {
  logger.info(`Worker received ${signal}. Draining queue…`);
  await worker.close();
  await workerConnection.quit();
  logger.info("Worker shut down cleanly");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

logger.info("Task worker started", {
  queue:       env.queue.name,
  concurrency: env.queue.workerConcurrency,
});

module.exports = { worker };
