const taskService = require("../services/taskService");
const { success } = require("../utils/apiResponse");

// ─── POST /tasks ──────────────────────────────────────────────────────────────

const createTask = async (req, res, next) => {
  try {
    const { type, payload, priority, maxAttempts, scheduledAt } = req.body;
    const userId = req.user.id;

    const task = await taskService.createTask({
      userId, type, payload, priority, maxAttempts, scheduledAt,
    });

    return success(res, {
      statusCode: 201,
      message:    "Task created and queued",
      data:       task,
    });
  } catch (err) {
    return next(err);
  }
};

// ─── PATCH /tasks/:id/status ──────────────────────────────────────────────────

const updateTaskStatus = async (req, res, next) => {
  try {
    const { status, message } = req.body;
    const task = await taskService.updateTaskStatus(req.params.id, req.user.id, status, message);
    return success(res, { message: `Task status updated to ${status}`, data: task });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tasks ───────────────────────────────────────────────────────────────

const listTasks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      status,
      type,
      limit  = 20,
      offset = 0,
    } = req.query;

    const result = await taskService.listTasks({
      userId,
      status,
      type,
      limit:  parseInt(limit,  10),
      offset: parseInt(offset, 10),
    });

    return success(res, {
      data: result.tasks,
      meta: {
        total:  result.total,
        limit:  result.limit,
        offset: result.offset,
        hasMore: result.offset + result.tasks.length < result.total,
      },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tasks/:id ───────────────────────────────────────────────────────────

const getTask = async (req, res, next) => {
  try {
    const task = await taskService.getTask(req.params.id, req.user.id);
    return success(res, { data: task });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tasks/:id/logs ──────────────────────────────────────────────────────

const getTaskLogs = async (req, res, next) => {
  try {
    const logs = await taskService.getTaskLogs(req.params.id, req.user.id);
    return success(res, { data: logs });
  } catch (err) {
    return next(err);
  }
};

// ─── DELETE /tasks/:id ────────────────────────────────────────────────────────

const cancelTask = async (req, res, next) => {
  try {
    const task = await taskService.cancelTask(req.params.id, req.user.id);
    return success(res, { message: "Task cancelled", data: task });
  } catch (err) {
    return next(err);
  }
};

module.exports = { createTask, updateTaskStatus, listTasks, getTask, getTaskLogs, cancelTask };
