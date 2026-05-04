const taskModel          = require("../models/taskModel");
const { enqueue }        = require("../queues/taskQueue");
const { AppError }       = require("../middleware/errorHandler");
const db                 = require("../config/database");
const logger             = require("../utils/logger");

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Persist a new task and enqueue it for processing.
 *
 * @param {{ userId, type, payload, priority, maxAttempts, scheduledAt }} data
 * @returns {Promise<object>} The newly created task
 */
const createTask = async ({ userId, type, payload, priority = 0, maxAttempts = 3, scheduledAt = null }) => {
  // Create the DB record first so we have an ID before enqueueing
  const task = await taskModel.create({
    userId, type, payload, priority, maxAttempts, scheduledAt,
  });

  // Log the initial transition (no fromStatus — task is brand new)
  await taskModel.appendLog({
    taskId:   task.id,
    toStatus: "pending",
    message:  "Task created and queued",
  });

  // Compute delay for scheduled tasks
  let delay = 0;
  if (scheduledAt) {
    delay = Math.max(0, new Date(scheduledAt).getTime() - Date.now());
  }

  // Enqueue — if the queue is down this throws, leaving the task in 'pending'
  // so a retry mechanism or admin action can re-enqueue later
  try {
    const job = await enqueue({ taskId: task.id, type, payload, priority, delay });
    logger.info("Task created and enqueued", { taskId: task.id, jobId: job.id });
  } catch (err) {
    logger.error("Failed to enqueue task — task remains pending", {
      taskId: task.id,
      error:  err.message,
    });
    // Don't throw — the task is persisted; an operator can re-enqueue later
  }

  return task;
};



/**
 * Manually update task status (admin/debug use).
 * Allows any valid transition between statuses.
 */
const updateTaskStatus = async (taskId, userId, newStatus, message) => {
  const validStatuses = ["pending", "processing", "completed", "failed"];

  if (!validStatuses.includes(newStatus)) {
    throw new AppError(
      `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      422,
      "INVALID_STATUS"
    );
  }

  const task = await getTask(taskId, userId); // enforces ownership

  const updates = { status: newStatus };

  if (newStatus === "processing") updates.startedAt = new Date();
  if (newStatus === "completed" || newStatus === "failed") updates.completedAt = new Date();

  const updated = await db.withTransaction(async (client) => {
    const t = await taskModel.updateStatus(taskId, updates, client);

    await taskModel.appendLog({
      taskId,
      fromStatus: task.status,
      toStatus:   newStatus,
      message:    message || `Manually updated to ${newStatus}`,
    }, client);

    return t;
  });

  // Emit real-time update
  try {
    const { getSocketServer } = require("../websocket/socketManager");
    getSocketServer().to(`user:${userId}`).emit("task:status_update", {
      taskId,
      status:    newStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (_) {}

  return updated;
};



// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Get a paginated list of tasks for the authenticated user.
 *
 * @param {{ userId, status, type, limit, offset }} filters
 * @returns {Promise<{ tasks: object[], total: number, limit: number, offset: number }>}
 */
const listTasks = async ({ userId, status, type, limit = 20, offset = 0 }) => {
  const { tasks, total } = await taskModel.findByUser({ userId, status, type, limit, offset });
  return { tasks, total, limit, offset };
};

/**
 * Get a single task by ID, ensuring the requesting user owns it.
 *
 * @param {string} taskId
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getTask = async (taskId, userId) => {
  const task = await taskModel.findById(taskId, userId);
  if (!task) {
    throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
  }
  return task;
};

/**
 * Get the audit log for a task (ownership enforced).
 *
 * @param {string} taskId
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
const getTaskLogs = async (taskId, userId) => {
  // Ensure user owns the task
  await getTask(taskId, userId);
  return taskModel.getLogs(taskId);
};

// ─── Cancel ───────────────────────────────────────────────────────────────────

/**
 * Cancel a pending task (cannot cancel a task already processing / done).
 *
 * @param {string} taskId
 * @param {string} userId
 * @returns {Promise<object>}
 */
const cancelTask = async (taskId, userId) => {
  const task = await getTask(taskId, userId);

  if (!["pending"].includes(task.status)) {
    throw new AppError(
      `Cannot cancel a task with status "${task.status}". Only pending tasks can be cancelled.`,
      409,
      "INVALID_STATUS_TRANSITION"
    );
  }

  const updated = await db.withTransaction(async (client) => {
    const t = await taskModel.updateStatus(taskId, {
      status:      "failed",
      errorMessage: "Cancelled by user",
      completedAt: new Date(),
    }, client);

    await taskModel.appendLog({
      taskId,
      fromStatus: task.status,
      toStatus:   "failed",
      message:    "Cancelled by user",
    }, client);

    return t;
  });

  return updated;
};

module.exports = { createTask, updateTaskStatus, listTasks, getTask, getTaskLogs, cancelTask };
