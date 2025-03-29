// Load environment variables first
require('dotenv').config()

require('./routes')
const { restoreSessions } = require('./sessions')
const { routes } = require('./routes')
const app = require('express')()
const bodyParser = require('body-parser')
const { maxAttachmentSize } = require('./config')

// Request logger middleware
const requestLogger = (req, res, next) => {
  // Add request ID for tracking
  req.requestId = Math.random().toString(36).substring(2, 15)

  // Start time tracking
  const start = Date.now()

  // Log request
  console.log(`[${req.requestId}] ${req.method} ${req.originalUrl} [STARTED]`)

  // Safe event handlers that won't throw if headers are already sent
  const onFinish = () => {
    try {
      const duration = Date.now() - start
      console.log(
        `[${req.requestId}] ${req.method} ${req.originalUrl} [FINISHED] ${res.statusCode} ${duration}ms`
      )
    } catch (err) {
      console.error(`Error logging request finish: ${err.message}`)
    }
  }

  const onError = (error) => {
    try {
      const duration = Date.now() - start
      console.error(
        `[${req.requestId}] ${req.method} ${req.originalUrl} [ERROR] ${error.message} ${duration}ms`
      )
    } catch (err) {
      console.error(`Error logging request error: ${err.message}`)
    }
  }

  // Track response events safely
  res.on('finish', onFinish)
  res.on('error', onError)

  next()
}

// Add response time header middleware
const addResponseTime = (req, res, next) => {
  const start = Date.now()

  // Store the original end method
  const originalEnd = res.end

  // Override the end method
  res.end = function (chunk, encoding) {
    // Calculate duration
    const duration = Date.now() - start

    // Try to set the header if headers haven't been sent yet
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`)
    }

    // Call the original end method
    return originalEnd.call(this, chunk, encoding)
  }

  next()
}

// CORS middleware to disable CORS restrictions
const disableCors = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  next()
}

// Initialize Express app
app.disable('x-powered-by')
app.use(requestLogger)
app.use(addResponseTime)
app.use(disableCors) // Add CORS middleware
app.use(bodyParser.json({ limit: maxAttachmentSize + 1000000 }))
app.use(bodyParser.urlencoded({ limit: maxAttachmentSize + 1000000, extended: true }))
app.use('/', routes)

restoreSessions()

module.exports = app
