const jwt  = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const env  = require("../config/env");

/**
 * Issue a short-lived access token.
 * @param {{ id: string, email: string }} user
 * @returns {string}
 */
const signAccessToken = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email, type: "access" },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

/**
 * Issue a long-lived, opaque refresh token.
 * We store a SHA-256 hash of this in the DB (see userModel.hashToken).
 * @param {{ id: string }} user
 * @returns {{ token: string, expiresAt: Date }}
 */
const signRefreshToken = (user) => {
  // A random jti makes every refresh token unique even for the same user
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: user.id, jti, type: "refresh" },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );
  // Decode just to get the expiry as a JS Date
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);
  return { token, expiresAt };
};

/**
 * Verify an access token and return its payload.
 * @param {string} token
 * @returns {{ sub: string, email: string }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
const verifyAccessToken = (token) =>
  jwt.verify(token, env.jwt.secret);

/**
 * Verify a refresh token and return its payload.
 * @param {string} token
 * @returns {{ sub: string, jti: string }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
const verifyRefreshToken = (token) =>
  jwt.verify(token, env.jwt.refreshSecret);

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
