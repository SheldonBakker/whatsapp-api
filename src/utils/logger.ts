import winston from 'winston';
import { ChildLoggerOptions } from '../types';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Determine log level from environment variable or default to 'info'
const logLevel: string = process.env.LOG_LEVEL || 'info';

// Custom format for console logging with colors
const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }), // Log stack traces
  printf(({ level, message, timestamp, stack, requestId, sessionId }) => {
    let log = `${timestamp} ${level}:`;
    if (requestId) log += ` [ReqID: ${requestId}]`;
    if (sessionId) log += ` [Session: ${sessionId}]`;
    log += ` ${stack || message}`;
    return log;
  })
);

// Format for file logging (JSON)
const fileFormat = combine(
  timestamp(),
  errors({ stack: true }), // Include stack traces in file logs
  json() // Log as JSON
);

const logger = winston.createLogger({
  level: logLevel,
  format: fileFormat, // Default format (used by file transport)
  transports: [
    // Console Transport (for development/debugging)
    new winston.transports.Console({
      format: consoleFormat, // Use the colorful format for the console
      handleExceptions: true, // Log uncaught exceptions
      handleRejections: true // Log unhandled promise rejections
    })
    // Optional: File Transport (for production/persistent logs)
    // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'logs/combined.log' })
  ],
  exitOnError: false // Do not exit on handled exceptions
});

// Add a stream interface for morgan or other middleware if needed
(logger as any).stream = {
  write: (message: string): void => {
    // Remove potential trailing newline from morgan
    logger.info(message.trim());
  }
};

// Helper function to create a child logger with specific context
const createChildLogger = (context: ChildLoggerOptions): winston.Logger => {
  return logger.child(context);
};

export { logger, createChildLogger };
