const authService   = require("../services/authService");
const { success }   = require("../utils/apiResponse");

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,         // inaccessible to JS — mitigates XSS
  secure:   process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

// ─── POST /auth/register ──────────────────────────────────────────────────────

const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    const { user, accessToken, refreshToken } = await authService.register({ email, password, name });

    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return success(res, {
      statusCode: 201,
      message:    "Account created successfully",
      data:       { user, accessToken },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /auth/login ─────────────────────────────────────────────────────────

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.login({ email, password });

    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return success(res, {
      message: "Login successful",
      data:    { user, accessToken },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

const refresh = async (req, res, next) => {
  try {
    // Accept token from cookie OR request body (for non-browser clients)
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!rawToken) {
      return res.status(401).json({ success: false, error: { message: "Refresh token required", code: "MISSING_REFRESH_TOKEN" } });
    }

    const { user, accessToken, refreshToken } = await authService.refreshTokens(rawToken);

    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return success(res, {
      message: "Tokens refreshed",
      data:    { user, accessToken },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /auth/logout ────────────────────────────────────────────────────────

const logout = async (req, res, next) => {
  try {
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
    await authService.logout(rawToken);

    res.clearCookie("refreshToken");

    return success(res, { message: "Logged out successfully", data: null });
  } catch (err) {
    return next(err);
  }
};



module.exports = { register, login, refresh, logout };
