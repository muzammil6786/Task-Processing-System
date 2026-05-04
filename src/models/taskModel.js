const db = require("../config/database");

// ─── Tasks ────────────────────────────────────────────────────────────────────

/**
 * Create a new task record.
 *
 * @param {{ userId, type, payload, priority, maxAttempts, scheduledAt }} data
 * @returns {Promise<object>}
 */
const create = async ({ userId, type, payload = {}, priority = 0, maxAttempts = 3, scheduledAt = null }) => {
  const { rows } = await db.query(
    `INSERT INTO tasks (user_id, type, payload, priority, max_attempts, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, type, JSON.stringify(payload), priority, maxAttempts, scheduledAt]
  );
  return rows[0];
};

/**
 * Fetch a single task — optionally scoped to an owner.
 *
 * @param {string}      id
 * @param {string|null} userId  If provided, enforces ownership.
 * @returns {Promise<object|null>}
 */
const findById = async (id, userId = null) => {
  const params = [id];
  let query = "SELECT * FROM tasks WHERE id = $1";
  if (userId) {
    query += " AND user_id = $2";
    params.push(userId);
  }
  const { rows } = await db.query(query, params);
  return rows[0] || null;
};

/**
 * Paginated list of tasks belonging to a user.
 *
 * @param {object} filters
 * @param {string}   filters.userId
 * @param {string}   [filters.status]
 * @param {string}   [filters.type]
 * @param {number}   [filters.limit=20]
 * @param {number}   [filters.offset=0]
 * @returns {Promise<{ tasks: object[], total: number }>}
 */
const findByUser = async ({ userId, status, type, limit = 20, offset = 0 }) => {
  const conditions = ["user_id = $1"];
  const params = [userId];
  let idx = 2;

  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }
  if (type) {
    conditions.push(`type = $${idx++}`);
    params.push(type);
  }

  const where = conditions.join(" AND ");

  // Run count and data queries in parallel for efficiency
  const [countResult, dataResult] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM tasks WHERE ${where}`, params),
    db.query(
      `SELECT id, user_id, type, status, priority, payload, result,
              error_message, attempts, max_attempts,
              scheduled_at, started_at, completed_at, created_at, updated_at
       FROM tasks
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
  ]);

  return {
    tasks: dataResult.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
};

/**
 * Update the status (and related timestamps/fields) of a task.
 * Used by the worker to transition states.
 *
 * @param {string} id
 * @param {object} updates  Allowed keys: status, result, errorMessage, attempts,
 *                          startedAt, completedAt, queueJobId
 * @param {import('pg').PoolClient} [client]  Pass a client to run inside a transaction
 * @returns {Promise<object>}
 */
const updateStatus = async (id, updates, client = null) => {
  const executor = client || db;

  const fields = [];
  const params = [];
  let idx = 1;

  const allowed = {
    status: "status",
    result: "result",
    errorMessage: "error_message",
    attempts: "attempts",
    startedAt: "started_at",
    completedAt: "completed_at",
    queueJobId: "queue_job_id",
  };

  for (const [key, col] of Object.entries(allowed)) {
    if (updates[key] !== undefined) {
      const val = key === "result" ? JSON.stringify(updates[key]) : updates[key];
      fields.push(`${col} = $${idx++}`);
      params.push(val);
    }
  }

  if (fields.length === 0) throw new Error("No valid update fields provided");

  params.push(id);
  const { rows } = await executor.query(
    `UPDATE tasks SET ${fields.join(", ")}, updated_at = NOW()
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return rows[0] || null;
};

// ─── Task Logs ────────────────────────────────────────────────────────────────

/**
 * Append an entry to the immutable audit log.
 *
 * @param {{ taskId, fromStatus, toStatus, message, metadata }} data
 * @param {import('pg').PoolClient} [client]
 */
const appendLog = async ({ taskId, fromStatus, toStatus, message, metadata }, client = null) => {
  const executor = client || db;
  await executor.query(
    `INSERT INTO task_logs (task_id, from_status, to_status, message, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [taskId, fromStatus || null, toStatus, message || null, metadata ? JSON.stringify(metadata) : null]
  );
};

/**
 * Fetch the full audit trail for a task.
 *
 * @param {string} taskId
 * @returns {Promise<object[]>}
 */
const getLogs = async (taskId) => {
  const { rows } = await db.query(
    "SELECT * FROM task_logs WHERE task_id = $1 ORDER BY created_at ASC",
    [taskId]
  );
  return rows;
};

module.exports = {
  create,
  findById,
  findByUser,
  updateStatus,
  appendLog,
  getLogs,
};
