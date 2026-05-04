const logger = require("../../utils/logger");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simulate async I/O with a random delay in [minMs, maxMs]. */
const simulateWork = (minMs = 1000, maxMs = 4000) =>
  new Promise((resolve) =>
    setTimeout(resolve, minMs + Math.random() * (maxMs - minMs))
  );

/** Simulate an occasional transient failure (10% of the time). */
const maybeTransientFailure = (label) => {
  if (Math.random() < 0.1) {
    throw new Error(`Simulated transient failure in ${label}`);
  }
};

// ─── Processors ───────────────────────────────────────────────────────────────

/**
 * data_processing
 * Simulates ingesting a dataset and computing aggregate statistics.
 */
const dataProcessing = async ({ payload, job }) => {
  logger.debug("data_processing: starting", { jobId: job.id, payload });

  await job.updateProgress(10);
  await simulateWork(1000, 3000);
  maybeTransientFailure("data_processing");
  await job.updateProgress(60);

  await simulateWork(500, 1500);
  await job.updateProgress(100);

  return {
    recordsProcessed: Math.floor(Math.random() * 10_000) + 1,
    summary: {
      mean:   parseFloat((Math.random() * 100).toFixed(2)),
      stdDev: parseFloat((Math.random() * 10).toFixed(2)),
    },
    processedAt: new Date().toISOString(),
  };
};

/**
 * report_generation
 * Simulates building and exporting a PDF/CSV report.
 */
const reportGeneration = async ({ payload, job }) => {
  logger.debug("report_generation: starting", { jobId: job.id });

  await simulateWork(2000, 5000);
  await job.updateProgress(50);
  maybeTransientFailure("report_generation");
  await simulateWork(1000, 2000);
  await job.updateProgress(100);

  const reportId = `RPT-${Date.now()}`;
  return {
    reportId,
    format:    payload.format || "pdf",
    pages:     Math.floor(Math.random() * 20) + 1,
    // In a real system this would be a signed S3 URL
    downloadUrl: `https://storage.example.com/reports/${reportId}.pdf`,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * email_sending
 * Simulates sending an email via an SMTP provider.
 */
const emailSending = async ({ payload, job }) => {
  logger.debug("email_sending: starting", { jobId: job.id, to: payload.to });

  if (!payload.to) {
    throw new Error("email_sending: payload.to is required");
  }

  await simulateWork(500, 1500);
  await job.updateProgress(100);

  return {
    messageId: `msg_${Date.now()}`,
    to:        payload.to,
    subject:   payload.subject || "(no subject)",
    sentAt:    new Date().toISOString(),
  };
};

/**
 * file_conversion
 * Simulates converting a file from one format to another.
 */
const fileConversion = async ({ payload, job }) => {
  logger.debug("file_conversion: starting", { jobId: job.id });

  await simulateWork(1500, 4000);
  await job.updateProgress(70);
  maybeTransientFailure("file_conversion");
  await simulateWork(500, 1000);
  await job.updateProgress(100);

  return {
    originalFile: payload.sourceUrl || "unknown",
    convertedFile: `https://storage.example.com/converted/${Date.now()}.${payload.targetFormat || "pdf"}`,
    targetFormat: payload.targetFormat || "pdf",
    fileSizeBytes: Math.floor(Math.random() * 5_000_000) + 1024,
    convertedAt: new Date().toISOString(),
  };
};

// ─── Registry ─────────────────────────────────────────────────────────────────

module.exports = {
  data_processing:   dataProcessing,
  report_generation: reportGeneration,
  email_sending:     emailSending,
  file_conversion:   fileConversion,
};
