const app = require('./src/app')
const { baseWebhookURL } = require('./src/config')
const { sessions, flushSessions } = require('./src/sessions')
require('dotenv').config()

// Start the server
const port = process.env.PORT || 3000

// Check if BASE_WEBHOOK_URL environment variable is available
if (!baseWebhookURL) {
  console.error('BASE_WEBHOOK_URL environment variable is not available. Exiting...')
  process.exit(1) // Terminate the application with an error code
}

// Create HTTP server
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})

// Implement graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`)

  // Close all HTTP connections
  server.close(() => {
    console.log('HTTP server closed.')
  })

  try {
    // Log active sessions before shutdown
    console.log(`Active sessions before shutdown: ${sessions.size}`)

    // Save all sessions state
    if (sessions.size > 0) {
      console.log('Closing all active WhatsApp sessions...')
      await flushSessions(false)
      console.log('All sessions terminated.')
    }

    console.log('Graceful shutdown completed.')
    process.exit(0)
  } catch (error) {
    console.error('Error during graceful shutdown:', error)
    process.exit(1)
  }
}

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  // Only exit for severe errors, not for browser-related issues or header issues
  if (!error.message.includes('Protocol error') &&
      !error.message.includes('Target closed') &&
      !error.message.includes('ERR_HTTP_HEADERS_SENT')) {
    gracefulShutdown('uncaughtException')
  }
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit for unhandled rejections, just log them
})
