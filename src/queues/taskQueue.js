const { Queue, QueueEvents } = require("bullmq");
const env                    = require("../config/env");
const { createRedisClient }  = require("../config/redis");
const logger                 = require("../utils/logger");

// Dedicated connections for Queue and QueueEvents
const queueConnection  = createRedisClient();
const eventsConnection = createRedisClient();

const taskQueue = new Queue(env.queue.name, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts:  env.queue.jobAttempts,
    backoff: {
      type:  "exponential",
      delay: env.queue.jobBackoffDelay,
    },
    removeOnComplete: { age: 24 * 3600, count: 1000 }, // keep for 24 h
    removeOnFail:     { age: 7 * 24 * 3600 },           // keep failures 7 days
  },
});

// QueueEvents lets the API side listen for completion / failure
// without needing to run a worker in the same process.
const queueEvents = new QueueEvents(env.queue.name, {
  connection: eventsConnection,
});

queueEvents.on("completed", ({ jobId }) =>
  logger.debug("Job completed", { jobId })
);
queueEvents.on("failed", ({ jobId, failedReason }) =>
  logger.warn("Job failed", { jobId, failedReason })
);

/**
 * Enqueue a task for background processing.
 *
 * @param {object} params
 * @param {string} params.taskId       UUID from the `tasks` table
 * @param {string} params.type         Task type
 * @param {object} params.payload      Task-specific data
 * @param {number} [params.priority=0] Higher = processed sooner (BullMQ uses negative for high priority)
 * @param {number} [params.delay=0]    Milliseconds to wait before processing
 * @returns {Promise<import('bullmq').Job>}
 */
const enqueue = async ({ taskId, type, payload, priority = 0, delay = 0 }) => {
  const job = await taskQueue.add(
    type,                        // job name (visible in Bull Board)
    { taskId, type, payload },   // job data
    {
      jobId:    taskId,          // use task UUID as job ID for idempotency
      priority: -priority,       // BullMQ: lower value = higher priority
      delay,
    }
  );
  logger.info("Task enqueued", { jobId: job.id, type, taskId });
  return job;
};

/**
 * Retrieve a job by ID (useful for checking queue-level status).
 * @param {string} jobId
 */
const getJob = (jobId) => taskQueue.getJob(jobId);

/**
 * Gracefully close the queue connection (call on process shutdown).
 */
const close = async () => {
  await taskQueue.close();
  await queueEvents.close();
};

module.exports = { taskQueue, queueEvents, enqueue, getJob, close };
