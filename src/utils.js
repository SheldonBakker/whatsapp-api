const axios = require('axios')
const { globalApiKey, disabledCallbacks } = require('./config')

// Circuit breaker implementation for external API calls
class CircuitBreaker {
  constructor (failureThreshold = 3, resetTimeout = 30000) {
    this.failureThreshold = failureThreshold
    this.resetTimeout = resetTimeout
    this.state = 'CLOSED'
    this.failureCount = 0
    this.nextAttempt = Date.now()
  }

  async exec (fn, fallback) {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        // Half-open state - try one request
        this.state = 'HALF-OPEN'
      } else {
        return fallback()
      }
    }

    try {
      const response = await fn()
      this.onSuccess()
      return response
    } catch (error) {
      this.onFailure()
      return fallback(error)
    }
  }

  onSuccess () {
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  onFailure () {
    this.failureCount++
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF-OPEN') {
      this.state = 'OPEN'
      this.nextAttempt = Date.now() + this.resetTimeout
    }
  }
}

// Create circuit breaker for webhook requests
const webhookCircuitBreaker = new CircuitBreaker()

// Trigger webhook endpoint with circuit breaker
const triggerWebhook = (webhookURL, sessionId, dataType, data) => {
  webhookCircuitBreaker.exec(
    // Primary function
    () => axios.post(webhookURL, { dataType, data, sessionId }, {
      headers: { 'x-api-key': globalApiKey },
      timeout: 10000 // Add timeout to prevent hanging requests
    }),
    // Fallback function
    (error) => {
      const errorMsg = error ? error.message : 'Circuit is open'
      console.error(`Failed to send webhook (${sessionId}, ${dataType}): ${errorMsg}`)
    }
  )
}

// Function to send a response with error status and message
const sendErrorResponse = (res, status, message) => {
  res.status(status).json({ success: false, error: message })
}

// Function to wait for a specific item not to be null
const waitForNestedObject = (rootObj, nestedPath, maxWaitTime = 10000, interval = 100) => {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const checkObject = () => {
      const nestedObj = nestedPath.split('.').reduce((obj, key) => obj ? obj[key] : undefined, rootObj)
      if (nestedObj) {
        // Nested object exists, resolve the promise
        resolve()
      } else if (Date.now() - start > maxWaitTime) {
        // Maximum wait time exceeded, reject the promise
        console.log('Timed out waiting for nested object')
        reject(new Error('Timeout waiting for nested object'))
      } else {
        // Nested object not yet created, continue waiting
        setTimeout(checkObject, interval)
      }
    }
    checkObject()
  })
}

const checkIfEventisEnabled = (event) => {
  return new Promise((resolve, reject) => { if (!disabledCallbacks.includes(event)) { resolve() } })
}

module.exports = {
  triggerWebhook,
  sendErrorResponse,
  waitForNestedObject,
  checkIfEventisEnabled,
  CircuitBreaker
}
