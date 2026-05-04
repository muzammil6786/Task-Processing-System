const bcrypt    = require("bcryptjs");
const userModel = require("../models/userModel");
const jwtUtils  = require("../utils/jwt");
const { AppError } = require("../middleware/errorHandler");

const BCRYPT_SALT_ROUNDS = 12;

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * Create a new user account.
 * @param {{ email, password, name }} data
 * @returns {{ user, accessToken, refreshToken }}
 */
const register = async ({ email, password, name }) => {
  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw new AppError("An account with this email already exists", 409, "EMAIL_TAKEN");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const user         = await userModel.create({ email, passwordHash, name });

  return issueTokenPair(user);
};

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Authenticate a user with email + password.
 * @param {{ email, password }} credentials
 * @returns {{ user, accessToken, refreshToken }}
 */
const login = async ({ email, password }) => {
  const user = await userModel.findByEmail(email);

  // Use a constant-time comparison to avoid timing attacks
  const passwordValid =
    user && (await bcrypt.compare(password, user.password_hash));

  if (!user || !passwordValid) {
    // Generic message — don't reveal whether the email exists
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  if (!user.is_active) {
    throw new AppError("Account is deactivated", 403, "ACCOUNT_INACTIVE");
  }

  return issueTokenPair(user);
};

// ─── Refresh ──────────────────────────────────────────────────────────────────

/**
 * Rotate a refresh token — revoke the old one, issue a new pair.
 * @param {string} rawRefreshToken
 * @returns {{ user, accessToken, refreshToken }}
 */
const refreshTokens = async (rawRefreshToken) => {
  // Verify signature & expiry
  let payload;
  try {
    payload = jwtUtils.verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");
  }

  // Check it exists in DB and hasn't been revoked
  const hash      = userModel.hashToken(rawRefreshToken);
  const tokenRow  = await userModel.findRefreshToken(hash);
  if (!tokenRow) {
    // Potential reuse — revoke all user tokens as a precaution
    await userModel.revokeAllUserTokens(payload.sub);
    throw new AppError("Refresh token has been revoked or reused", 401, "TOKEN_REUSE");
  }

  // Revoke old token (rotation)
  await userModel.revokeRefreshToken(hash);

  const user = await userModel.findById(payload.sub);
  if (!user || !user.is_active) {
    throw new AppError("User not found or inactive", 401, "USER_UNAVAILABLE");
  }

  return issueTokenPair(user);
};

// ─── Logout ───────────────────────────────────────────────────────────────────

/**
 * Revoke a specific refresh token on logout.
 * @param {string} rawRefreshToken
 */
const logout = async (rawRefreshToken) => {
  if (!rawRefreshToken) return;
  const hash = userModel.hashToken(rawRefreshToken);
  await userModel.revokeRefreshToken(hash);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Issue an access+refresh token pair and persist the refresh token.
 * @param {object} user DB user row
 * @returns {{ user: object, accessToken: string, refreshToken: string }}
 */
const issueTokenPair = async (user) => {
  const accessToken = jwtUtils.signAccessToken(user);
  const { token: refreshToken, expiresAt } = jwtUtils.signRefreshToken(user);

  await userModel.saveRefreshToken({
    userId:    user.id,
    tokenHash: userModel.hashToken(refreshToken),
    expiresAt,
  });

  // Strip sensitive fields before returning
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken };
};

module.exports = { register, login, refreshTokens, logout };
