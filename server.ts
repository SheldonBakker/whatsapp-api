// Load environment variables first
import 'dotenv/config';

import app from './src/app';
import { baseWebhookURL } from './src/config';
import { sessions, flushSessions } from './src/sessions';
import { scheduleHealthCheck } from './src/utils/healthCheckScheduler';
import { Server } from 'http';

// Start the server
const port: number = parseInt(process.env.PORT || '3000', 10);

// Check if BASE_WEBHOOK_URL environment variable is available
if (!baseWebhookURL) {
  console.warn('WARNING: BASE_WEBHOOK_URL environment variable is not available. Using default http://localhost:3000/callback');
  process.env.BASE_WEBHOOK_URL = 'http://localhost:3000/callback';
}

// Create HTTP server
const server: Server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);

  // Schedule daily health check at 9:00 AM SAST
  const healthCheckJob = scheduleHealthCheck('0 9 * * *', 'Africa/Johannesburg');

  // Log the next scheduled health check
  if (healthCheckJob) {
    console.log(`Daily health check scheduled. Next run: ${healthCheckJob.nextInvocation()}`);
  }
});

// Implement graceful shutdown
const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  // Close all HTTP connections
  server.close(() => {
    console.log('HTTP server closed.');
  });

  try {
    // Log active sessions before shutdown
    console.log(`Active sessions before shutdown: ${sessions.size}`);

    // Check if this is a Docker shutdown (SIGTERM) - if so, preserve sessions
    const isDockerShutdown = signal === 'SIGTERM';

    if (sessions.size > 0) {
      if (isDockerShutdown) {
        console.log('Docker shutdown detected. Preserving all WhatsApp sessions...');
        // Just close browsers without deleting sessions
        for (const [sessionId, client] of sessions.entries()) {
          if (client && client.pupBrowser) {
            try {
              await client.pupBrowser.close().catch(() => {});
              console.log(`Browser closed for session: ${sessionId}`);
            } catch (err) {
              console.error(`Error closing browser for session ${sessionId}:`, err);
            }
          }
        }
        console.log('All browsers closed. Sessions preserved for next startup.');
      } else {
        console.log('Closing all active WhatsApp sessions...');
        await flushSessions(false);
        console.log('All sessions terminated.');
      }
    }

    console.log('Graceful shutdown completed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  // Only exit for severe errors, not for browser-related issues or header issues
  if (!error.message.includes('Protocol error') &&
      !error.message.includes('Target closed') &&
      !error.message.includes('ERR_HTTP_HEADERS_SENT')) {
    gracefulShutdown('uncaughtException');
  }
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit for unhandled rejections, just log them
});
