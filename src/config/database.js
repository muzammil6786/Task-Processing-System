const { Pool } = require("pg");
const env = require("./env");
const logger = require("../utils/logger");

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  max: env.db.pool.max,
  idleTimeoutMillis: env.db.pool.idleTimeoutMillis,
  connectionTimeoutMillis: env.db.pool.connectionTimeoutMillis,
  // SSL in production
  ...(env.app.env === "production" && {
    ssl: { rejectUnauthorized: true },
  }),
});

// Log pool-level errors (e.g. dropped idle client)
pool.on("error", (err) => {
  logger.error("Unexpected database pool error", { error: err.message });
});

/**
 * Execute a single parameterised query.
 * @param {string} text   SQL statement
 * @param {Array}  params Positional parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

/**
 * Acquire a client for multi-statement transactions.
 * Callers are responsible for calling client.release() in a finally block.
 * @returns {Promise<import('pg').PoolClient>}
 */
const getClient = () => pool.connect();

/**
 * Convenience helper for transactions.
 * Automatically begins, commits, and rolls back.
 *
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Verify that the pool can reach the database.
 * Used by the /health endpoint.
 */
const healthCheck = async () => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT NOW() AS now");
    return { status: "ok", timestamp: rows[0].now };
  } finally {
    client.release();
  }
};

module.exports = { query, getClient, withTransaction, healthCheck, pool };
