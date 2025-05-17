/**
 * Health Check Scheduler Module
 *
 * This module implements a daily health check that sends WhatsApp messages
 * to specified phone numbers with system status information.
 */

const schedule = require('node-schedule')
const os = require('os')
const { createChildLogger } = require('./logger')
const { sessions } = require('../sessions')

// Create a dedicated logger for health checks
const healthCheckLogger = createChildLogger({ module: 'healthCheck' })

// Phone numbers to send health check messages to
const HEALTH_CHECK_RECIPIENTS = [
  '+27681501196',
  '+27660149747'
]

// Default session ID to use for sending messages
// This will be the first available session if not specified
let defaultSessionId = null

/**
 * Formats a phone number to ensure it has the @c.us suffix required by WhatsApp Web
 *
 * @param {string} phoneNumber - The phone number to format
 * @returns {string} - Formatted phone number with @c.us suffix
 */
const formatPhoneNumber = (phoneNumber) => {
  // Remove any non-digit characters except the leading +
  const cleanNumber = phoneNumber.replace(/[^\d+]/g, '')

  // If the number already ends with @c.us, return it as is
  if (cleanNumber.endsWith('@c.us')) {
    return cleanNumber
  }

  // Otherwise, append @c.us
  return `${cleanNumber}@c.us`
}

/**
 * Collects system metrics for the health check message
 *
 * @returns {Object} - Object containing system metrics
 */
const collectSystemMetrics = () => {
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
  }
}

/**
 * Formats system metrics into a readable message
 *
 * @param {Object} metrics - System metrics object
 * @returns {string} - Formatted message
 */
const formatHealthMessage = (metrics) => {
  const uptimeHours = Math.floor(metrics.uptime / 3600)
  const uptimeMinutes = Math.floor((metrics.uptime % 3600) / 60)
  const uptimeDays = Math.floor(uptimeHours / 24)

  return '📊 *WhatsApp API Health Check* 📊\n\n' +
    '✅ *Status:* Operational\n' +
    `⏱️ *Uptime:* ${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes}m\n` +
    `💾 *Memory Usage:* ${Math.round(metrics.memory.used / 1024 / 1024)}MB (${metrics.memory.usagePercent}%)\n` +
    `🔄 *Active Sessions:* ${metrics.activeSessions}\n` +
    `🖥️ *System:* ${metrics.platform} (${metrics.nodeVersion})\n` +
    `⏰ *Timestamp:* ${new Date().toISOString()}\n`
}

/**
 * Sends a health check message to a specific phone number
 *
 * @param {string} phoneNumber - The phone number to send the message to
 * @param {string} message - The message to send
 * @returns {Promise<Object>} - Promise that resolves with the message result
 * @throws {Error} - Throws an error if the message fails to send
 */
const sendHealthCheckMessage = async (phoneNumber, message) => {
  try {
    // Get the first available session if defaultSessionId is not set
    if (!defaultSessionId) {
      const sessionIds = Array.from(sessions.keys())
      if (sessionIds.length === 0) {
        throw new Error('No active WhatsApp sessions available')
      }
      defaultSessionId = sessionIds[0]
    }

    const client = sessions.get(defaultSessionId)
    if (!client) {
      throw new Error(`Session ${defaultSessionId} not found`)
    }

    const formattedNumber = formatPhoneNumber(phoneNumber)
    healthCheckLogger.info(`Sending health check to ${formattedNumber}`)

    const result = await client.sendMessage(formattedNumber, message)
    healthCheckLogger.info(`Health check sent successfully to ${phoneNumber}`)
    return result
  } catch (error) {
    healthCheckLogger.error(`Failed to send health check to ${phoneNumber}: ${error.message}`, { error })
    throw error
  }
}

/**
 * Runs the health check and sends messages to all configured recipients
 *
 * @returns {Promise<void>} - Promise that resolves when all messages are sent
 */
const runHealthCheck = async () => {
  try {
    healthCheckLogger.info('Starting daily health check')

    // Check if there are any active sessions
    if (sessions.size === 0) {
      healthCheckLogger.warn('No active WhatsApp sessions available. Health check aborted.')
      return
    }

    // Collect system metrics
    const metrics = collectSystemMetrics()
    const message = formatHealthMessage(metrics)

    // Track success and failures
    const results = {
      success: 0,
      failed: 0,
      errors: []
    }

    // Send messages to all recipients
    for (const phoneNumber of HEALTH_CHECK_RECIPIENTS) {
      try {
        await sendHealthCheckMessage(phoneNumber, message)
        results.success++
      } catch (error) {
        results.failed++
        results.errors.push({ phoneNumber, error: error.message })
      }
    }

    // Log the final results
    healthCheckLogger.info(`Health check completed: ${results.success} successful, ${results.failed} failed`)
    if (results.failed > 0) {
      healthCheckLogger.warn('Some health check messages failed to send', { errors: results.errors })
    }
  } catch (error) {
    healthCheckLogger.error(`Health check failed: ${error.message}`, { error })
  }
}

/**
 * Schedules the daily health check job
 *
 * @param {string} [time='0 9 * * *'] - Cron expression for when to run the health check (default: 9:00 AM daily)
 * @param {string} [timezone='Africa/Johannesburg'] - Timezone for the cron expression (default: SAST)
 * @returns {Object} - The scheduled job object
 */
const scheduleHealthCheck = (time = '0 9 * * *', timezone = 'Africa/Johannesburg') => {
  healthCheckLogger.info(`Scheduling daily health check at ${time} (${timezone})`)

  const job = schedule.scheduleJob({ rule: time, tz: timezone }, async () => {
    await runHealthCheck()
  })

  if (job) {
    healthCheckLogger.info(`Health check scheduled successfully. Next run: ${job.nextInvocation()}`)
  } else {
    healthCheckLogger.error('Failed to schedule health check job')
  }

  return job
}

/**
 * Sets the default session ID to use for sending health check messages
 *
 * @param {string} sessionId - The session ID to use
 */
const setDefaultSessionId = (sessionId) => {
  defaultSessionId = sessionId
  healthCheckLogger.info(`Default session ID set to ${sessionId}`)
}

/**
 * Tests the health check with a specific session ID
 *
 * @param {string} sessionId - The session ID to use for the test
 * @param {string} [testPhoneNumber] - Optional test phone number to send to (defaults to first configured recipient)
 * @returns {Promise<Object>} - Promise that resolves with the test result
 */
const testHealthCheck = async (sessionId, testPhoneNumber = null) => {
  try {
    healthCheckLogger.info(`Testing health check with session ${sessionId}`)

    // Temporarily set the default session ID
    const originalSessionId = defaultSessionId
    defaultSessionId = sessionId

    // Use the first configured recipient if no test number is provided
    const phoneNumber = testPhoneNumber || HEALTH_CHECK_RECIPIENTS[0]

    // Collect system metrics and format message
    const metrics = collectSystemMetrics()
    const message = formatHealthMessage(metrics)

    // Send test message
    const result = await sendHealthCheckMessage(phoneNumber, message)

    // Restore original session ID
    defaultSessionId = originalSessionId

    healthCheckLogger.info(`Health check test completed successfully to ${phoneNumber}`)
    return { success: true, result }
  } catch (error) {
    healthCheckLogger.error(`Health check test failed: ${error.message}`, { error })
    return { success: false, error: error.message }
  }
}

// Export the public API
module.exports = {
  scheduleHealthCheck,
  runHealthCheck,
  setDefaultSessionId,
  testHealthCheck,
  HEALTH_CHECK_RECIPIENTS
}
