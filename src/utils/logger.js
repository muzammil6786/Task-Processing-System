const { createLogger, format, transports } = require("winston");

const isDev = (process.env.NODE_ENV || "development") === "development";

const devFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: "HH:mm:ss" }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

const prodFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
);

const logger = createLogger({
  level: isDev ? "debug" : "info",
  format: isDev ? devFormat : prodFormat,
  transports: [
    new transports.Console(),

    //  File for all logs
    new transports.File({ filename: "logs/combined.log" }),

    //  Separate file for errors only
    new transports.File({ filename: "logs/error.log", level: "error" }),
  ],
  exitOnError: false,
});

module.exports = logger;