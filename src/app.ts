// Load environment variables first
import 'dotenv/config';

// require('./routes') // Routes are imported later
import { restoreSessions } from './sessions';
import { routes } from './routes'; // Import routes definition
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { maxAttachmentSize } from './config';
import { ensureDirectories } from './utils/ensureDirectories';
import { logger, createChildLogger } from './utils/logger'; // Import logger
import { AuthenticatedRequest, ChildLoggerOptions } from './types';

const app = express();

// Request logger middleware using Winston
const requestLogger = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  // Add request ID for tracking
  const requestId = Math.random().toString(36).substring(2, 15);
  req.requestId = requestId; // Attach to request object if needed elsewhere

  // Create a child logger with the requestId
  const loggerOptions: ChildLoggerOptions = { requestId };
  req.logger = createChildLogger(loggerOptions);

  // Start time tracking
  const start = Date.now();

  // Log request start
  req.logger.info(`${req.method} ${req.originalUrl} [STARTED]`);

  // Log request finish/error using 'finish' and 'close' events
  const logFinish = (): void => {
    // Remove listeners to prevent double logging
    res.removeListener('finish', logFinish);
    res.removeListener('close', logFinish); // 'close' handles aborted requests

    const duration = Date.now() - start;
    if (res.statusCode >= 400) {
      req.logger.warn(`${req.method} ${req.originalUrl} [FINISHED] ${res.statusCode} ${duration}ms`);
    } else {
      req.logger.info(`${req.method} ${req.originalUrl} [FINISHED] ${res.statusCode} ${duration}ms`);
    }
  };

  res.on('finish', logFinish);
  res.on('close', logFinish); // Handles cases where the connection closes before 'finish'

  next();
};

// Add response time header middleware
const addResponseTime = (_req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  // Store the original end method
  const originalEnd = res.end.bind(res);

  // Override the end method
  res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
    // Calculate duration
    const duration = Date.now() - start;

    // Try to set the header if headers haven't been sent yet
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }

    // Call the original end method
    return originalEnd(chunk, encoding, cb);
  };

  next();
};

// CORS middleware to disable CORS restrictions
const disableCors = (req: Request, res: Response, next: NextFunction): void => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
};

// Initialize Express app
app.disable('x-powered-by');
app.use(requestLogger);
app.use(addResponseTime);
app.use(disableCors); // Add CORS middleware
app.use(bodyParser.json({ limit: maxAttachmentSize + 1000000 }));
app.use(bodyParser.urlencoded({ limit: maxAttachmentSize + 1000000, extended: true }));
app.use('/', routes); // Mount the routes

// --- Centralized Error Handling Middleware ---
// This MUST be the last middleware added
// eslint-disable-next-line no-unused-vars
const errorHandler = (err: any, req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  // Use the request-specific logger if available, otherwise the default logger
  const reqLogger = req.logger || logger;

  // Log the error with stack trace and request ID
  reqLogger.error(`Unhandled Error: ${err.message}`, {
    stack: err.stack,
    status: err.status || 500, // Use error status or default to 500
    path: req.originalUrl,
    method: req.method
  });

  // Prevent sending multiple responses
  if (res.headersSent) {
    next(err); // Delegate to default Express error handler if headers sent
    return;
  }

  const statusCode = err.statusCode || err.status || 500;
  const responseError: any = {
    error: {
      message: err.expose // If error is marked safe to expose, use its message
        ? err.message
        : 'Internal Server Error', // Otherwise, generic message
      // Optionally include error code if available and safe
      // code: err.code || undefined
    }
  };

  // In development, you might want to send the stack trace
  if (process.env.NODE_ENV === 'development' && !err.expose) {
    responseError.error.stack = err.stack;
  }

  res.status(statusCode).json(responseError);
};

app.use(errorHandler); // Register the error handler

// --- Application Initialization ---
ensureDirectories();
restoreSessions();

export default app;
