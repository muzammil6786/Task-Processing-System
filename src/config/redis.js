const Redis = require("ioredis");
const env = require("./env");
const logger = require("../utils/logger");

const redisOptions = env.redis.url
  ? { url: env.redis.url }
  : {
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password,
      // Graceful reconnect — BullMQ requires maxRetriesPerRequest: null
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        const delay = Math.min(times * 500, 5000);
        logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
    };

/**
 * Create a new ioredis connection.
 * BullMQ mandates separate connections for Queue vs Worker,
 * so callers should invoke createRedisClient() independently.
 *
 * @returns {Redis} ioredis client
 */
const createRedisClient = () => {
  const client = new Redis(redisOptions);

  client.on("connect", () => logger.info("Redis connected"));
  client.on("error", (err) =>
    logger.error("Redis error", { message: err.message })
  );

  return client;
};

/**
 * A shared client suitable for general-purpose use
 * (e.g. caching, health checks).  Do NOT pass this instance
 * to BullMQ — create a dedicated one per Queue/Worker.
 */
const sharedClient = createRedisClient();

/**
 * Verify Redis connectivity.
 * Used by the /health endpoint.
 */
const healthCheck = async () => {
  const pong = await sharedClient.ping();
  return { status: pong === "PONG" ? "ok" : "degraded" };
};

module.exports = { createRedisClient, sharedClient, healthCheck };
