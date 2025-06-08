/**
 * Health Check Scheduler Module
 *
 * This module implements a daily health check that sends WhatsApp messages
 * to specified phone numbers with system status information.
 */

import schedule from 'node-schedule';
import os from 'os';
import { createChildLogger } from './logger';
import { sessions } from '../sessions';

// Create a dedicated logger for health checks
const healthCheckLogger = createChildLogger({ module: 'healthCheck' });

// Phone numbers to send health check messages to
const HEALTH_CHECK_RECIPIENTS: string[] = [
  '+27681501196',
  '+27660149747'
];

// Default session ID to use for sending messages
// This will be the first available session if not specified
let defaultSessionId: string | null = null;

/**
 * Formats a phone number to ensure it has the @c.us suffix required by WhatsApp Web
 */
const formatPhoneNumber = (phoneNumber: string): string => {
  // Remove any non-digit characters except the leading +
  const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');

  // If the number already ends with @c.us, return it as is
  if (cleanNumber.endsWith('@c.us')) {
    return cleanNumber;
  }

  // Otherwise, append @c.us
  return `${cleanNumber}@c.us`;
};

interface SystemMetrics {
  uptime: number;
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  cpu: number;
  loadAvg: number[];
  platform: string;
  nodeVersion: string;
  activeSessions: number;
}

/**
 * Collects system metrics for the health check message
 */
const collectSystemMetrics = (): SystemMetrics => {
  return {
    uptime: process.uptime(),
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
      usagePercent: Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100)
    },
    cpu: os.cpus().length,
    loadAvg: os.loadavg(),
    platform: os.platform(),
    nodeVersion: process.version,
    activeSessions: sessions.size
  };
};

/**
 * Formats system metrics into a readable message
 */
const formatHealthMessage = (metrics: SystemMetrics): string => {
  const uptimeHours = Math.floor(metrics.uptime / 3600);
  const uptimeMinutes = Math.floor((metrics.uptime % 3600) / 60);
  const uptimeDays = Math.floor(uptimeHours / 24);

  return '📊 *WhatsApp API Health Check* 📊\n\n' +
    '✅ *Status:* Operational\n' +
    `⏱️ *Uptime:* ${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes}m\n` +
    `💾 *Memory Usage:* ${Math.round(metrics.memory.used / 1024 / 1024)}MB (${metrics.memory.usagePercent}%)\n` +
    `🔄 *Active Sessions:* ${metrics.activeSessions}\n` +
    `🖥️ *System:* ${metrics.platform} (${metrics.nodeVersion})\n` +
    `⏰ *Timestamp:* ${new Date().toISOString()}\n`;
};

/**
 * Sends a health check message to a specific phone number
 */
const sendHealthCheckMessage = async (phoneNumber: string, message: string): Promise<any> => {
  try {
    // Get the first available session if defaultSessionId is not set
    if (!defaultSessionId) {
      const sessionIds = Array.from(sessions.keys());
      if (sessionIds.length === 0) {
        throw new Error('No active WhatsApp sessions available');
      }
      defaultSessionId = sessionIds[0];
    }

    const client = sessions.get(defaultSessionId);
    if (!client) {
      throw new Error(`Session ${defaultSessionId} not found`);
    }

    const formattedNumber = formatPhoneNumber(phoneNumber);
    healthCheckLogger.info(`Sending health check to ${formattedNumber}`);

    const result = await client.sendMessage(formattedNumber, message);
    healthCheckLogger.info(`Health check sent successfully to ${phoneNumber}`);
    return result;
  } catch (error: any) {
    healthCheckLogger.error(`Failed to send health check to ${phoneNumber}: ${error.message}`, { error });
    throw error;
  }
};

interface HealthCheckResults {
  success: number;
  failed: number;
  errors: Array<{ phoneNumber: string; error: string }>;
}

/**
 * Runs the health check and sends messages to all configured recipients
 */
const runHealthCheck = async (): Promise<void> => {
  try {
    healthCheckLogger.info('Starting daily health check');

    // Check if there are any active sessions
    if (sessions.size === 0) {
      healthCheckLogger.warn('No active WhatsApp sessions available. Health check aborted.');
      return;
    }

    // Collect system metrics
    const metrics = collectSystemMetrics();
    const message = formatHealthMessage(metrics);

    // Track success and failures
    const results: HealthCheckResults = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Send messages to all recipients
    for (const phoneNumber of HEALTH_CHECK_RECIPIENTS) {
      try {
        await sendHealthCheckMessage(phoneNumber, message);
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({ phoneNumber, error: error.message });
      }
    }

    // Log the final results
    healthCheckLogger.info(`Health check completed: ${results.success} successful, ${results.failed} failed`);
    if (results.failed > 0) {
      healthCheckLogger.warn('Some health check messages failed to send', { errors: results.errors });
    }
  } catch (error: any) {
    healthCheckLogger.error(`Health check failed: ${error.message}`, { error });
  }
};

/**
 * Schedules the daily health check job
 */
const scheduleHealthCheck = (time: string = '0 9 * * *', timezone: string = 'Africa/Johannesburg'): schedule.Job | null => {
  healthCheckLogger.info(`Scheduling daily health check at ${time} (${timezone})`);

  const job = schedule.scheduleJob({ rule: time, tz: timezone }, async () => {
    await runHealthCheck();
  });

  if (job) {
    healthCheckLogger.info(`Health check scheduled successfully. Next run: ${job.nextInvocation()}`);
  } else {
    healthCheckLogger.error('Failed to schedule health check job');
  }

  return job;
};

/**
 * Sets the default session ID to use for sending health check messages
 */
const setDefaultSessionId = (sessionId: string): void => {
  defaultSessionId = sessionId;
  healthCheckLogger.info(`Default session ID set to ${sessionId}`);
};

interface TestHealthCheckResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Tests the health check with a specific session ID
 */
const testHealthCheck = async (sessionId: string, testPhoneNumber: string | null = null): Promise<TestHealthCheckResult> => {
  try {
    healthCheckLogger.info(`Testing health check with session ${sessionId}`);

    // Temporarily set the default session ID
    const originalSessionId = defaultSessionId;
    defaultSessionId = sessionId;

    // Use the first configured recipient if no test number is provided
    const phoneNumber = testPhoneNumber || HEALTH_CHECK_RECIPIENTS[0];

    // Collect system metrics and format message
    const metrics = collectSystemMetrics();
    const message = formatHealthMessage(metrics);

    // Send test message
    const result = await sendHealthCheckMessage(phoneNumber, message);

    // Restore original session ID
    defaultSessionId = originalSessionId;

    healthCheckLogger.info(`Health check test completed successfully to ${phoneNumber}`);
    return { success: true, result };
  } catch (error: any) {
    healthCheckLogger.error(`Health check test failed: ${error.message}`, { error });
    return { success: false, error: error.message };
  }
};

// Export the public API
export {
  scheduleHealthCheck,
  runHealthCheck,
  setDefaultSessionId,
  testHealthCheck,
  HEALTH_CHECK_RECIPIENTS
};
