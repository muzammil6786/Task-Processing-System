const db     = require("../config/database");
const crypto = require("crypto");

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * Find a user by email (case-insensitive).
 * @param {string} email
 * @returns {Promise<object|null>}
 */
const findByEmail = async (email) => {
  const { rows } = await db.query(
    "SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [email]
  );
  return rows[0] || null;
};

/**
 * Find a user by their primary key.
 * @param {string} id UUID
 * @returns {Promise<object|null>}
 */
const findById = async (id) => {
  const { rows } = await db.query(
    "SELECT id, email, name, is_active, created_at FROM users WHERE id = $1",
    [id]
  );
  return rows[0] || null;
};

/**
 * Insert a new user record.
 * @param {{ email: string, passwordHash: string, name: string }} data
 * @returns {Promise<object>} Created user (without password_hash)
 */
const create = async ({ email, passwordHash, name }) => {
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email, name, is_active, created_at`,
    [email.toLowerCase(), passwordHash, name]
  );
  return rows[0];
};

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

/**
 * Persist a hashed refresh token.
 * @param {{ userId: string, tokenHash: string, expiresAt: Date }} data
 */
const saveRefreshToken = async ({ userId, tokenHash, expiresAt }) => {
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
};

/**
 * Look up a refresh token row by its hash.
 * @param {string} tokenHash
 * @returns {Promise<object|null>}
 */
const findRefreshToken = async (tokenHash) => {
  const { rows } = await db.query(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0] || null;
};

/**
 * Revoke a single token (logout / rotation).
 * @param {string} tokenHash
 */
const revokeRefreshToken = async (tokenHash) => {
  await db.query(
    "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1",
    [tokenHash]
  );
};

/**
 * Revoke ALL refresh tokens for a user (e.g. password change, account breach).
 * @param {string} userId
 */
const revokeAllUserTokens = async (userId) => {
  await db.query(
    "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1",
    [userId]
  );
};

/**
 * Hash a raw refresh token with SHA-256 for safe storage.
 * @param {string} token
 * @returns {string}
 */
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

module.exports = {
  findByEmail,
  findById,
  create,
  saveRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  hashToken,
};
