const fs = require('fs')
const qrcode = require('qrcode-terminal')
const { sessionFolderPath } = require('../config')
const { sendErrorResponse } = require('../utils')
const { sessions } = require('../sessions')
const os = require('os')
const { runHealthCheck, testHealthCheck } = require('../utils/healthCheckScheduler')

/**
 * Responds to ping request with 'I am Alive OKAY!'
 *
 * @function ping
 * @async
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>} - Promise that resolves once response is sent
 * @throws {Object} - Throws error if response fails
 */
const ping = async (req, res) => {
  /*
    #swagger.tags = ['Various']
  */
  try {
    res.json({ success: true, message: 'I am Alive OKAY!' })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Comprehensive health check that reports system and session status
 *
 * @function healthCheck
 * @async
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>} - Promise that resolves once response is sent
 */
const healthCheck = async (req, res) => {
  /*
    #swagger.tags = ['Health']
    #swagger.description = 'Get detailed health information about the API and system'
  */
  try {
    // System metrics
    const systemInfo = {
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
      nodeVersion: process.version
    }

    // Session statistics
    const sessionStats = {
      total: sessions.size,
      status: {}
    }

    // Safely collect session states without exposing sensitive info
    try {
      for (const [, client] of sessions.entries()) {
        try {
          if (client && typeof client.getState === 'function') {
            const state = await client.getState() || 'UNKNOWN'
            sessionStats.status[state] = (sessionStats.status[state] || 0) + 1
          } else {
            sessionStats.status.UNKNOWN = (sessionStats.status.UNKNOWN || 0) + 1
          }
        } catch (err) {
          sessionStats.status.ERROR = (sessionStats.status.ERROR || 0) + 1
        }
      }
    } catch (sessErr) {
      console.error('Error collecting session stats:', sessErr.message)
      sessionStats.error = 'Failed to collect complete session statistics'
    }

    // Only send response if it hasn't been sent yet
    if (!res.headersSent) {
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        service: 'whatsapp-api',
        system: systemInfo,
        sessions: sessionStats
      })
    }
  } catch (error) {
    console.error('Health check error:', error)
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message)
    }
  }
}

/**
 * Example callback function that generates a QR code and writes a log file
 *
 * @function Callback
 * @async
 * @param {Object} req - Express request object containing a body object with dataType and data
 * @param {string} req.body.dataType - Type of data (in this case, 'qr')
 * @param {Object} req.body.data - Data to generate a QR code from
 * @param {Object} res - Express response object
 * @returns {Promise<void>} - Promise that resolves once response is sent
 * @throws {Object} - Throws error if response fails
 */
const Callback = async (req, res) => {
  /*
    #swagger.tags = ['Various']
  */
  try {
    const { dataType, data } = req.body
    if (dataType === 'qr') { qrcode.generate(data.qr, { small: true }) }
    fs.writeFile(`${sessionFolderPath}/message_log.txt`, `${JSON.stringify(req.body)}\r\n`, { flag: 'a+' }, _ => _)
    res.json({ success: true })
  } catch (error) {
    console.log(error)
    fs.writeFile(`${sessionFolderPath}/message_log.txt`, `(ERROR) ${JSON.stringify(error)}\r\n`, { flag: 'a+' }, _ => _)
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Manually triggers a health check that sends WhatsApp messages to configured recipients
 *
 * @function triggerHealthCheck
 * @async
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>} - Promise that resolves once response is sent
 */
const triggerHealthCheck = async (req, res) => {
  /*
    #swagger.tags = ['Health']
    #swagger.description = 'Manually trigger a health check that sends WhatsApp messages to configured recipients'
  */
  try {
    // Run the health check asynchronously
    runHealthCheck()
      .then(() => {
        console.log('Manual health check completed successfully')
      })
      .catch(error => {
        console.error('Manual health check failed:', error)
      })

    // Respond immediately without waiting for the health check to complete
    res.json({
      success: true,
      message: 'Health check triggered. WhatsApp messages will be sent to configured recipients.'
    })
  } catch (error) {
    console.error('Error triggering health check:', error)
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Tests the health check with a specific session
 *
 * @function testHealthCheckWithSession
 * @async
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} req.params.sessionId - The session ID to use for the test
 * @returns {Promise<void>} - Promise that resolves once response is sent
 */
const testHealthCheckWithSession = async (req, res) => {
  /*
    #swagger.tags = ['Health']
    #swagger.description = 'Test the health check with a specific session'
  */
  try {
    const { sessionId } = req.params

    // Check if the session exists
    if (!sessions.has(sessionId)) {
      return sendErrorResponse(res, 404, `Session ${sessionId} not found`)
    }

    // Run the test health check
    const result = await testHealthCheck(sessionId)

    if (result.success) {
      res.json({
        success: true,
        message: `Health check test sent successfully using session ${sessionId}`
      })
    } else {
      sendErrorResponse(res, 500, `Health check test failed: ${result.error}`)
    }
  } catch (error) {
    console.error('Error testing health check:', error)
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = { ping, Callback, healthCheck, triggerHealthCheck, testHealthCheckWithSession }
