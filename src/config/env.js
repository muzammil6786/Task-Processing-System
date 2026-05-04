require("dotenv").config();

const required = [
  "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD",
  "JWT_SECRET", "JWT_REFRESH_SECRET",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

module.exports = {
  app: {
    env: process.env.NODE_ENV || "development",
    port: parseInt(process.env.PORT, 10) || 3000,
    isDev: (process.env.NODE_ENV || "development") === "development",
  },

  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT, 10) || 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT, 10) || 2000,
    },
  },

  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    url: process.env.REDIS_URL || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  queue: {
    name: process.env.QUEUE_NAME || "task-queue",
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 5,
    jobAttempts: parseInt(process.env.JOB_ATTEMPTS, 10) || 3,
    jobBackoffDelay: parseInt(process.env.JOB_BACKOFF_DELAY, 10) || 5000,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3001",
  },
};
