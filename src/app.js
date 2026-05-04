const express      = require("express");
const helmet       = require("helmet");
const cors         = require("cors");
const morgan       = require("morgan");
const rateLimit    = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const env           = require("./config/env");
const logger        = require("./utils/logger");
const authRoutes    = require("./routes/authRoutes");
const taskRoutes    = require("./routes/taskRoutes");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { healthCheck: dbHealth }  = require("./config/database");
const { healthCheck: redisHealth } = require("./config/redis");
const { success } = require("./utils/apiResponse");

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      env.cors.origin,
  credentials: true,              // required for cookies
  methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
}));

// ─── Body & cookie parsers ────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── HTTP request logging ─────────────────────────────────────────────────────
app.use(
  morgan(env.app.isDev ? "dev" : "combined", {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip:   (req) => req.path === "/health", // don't log health polls
  })
);

// ─── Global rate limiting ─────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max:      env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      error: { message: "Too many requests. Please try again later.", code: "RATE_LIMIT_EXCEEDED" },
    }),
});
app.use(limiter);

// ─── Stricter limiter for auth endpoints ──────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,    // 15 minutes
  max:      25,
  message:  { success: false, error: { message: "Too many auth attempts", code: "RATE_LIMIT_AUTH" } },
});

// ─── Routes ───────────────────────────────────────────────────────────────────


app.use("/auth", authLimiter, authRoutes);
app.use("/tasks", taskRoutes);

// ─── Error handling (must be last) ───────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
